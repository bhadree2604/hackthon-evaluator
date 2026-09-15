import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  requireAdmin,
  requireEvaluator,
  requireRole,
  requireStaff,
  type Ctx,
} from "./lib/guards";
import { activeCriteria, countedRounds, maxTotalFor } from "./rounds";

/**
 * Scoring.
 *
 * One sheet per (round, team, evaluator). A round's mark for a team is the
 * average of the submitted sheets in that round; the cumulative is those round
 * percentages combined by round weight. Drafts never count, so a half-filled
 * sheet can never move a team up the board.
 */

type ScoreValue = { key: string; value: number };

function tally(criteria: Doc<"criteria">[], values: ScoreValue[]) {
  const byKey = new Map(values.map((entry) => [entry.key, entry.value]));
  let total = 0;
  for (const c of criteria) {
    total += (byKey.get(c.key) ?? 0) * c.weight;
  }
  const maxTotal = maxTotalFor(criteria);
  return { total, maxTotal, percent: maxTotal ? (total / maxTotal) * 100 : 0 };
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function requireRound(ctx: Ctx, roundId: Id<"rounds">) {
  const round = await ctx.db.get(roundId);
  if (!round) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That evaluation round is gone." });
  }
  return round;
}

async function roundScores(ctx: Ctx, roundId: Id<"rounds">) {
  return ctx.db
    .query("scores")
    .withIndex("by_round", (q) => q.eq("roundId", roundId))
    .collect();
}

/* -------------------------------------------------------------------------- */
/* Evaluator: one sheet                                                        */
/* -------------------------------------------------------------------------- */

/** The evaluator's own sheet for a team in a round, merged with the rubric. */
export const mySheet = query({
  args: { roundId: v.id("rounds"), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const profile = await requireEvaluator(ctx);
    const round = await requireRound(ctx, args.roundId);
    const criteria = await activeCriteria(ctx);

    const existing = await ctx.db
      .query("scores")
      .withIndex("by_round_team_evaluator", (q) =>
        q.eq("roundId", args.roundId).eq("teamId", args.teamId).eq("evaluatorId", profile._id),
      )
      .unique();

    const byKey = new Map((existing?.values ?? []).map((entry) => [entry.key, entry.value]));

    return {
      round: {
        _id: round._id,
        name: round.name,
        description: round.description ?? null,
        weight: round.weight,
        status: round.status,
      },
      criteria: criteria.map((c) => ({
        key: c.key,
        label: c.label,
        description: c.description ?? null,
        maxScore: c.maxScore,
        weight: c.weight,
        value: byKey.get(c.key) ?? null,
      })),
      notes: existing?.notes ?? "",
      submitted: existing?.submitted ?? false,
      total: existing?.total ?? null,
      percent: existing?.percent ?? null,
      updatedAt: existing?.updatedAt ?? null,
      maxTotal: maxTotalFor(criteria),
      /** False when the round is locked or still a draft: the UI goes read-only. */
      editable: round.status === "open",
    };
  },
});

export const save = mutation({
  args: {
    roundId: v.id("rounds"),
    teamId: v.id("teams"),
    values: v.array(v.object({ key: v.string(), value: v.number() })),
    notes: v.optional(v.string()),
    submit: v.boolean(),
  },
  handler: async (ctx, args) => {
    const profile = await requireEvaluator(ctx);
    const round = await requireRound(ctx, args.roundId);

    if (round.status !== "open") {
      throw new ConvexError({
        code: "ROUND_CLOSED",
        message:
          round.status === "draft"
            ? `${round.name} has not been opened yet.`
            : `${round.name} is locked. Ask an organiser to reopen it.`,
      });
    }

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new ConvexError({ code: "NOT_FOUND", message: "Team not found." });
    if (team.status !== "active") {
      throw new ConvexError({
        code: "INACTIVE",
        message: `${team.name} is marked ${team.status} and cannot be scored.`,
      });
    }

    const criteria = await activeCriteria(ctx);
    if (criteria.length === 0) {
      throw new ConvexError({
        code: "NO_RUBRIC",
        message: "No scoring criteria have been configured yet.",
      });
    }

    const allowed = new Map(criteria.map((c) => [c.key, c]));
    const clean: ScoreValue[] = [];
    for (const entry of args.values) {
      const criterion = allowed.get(entry.key);
      if (!criterion) continue;
      if (!Number.isFinite(entry.value)) {
        throw new ConvexError({ code: "BAD_INPUT", message: "Scores must be numbers." });
      }
      if (entry.value < 0 || entry.value > criterion.maxScore) {
        throw new ConvexError({
          code: "OUT_OF_RANGE",
          message: `${criterion.label} must be between 0 and ${criterion.maxScore}.`,
        });
      }
      clean.push({ key: entry.key, value: Math.round(entry.value * 100) / 100 });
    }

    if (args.submit && clean.length !== criteria.length) {
      throw new ConvexError({
        code: "INCOMPLETE",
        message: "Fill in every criterion before submitting.",
      });
    }

    const { total, maxTotal, percent } = tally(criteria, clean);
    const now = Date.now();

    const existing = await ctx.db
      .query("scores")
      .withIndex("by_round_team_evaluator", (q) =>
        q.eq("roundId", args.roundId).eq("teamId", args.teamId).eq("evaluatorId", profile._id),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        values: clean,
        total,
        maxTotal,
        percent,
        notes: args.notes?.trim() || undefined,
        submitted: args.submit,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("scores", {
        roundId: args.roundId,
        teamId: args.teamId,
        evaluatorId: profile._id,
        values: clean,
        total,
        maxTotal,
        percent,
        notes: args.notes?.trim() || undefined,
        submitted: args.submit,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { total, maxTotal, percent, submitted: args.submit, roundName: round.name };
  },
});

/** How far through the panel the evaluator is, for one round. */
export const myProgress = query({
  args: { roundId: v.optional(v.id("rounds")) },
  handler: async (ctx, args) => {
    const profile = await requireEvaluator(ctx);
    const teams = (await ctx.db.query("teams").collect()).filter((t) => t.status === "active");
    const roundId = args.roundId;

    const mine = roundId
      ? await ctx.db
          .query("scores")
          .withIndex("by_round_evaluator", (q) =>
            q.eq("roundId", roundId).eq("evaluatorId", profile._id),
          )
          .collect()
      : await ctx.db
          .query("scores")
          .withIndex("by_evaluator", (q) => q.eq("evaluatorId", profile._id))
          .collect();

    const submitted = mine.filter((s) => s.submitted);
    const drafts = mine.filter((s) => !s.submitted);

    return {
      totalTeams: teams.length,
      submitted: submitted.length,
      drafts: drafts.length,
      remaining: Math.max(0, teams.length - submitted.length),
      averagePercent: average(submitted.map((s) => s.percent)),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Standings                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every counted round's result for every team, plus the cumulative.
 *
 * The cumulative is the rounds added together, not averaged:
 *
 *   a sheet          Σ (mark × criterion weight)          → 0 … maxTotal
 *   a round's mark   mean of the submitted sheets          → 0 … maxTotal
 *   the cumulative   Σ (round mark × round weight)         → 0 … maxPoints
 *
 * With ten criteria of ten marks and three rounds of weight one, that is a
 * board out of 300 where each round contributes up to 100.
 *
 * `cumulativePoints` treats a round the team was never scored in as zero,
 * which is the number the final standings rank on. `scoredPercent` divides by
 * the weight of the rounds actually scored, so the board still reads sensibly
 * while the event is only part way through.
 */
export async function computeStandings(ctx: Ctx, viewerId: Id<"profiles"> | null) {
  const rounds = await countedRounds(ctx);
  const criteria = await activeCriteria(ctx);
  const maxTotal = maxTotalFor(criteria);
  const teams = (await ctx.db.query("teams").collect()).filter((t) => t.status === "active");
  const labs = await ctx.db.query("labs").collect();
  const labById = new Map(labs.map((l) => [l._id, l]));

  // One read per round, not one per (round, team).
  const sheetsByRound = new Map<Id<"rounds">, Doc<"scores">[]>();
  for (const round of rounds) {
    sheetsByRound.set(round._id, await roundScores(ctx, round._id));
  }

  /** The most a team can hold once every round is in. */
  const maxPoints = rounds.reduce((sum, r) => sum + maxTotal * r.weight, 0);

  const rows = teams.map((team) => {
    let cumulativePoints = 0;
    let weightedPercent = 0;
    let scoredWeight = 0;
    let sheets = 0;
    let scoredByMe = false;

    const perRound = rounds.map((round) => {
      const all = (sheetsByRound.get(round._id) ?? []).filter((s) => s.teamId === team._id);
      const submitted = all.filter((s) => s.submitted);
      const percent = average(submitted.map((s) => s.percent));

      sheets += submitted.length;
      if (viewerId && all.some((s) => s.evaluatorId === viewerId && s.submitted)) {
        scoredByMe = true;
      }

      /**
       * Taken from the percentage rather than the stored total, so a sheet
       * written before the rubric grew still lands on the current scale.
       */
      const points = percent === null ? null : (percent / 100) * maxTotal;

      if (percent !== null && points !== null) {
        cumulativePoints += points * round.weight;
        weightedPercent += percent * round.weight;
        scoredWeight += round.weight;
      }

      return {
        roundId: round._id,
        name: round.name,
        order: round.order,
        weight: round.weight,
        status: round.status,
        percent,
        points,
        total: average(submitted.map((s) => s.total)),
        maxTotal,
        sheets: submitted.length,
        drafts: all.length - submitted.length,
      };
    });

    const breakdown = criteria.map((c) => {
      const values: number[] = [];
      for (const round of rounds) {
        for (const sheet of sheetsByRound.get(round._id) ?? []) {
          if (sheet.teamId !== team._id || !sheet.submitted) continue;
          const found = sheet.values.find((entry) => entry.key === c.key);
          if (typeof found?.value === "number") values.push(found.value);
        }
      }
      return { key: c.key, label: c.label, maxScore: c.maxScore, average: average(values) };
    });

    return {
      teamId: team._id,
      code: team.code,
      name: team.name,
      projectTitle: team.projectTitle ?? null,
      labName: team.labId ? (labById.get(team.labId)?.name ?? null) : null,
      track: team.track ?? null,
      /** Breaks a tie when two teams finish level on everything else. */
      registeredAt: team.registeredAt ?? null,
      perRound,
      breakdown,
      sheets,
      scored: scoredWeight > 0,
      scoredByMe,
      roundsScored: perRound.filter((r) => r.percent !== null).length,
      roundsCounted: rounds.length,
      /** The board number: rounds added up, an unscored round counting zero. */
      cumulativePoints,
      maxPoints,
      cumulativePercent: maxPoints > 0 ? (cumulativePoints / maxPoints) * 100 : null,
      /** Mid-event view: only the rounds this team has actually been scored in. */
      scoredPercent: scoredWeight > 0 ? weightedPercent / scoredWeight : null,
    };
  });

  return {
    rounds: rounds.map((r) => ({
      _id: r._id,
      name: r.name,
      order: r.order,
      weight: r.weight,
      status: r.status,
      maxTotal,
    })),
    maxTotal,
    maxPoints,
    rows,
  };
}

type Standing = Awaited<ReturnType<typeof computeStandings>>["rows"][number];

/**
 * Final ordering. Cumulative points decide it; a tie falls to the later round,
 * because the last round is the one the teams demo in, then to whoever
 * registered first so the result is always decided.
 */
export function compareStandings(a: Standing, b: Standing) {
  if (b.cumulativePoints !== a.cumulativePoints) {
    return b.cumulativePoints - a.cumulativePoints;
  }

  // Latest round first: winning the final demo breaks the tie.
  for (let i = a.perRound.length - 1; i >= 0; i--) {
    const mine = a.perRound[i]?.percent ?? -1;
    const theirs = b.perRound[i]?.percent ?? -1;
    if (mine !== theirs) return theirs - mine;
  }

  const registeredA = a.registeredAt ?? Number.MAX_SAFE_INTEGER;
  const registeredB = b.registeredAt ?? Number.MAX_SAFE_INTEGER;
  if (registeredA !== registeredB) return registeredA - registeredB;

  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

/**
 * Ranked standings. With no `roundId` this is the cumulative board, which is
 * the one that decides the winners; with a `roundId` it ranks that round only.
 */
export const leaderboard = query({
  args: { roundId: v.optional(v.id("rounds")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireRole(ctx, ["evaluator", "admin"]);
    const { rounds, maxTotal, maxPoints, rows } = await computeStandings(ctx, profile._id);
    const roundId = args.roundId;

    const ranked = rows
      .map((row) => {
        const round = roundId ? row.perRound.find((r) => r.roundId === roundId) : undefined;
        return {
          ...row,
          roundPercent: round?.percent ?? null,
          roundPoints: round?.points ?? null,
          sortKey: roundId ? (round?.percent ?? null) : row.cumulativePoints,
        };
      })
      .sort((a, b) => {
        // A single round ranks on that round; the cumulative uses the tie-breaks.
        if (roundId) {
          return (
            (b.sortKey ?? -1) - (a.sortKey ?? -1) ||
            b.sheets - a.sheets ||
            a.code.localeCompare(b.code, undefined, { numeric: true })
          );
        }
        return compareStandings(a, b);
      })
      .map((row, index) => ({
        ...row,
        // An unscored team is listed but never given a placing.
        rank: row.scored ? index + 1 : null,
      }));

    return {
      rounds,
      maxTotal,
      maxPoints,
      roundId: args.roundId ?? null,
      rows: args.limit ? ranked.slice(0, args.limit) : ranked,
    };
  },
});

/** Per-round detail for one team: what it scored, and what the viewer owes. */
export const teamRounds = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;

    const rounds = await ctx.db.query("rounds").withIndex("by_order").collect();
    const criteria = await activeCriteria(ctx);
    const maxTotal = maxTotalFor(criteria);
    const canSeeMarks = profile.role === "admin" || profile.role === "evaluator";
    const visible = rounds.filter((r) => profile.role === "admin" || r.status !== "draft");

    const rows = await Promise.all(
      visible.map(async (round) => {
        const all = await ctx.db
          .query("scores")
          .withIndex("by_round_team", (q) => q.eq("roundId", round._id).eq("teamId", args.teamId))
          .collect();
        const submitted = all.filter((s) => s.submitted);
        const mine = all.find((s) => s.evaluatorId === profile._id);

        return {
          roundId: round._id,
          name: round.name,
          description: round.description ?? null,
          order: round.order,
          weight: round.weight,
          status: round.status,
          maxTotal,
          percent: canSeeMarks ? average(submitted.map((s) => s.percent)) : null,
          total: canSeeMarks ? average(submitted.map((s) => s.total)) : null,
          sheets: submitted.length,
          myState: mine ? (mine.submitted ? ("submitted" as const) : ("draft" as const)) : null,
          myTotal: mine?.total ?? null,
          myPercent: mine?.percent ?? null,
        };
      }),
    );

    return {
      team: { _id: team._id, code: team.code, name: team.name, status: team.status },
      rounds: rows,
    };
  },
});

/** Admin only: every evaluator sheet for a team in one round, side by side. */
export const panel = query({
  args: { teamId: v.id("teams"), roundId: v.optional(v.id("rounds")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const roundId = args.roundId;

    const scores = roundId
      ? await ctx.db
          .query("scores")
          .withIndex("by_round_team", (q) => q.eq("roundId", roundId).eq("teamId", args.teamId))
          .collect()
      : await ctx.db
          .query("scores")
          .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
          .collect();

    const rounds = await ctx.db.query("rounds").collect();
    const roundById = new Map(rounds.map((r) => [r._id, r]));

    return Promise.all(
      scores.map(async (s) => {
        const evaluator = await ctx.db.get(s.evaluatorId);
        const round = s.roundId ? roundById.get(s.roundId) : undefined;
        return {
          _id: s._id,
          roundId: s.roundId ?? null,
          roundName: round?.name ?? "Unassigned",
          evaluatorName: evaluator?.name ?? "Evaluator",
          evaluatorEmail: evaluator?.email ?? null,
          values: s.values,
          total: s.total,
          maxTotal: s.maxTotal,
          percent: s.percent,
          notes: s.notes ?? null,
          submitted: s.submitted,
          updatedAt: s.updatedAt,
        };
      }),
    );
  },
});

/** Used by the coordinator profile card, which never shows marks. */
export const scoringOpen = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "scoringOpen"))
      .unique();
    return setting?.value !== false;
  },
});
