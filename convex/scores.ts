import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  isMasterAdmin,
  requireAdmin,
  requireEvaluator,
  requireMasterAdmin,
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
      /**
       * Who is signing, and never pre-filled.
       *
       * A fresh sheet comes back with an empty signature so the evaluator has
       * to type who is actually scoring this team. The two conveniences that
       * used to fill it in were both wrong in the case the signature exists
       * for: the account's own name is not who is in the room when a panel
       * shares one login, and the previous sheet's name is right up until the
       * moment the panel swaps over, which is exactly when a pre-filled box
       * gets signed by accident. Only what was already signed on *this* sheet
       * comes back, so re-opening a sheet to change a mark still shows its own
       * signature rather than making it be typed twice.
       */
      evaluatorName: existing?.evaluatorName ?? "",
      /** The account the sheet is written from. Never editable. */
      evaluatorEmail: profile.email,
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
    /**
     * The evaluator signs the sheet by name. A panel shares a login more often
     * than anyone admits, so the account alone does not say who was in the
     * room; this is the answer to "who scored this team in this round".
     */
    evaluatorName: v.string(),
    notes: v.optional(v.string()),
    submit: v.boolean(),
  },
  handler: async (ctx, args) => {
    const profile = await requireEvaluator(ctx);
    const round = await requireRound(ctx, args.roundId);

    const evaluatorName = args.evaluatorName.trim();
    if (!evaluatorName) {
      throw new ConvexError({
        code: "NO_SIGNATURE",
        message: "Enter your name before scoring this team.",
      });
    }

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

    /** Stamped on every save, so a rename never rewrites history. */
    const stamp = {
      evaluatorName,
      evaluatorEmail: profile.email,
      teamCode: team.code,
      teamName: team.name,
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...stamp,
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
        ...stamp,
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

    return {
      total,
      maxTotal,
      percent,
      submitted: args.submit,
      roundName: round.name,
      teamName: team.name,
      evaluatorName,
    };
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
          /** What was signed on the sheet; the account name is the fallback. */
          evaluatorName: s.evaluatorName ?? evaluator?.name ?? "Evaluator",
          evaluatorEmail: s.evaluatorEmail ?? evaluator?.email ?? null,
          /** The account it was written from, even if the sheet was signed differently. */
          evaluatorAccountName: evaluator?.name ?? null,
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

/**
 * Admin only: the roll of who evaluated what, for one round.
 *
 * The leaderboard answers "what did this team score"; this answers "who gave
 * it". One row per sheet, carrying the name the evaluator signed, the account
 * it came from and the team as it was named at the time, so a disputed mark
 * can be traced back to a person rather than to a login.
 */
export const roundSheets = query({
  args: {
    roundId: v.id("rounds"),
    teamId: v.optional(v.id("teams")),
    /** Drafts are included by default so a half-finished panel is visible. */
    submittedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await requireAdmin(ctx);
    const round = await requireRound(ctx, args.roundId);
    const criteria = await activeCriteria(ctx);

    const teamId = args.teamId;
    const sheets = teamId
      ? await ctx.db
          .query("scores")
          .withIndex("by_round_team", (q) => q.eq("roundId", args.roundId).eq("teamId", teamId))
          .collect()
      : await roundScores(ctx, args.roundId);

    const wanted = args.submittedOnly ? sheets.filter((sheet) => sheet.submitted) : sheets;

    const rows = await Promise.all(
      wanted.map(async (sheet) => {
        const evaluator = await ctx.db.get(sheet.evaluatorId);
        const team = await ctx.db.get(sheet.teamId);
        return {
          _id: sheet._id,
          teamId: sheet.teamId,
          /** The team as it is now, falling back to the name on the sheet. */
          teamCode: team?.code ?? sheet.teamCode ?? "—",
          teamName: team?.name ?? sheet.teamName ?? "Removed team",
          evaluatorId: sheet.evaluatorId,
          /** Signed on the sheet. The account name is only the fallback. */
          evaluatorName: sheet.evaluatorName ?? evaluator?.name ?? "Evaluator",
          /** The login the sheet was written from. */
          evaluatorEmail: sheet.evaluatorEmail ?? evaluator?.email ?? null,
          /**
           * Set only when the signature and the account disagree, which is the
           * case worth looking at: one login, several people on the panel.
           */
          signedForAnother:
            !!sheet.evaluatorName &&
            !!evaluator &&
            sheet.evaluatorName.trim().toLowerCase() !== evaluator.name.trim().toLowerCase()
              ? evaluator.name
              : null,
          /** The marks themselves, so the master organiser can correct one. */
          values: sheet.values,
          total: sheet.total,
          maxTotal: sheet.maxTotal,
          percent: sheet.percent,
          notes: sheet.notes ?? null,
          submitted: sheet.submitted,
          updatedAt: sheet.updatedAt,
        };
      }),
    );

    rows.sort(
      (a, b) =>
        a.teamCode.localeCompare(b.teamCode, undefined, { numeric: true }) ||
        a.evaluatorName.localeCompare(b.evaluatorName),
    );

    const evaluators = new Set(rows.filter((r) => r.submitted).map((r) => r.evaluatorId));
    const teamsScored = new Set(rows.filter((r) => r.submitted).map((r) => r.teamId));

    return {
      round: { _id: round._id, name: round.name, status: round.status, weight: round.weight },
      rows,
      /** The rubric the editor renders against, in rubric order. */
      criteria: criteria.map((c) => ({
        key: c.key,
        label: c.label,
        maxScore: c.maxScore,
        weight: c.weight,
      })),
      maxTotal: maxTotalFor(criteria),
      /**
       * Whether this organiser may change what is listed here. Every organiser
       * can read the roll; only the master organiser named by
       * MASTER_ADMIN_EMAIL can rewrite or delete a sheet, so the controls are
       * not rendered for anyone else. The server checks it again on the way in
       * — this flag only decides whether the buttons are worth showing.
       */
      canManage: isMasterAdmin(profile),
      submitted: rows.filter((r) => r.submitted).length,
      drafts: rows.filter((r) => !r.submitted).length,
      evaluators: evaluators.size,
      teamsScored: teamsScored.size,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Master organiser: correcting the record                                     */
/* -------------------------------------------------------------------------- */

/**
 * Rewrite a sheet an evaluator has already signed. Master organiser only.
 *
 * This is the one action in the app that can change a team's result without
 * the evaluator who signed it being involved, so it is held to the account
 * named by MASTER_ADMIN_EMAIL rather than to the organiser role — see
 * `requireMasterAdmin`. Unlike `save` it does not care whether the round is
 * open: a locked round is precisely when a disputed mark gets corrected, and
 * reopening the round to fix one number would let thirty other sheets move
 * too.
 *
 * Every field is optional and only what is passed is touched, so correcting a
 * misspelt signature cannot disturb the marks.
 */
export const updateSheet = mutation({
  args: {
    sheetId: v.id("scores"),
    values: v.optional(v.array(v.object({ key: v.string(), value: v.number() }))),
    evaluatorName: v.optional(v.string()),
    notes: v.optional(v.string()),
    submitted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireMasterAdmin(ctx);

    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "That sheet has already been removed.",
      });
    }

    const criteria = await activeCriteria(ctx);
    const patch: {
      updatedAt: number;
      evaluatorName?: string;
      values?: ScoreValue[];
      total?: number;
      maxTotal?: number;
      percent?: number;
      notes?: string | undefined;
      submitted?: boolean;
    } = { updatedAt: Date.now() };

    if (args.evaluatorName !== undefined) {
      const name = args.evaluatorName.trim();
      if (!name) {
        throw new ConvexError({
          code: "NO_SIGNATURE",
          message: "A sheet has to stay signed by somebody.",
        });
      }
      patch.evaluatorName = name;
    }

    /** What the sheet will hold once this patch lands, for the submit check. */
    const submitted = args.submitted ?? sheet.submitted;

    if (args.values) {
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

      if (submitted && clean.length !== criteria.length) {
        throw new ConvexError({
          code: "INCOMPLETE",
          message: "A submitted sheet has to carry every criterion.",
        });
      }

      const tallied = tally(criteria, clean);
      patch.values = clean;
      patch.total = tallied.total;
      patch.maxTotal = tallied.maxTotal;
      patch.percent = tallied.percent;
    } else if (args.submitted === true && sheet.values.length !== criteria.length) {
      // Promoting a draft without touching its marks: it still has to be whole.
      throw new ConvexError({
        code: "INCOMPLETE",
        message: "That draft is missing criteria, so it cannot be submitted as it stands.",
      });
    }

    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    if (args.submitted !== undefined) patch.submitted = args.submitted;

    await ctx.db.patch(args.sheetId, patch);

    return {
      evaluatorName: patch.evaluatorName ?? sheet.evaluatorName ?? "This sheet",
      teamName: sheet.teamName ?? "the team",
      total: patch.total ?? sheet.total,
      maxTotal: patch.maxTotal ?? sheet.maxTotal,
      submitted,
    };
  },
});

/**
 * Delete a sheet outright. Master organiser only.
 *
 * A round's mark is the mean of its submitted sheets, so removing one moves
 * the team: this is for a sheet that should never have existed — a duplicate,
 * or one written against the wrong team — rather than for a mark somebody
 * disagrees with. There is no undo, which is why the screen asks first.
 */
export const removeSheet = mutation({
  args: { sheetId: v.id("scores") },
  handler: async (ctx, args) => {
    await requireMasterAdmin(ctx);

    const sheet = await ctx.db.get(args.sheetId);
    /** Already gone: two taps on a slow connection should not be an error. */
    if (!sheet) return { removed: false, evaluatorName: "That sheet", teamName: "the team" };

    const team = await ctx.db.get(sheet.teamId);
    await ctx.db.delete(args.sheetId);

    return {
      removed: true,
      evaluatorName: sheet.evaluatorName ?? "That sheet",
      teamName: team?.name ?? sheet.teamName ?? "the team",
    };
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
