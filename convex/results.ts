import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  requireAdmin,
  requireOwnTeam,
  requireProfile,
  requireStaff,
  type Ctx,
} from "./lib/guards";
import { countedRounds } from "./rounds";
import { compareStandings, computeStandings } from "./scores";

/**
 * Final results.
 *
 * Marks are worked out round by round all weekend, but teams see nothing until
 * an organiser publishes once, at the end. There is no per-round release: the
 * only thing a team is ever shown is the cumulative, with the rounds that make
 * it up listed underneath.
 *
 * The switch lives in `settings` under this key rather than on each round, so
 * there is exactly one thing to get right on the night.
 */
const RESULTS_KEY = "resultsPublished";

type PublishedState = {
  published: boolean;
  publishedAt: number | null;
  publishedBy: Id<"profiles"> | null;
};

const HIDDEN: PublishedState = { published: false, publishedAt: null, publishedBy: null };

async function readPublished(ctx: Ctx): Promise<PublishedState> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", RESULTS_KEY))
    .unique();
  if (!row) return HIDDEN;

  const value = row.value as Partial<PublishedState> | null;
  return {
    published: value?.published === true,
    publishedAt: value?.publishedAt ?? null,
    publishedBy: value?.publishedBy ?? null,
  };
}

/** Ranked rows, the same maths for organisers and participants alike. */
async function rankedStandings(ctx: Ctx, viewerId: Id<"profiles"> | null) {
  const standings = await computeStandings(ctx, viewerId);
  const ranked = [...standings.rows].sort(compareStandings).map((row, index) => ({
    ...row,
    rank: row.scored ? index + 1 : null,
  }));
  return { ...standings, rows: ranked };
}

/* -------------------------------------------------------------------------- */
/* Everyone: is anything out yet?                                              */
/* -------------------------------------------------------------------------- */

/** Cheap enough for a tab badge. Any signed-in account may ask. */
export const state = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    const current = await readPublished(ctx);
    return { published: current.published, publishedAt: current.publishedAt };
  },
});

/* -------------------------------------------------------------------------- */
/* Organiser: check, then publish                                              */
/* -------------------------------------------------------------------------- */

/**
 * Everything an organiser should look at before releasing the results: rounds
 * still accepting marks, teams with a round missing, and the top of the board
 * as it currently stands.
 */
export const readiness = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const current = await readPublished(ctx);
    const rounds = await countedRounds(ctx);
    const { rows, maxPoints, maxTotal } = await rankedStandings(ctx, null);

    const openRounds = rounds.filter((r) => r.status === "open");

    /** A team missing any round would be ranked with a zero for it. */
    const incomplete = rows
      .filter((row) => row.roundsScored < row.roundsCounted)
      .map((row) => ({
        teamId: row.teamId,
        code: row.code,
        name: row.name,
        missing: row.perRound.filter((r) => r.percent === null).map((r) => r.name),
      }));

    const evaluators = (await ctx.db.query("profiles").collect()).filter(
      (p) => p.active && (p.roles ?? [p.role]).includes("evaluator"),
    );

    return {
      ...current,
      roundCount: rounds.length,
      openRounds: openRounds.map((r) => r.name),
      lockedRounds: rounds.filter((r) => r.status === "locked").length,
      teamCount: rows.length,
      teamsFullyScored: rows.length - incomplete.length,
      incomplete: incomplete.slice(0, 20),
      incompleteCount: incomplete.length,
      sheets: rows.reduce((sum, row) => sum + row.sheets, 0),
      evaluatorCount: evaluators.length,
      maxPoints,
      maxTotal,
      /** Blocked while a round is open or a team has a gap. */
      ready: rounds.length > 0 && openRounds.length === 0 && incomplete.length === 0,
      preview: rows.slice(0, 3).map((row) => ({
        rank: row.rank,
        code: row.code,
        name: row.name,
        points: row.cumulativePoints,
        percent: row.cumulativePercent,
      })),
    };
  },
});

/**
 * Releases the results to every team, or hides them again. Publishing also
 * drops an announcement in the feed and pushes it, so nobody has to be told
 * to go and look.
 */
export const setPublished = mutation({
  args: {
    published: v.boolean(),
    /** Publish even though a round is open or a team has an unscored round. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    if (args.published && !args.force) {
      const rounds = await countedRounds(ctx);
      if (rounds.length === 0) {
        throw new ConvexError({
          code: "NO_ROUNDS",
          message: "There are no rounds to publish yet.",
        });
      }

      const open = rounds.filter((r) => r.status === "open");
      if (open.length > 0) {
        throw new ConvexError({
          code: "ROUND_OPEN",
          message: `Lock ${open.map((r) => r.name).join(", ")} first, so no mark can change after the results are out.`,
        });
      }

      const { rows } = await computeStandings(ctx, null);
      const missing = rows.filter((row) => row.roundsScored < row.roundsCounted);
      if (missing.length > 0) {
        const names = missing.slice(0, 3).map((row) => row.code).join(", ");
        throw new ConvexError({
          code: "INCOMPLETE",
          message: `${missing.length} team${missing.length === 1 ? " has" : "s have"} a round with no marks (${names}${
            missing.length > 3 ? ", …" : ""
          }). They would be ranked with a zero for it.`,
        });
      }
    }

    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", RESULTS_KEY))
      .unique();

    const value: PublishedState = {
      published: args.published,
      publishedAt: args.published ? Date.now() : null,
      publishedBy: args.published ? admin._id : null,
    };

    if (row) {
      await ctx.db.patch(row._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", { key: RESULTS_KEY, value, updatedAt: Date.now() });
    }

    if (!args.published) return { published: false, announced: 0 };

    // Tell the teams, in the feed and on their lock screens.
    const participants = (await ctx.db.query("profiles").collect()).filter(
      (p) => p.active && (p.roles ?? [p.role]).includes("participant"),
    );

    const title = "Results are out";
    const body = "Your final marks and the leaderboard are now in the app. Open Results to see where you finished.";

    const announcementId = await ctx.db.insert("announcements", {
      title,
      body,
      audience: "participants",
      urgent: true,
      createdBy: admin._id,
      createdByName: admin.name,
      createdAt: Date.now(),
      deliveredTo: participants.length,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      roles: ["participant"],
      title,
      body,
      urgent: true,
      data: { type: "results" },
      announcementId,
    });

    return { published: true, announced: participants.length };
  },
});

/* -------------------------------------------------------------------------- */
/* Participant: my result, and the board                                       */
/* -------------------------------------------------------------------------- */

function roundBreakdown(row: Awaited<ReturnType<typeof rankedStandings>>["rows"][number]) {
  return row.perRound.map((round) => ({
    roundId: round.roundId,
    name: round.name,
    weight: round.weight,
    percent: round.percent,
    points: round.points,
    maxTotal: round.maxTotal,
    // Individual evaluator identities stay private to the panel.
    evaluatorCount: round.sheets,
  }));
}

/**
 * A team's own result: the cumulative, and the rounds that add up to it.
 * Returns `published: false` and nothing else until the organisers release it.
 */
export const myResults = query({
  args: {},
  handler: async (ctx) => {
    const { team } = await requireOwnTeam(ctx);
    const current = await readPublished(ctx);
    if (!current.published) return { published: false as const };

    const { rows, maxPoints, maxTotal } = await rankedStandings(ctx, null);
    const mine = rows.find((row) => row.teamId === team._id);
    if (!mine) return { published: false as const };

    return {
      published: true as const,
      publishedAt: current.publishedAt,
      rank: mine.rank,
      teamCount: rows.length,
      cumulativePoints: mine.cumulativePoints,
      cumulativePercent: mine.cumulativePercent,
      maxPoints,
      maxTotal,
      rounds: roundBreakdown(mine),
      breakdown: mine.breakdown,
    };
  },
});

/**
 * The full standings, for the participant Results tab. Empty until published,
 * so this query can be subscribed to at any time without leaking a placing.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const current = await readPublished(ctx);
    if (!current.published) return { published: false as const };

    const { rows, maxPoints, maxTotal, rounds } = await rankedStandings(ctx, null);

    return {
      published: true as const,
      publishedAt: current.publishedAt,
      maxPoints,
      maxTotal,
      rounds: rounds.map((r) => ({ _id: r._id, name: r.name, weight: r.weight })),
      myTeamId: profile.teamId ?? null,
      rows: rows.map((row) => ({
        teamId: row.teamId,
        rank: row.rank,
        code: row.code,
        name: row.name,
        projectTitle: row.projectTitle,
        labName: row.labName,
        points: row.cumulativePoints,
        percent: row.cumulativePercent,
        perRound: row.perRound.map((round) => ({
          roundId: round.roundId,
          name: round.name,
          points: round.points,
          maxTotal: round.maxTotal,
        })),
        isMine: profile.teamId === row.teamId,
      })),
    };
  },
});

/**
 * Staff view of the same published state, so the organiser leaderboard can say
 * whether teams are already looking at these numbers.
 */
export const staffState = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    return readPublished(ctx);
  },
});

