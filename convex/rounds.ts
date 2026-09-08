import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireStaff, type Ctx } from "./lib/guards";
import { roundStatusValidator } from "./schema";

/**
 * Evaluation rounds.
 *
 * The rubric is global: every round is scored on the same criteria. What a
 * round carries is its own set of sheets and its own `weight` in the
 * cumulative, so "Final demo" can count double without needing a second
 * rubric. A team is scored once per evaluator per round.
 *
 *   draft   - being set up, evaluators cannot see it
 *   open    - evaluators can score it
 *   locked  - scoring closed, marks frozen
 *
 * `published` is separate from status: it controls whether participants see
 * the marks, so an organiser can lock a round, check it, and release it later.
 */

/** Rounds created by `seed`, in order. */
const SEED_NAMES = [
  "Round 1 - Screening",
  "Round 2 - Idea pitch",
  "Round 3 - Mid review",
  "Round 4 - Prototype",
  "Round 5 - Final demo",
  "Round 6 - Jury",
] as const;

export async function activeCriteria(ctx: Ctx) {
  const all = await ctx.db.query("criteria").withIndex("by_order").collect();
  return all.filter((c) => c.active);
}

export function maxTotalFor(criteria: Doc<"criteria">[]) {
  return criteria.reduce((sum, c) => sum + c.maxScore * c.weight, 0);
}

/** Rounds that contribute to the cumulative: everything except drafts. */
export function counts(round: Doc<"rounds">) {
  return round.status !== "draft";
}

export async function countedRounds(ctx: Ctx) {
  const all = await ctx.db.query("rounds").withIndex("by_order").collect();
  return all.filter(counts);
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Rounds the caller may act on. Evaluators only ever see rounds that are open
 * or already locked; a draft is an organiser's workspace.
 */
export const list = query({
  args: { includeDrafts: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    const all = await ctx.db.query("rounds").withIndex("by_order").collect();
    const criteria = await activeCriteria(ctx);
    const maxTotal = maxTotalFor(criteria);

    const visible =
      profile.role === "admin" && args.includeDrafts
        ? all
        : all.filter((r) => r.status !== "draft");

    return visible.map((r) => ({
      _id: r._id,
      name: r.name,
      description: r.description ?? null,
      order: r.order,
      weight: r.weight,
      status: r.status,
      published: r.published,
      maxTotal,
      criteriaCount: criteria.length,
    }));
  },
});

/** Organiser view: every round with its coverage across the panel. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const rounds = await ctx.db.query("rounds").withIndex("by_order").collect();
    const criteria = await activeCriteria(ctx);
    const maxTotal = maxTotalFor(criteria);
    const teams = (await ctx.db.query("teams").collect()).filter((t) => t.status === "active");
    const evaluators = (await ctx.db.query("profiles").collect()).filter(
      (p) => p.active && (p.roles ?? [p.role]).includes("evaluator"),
    );

    const rows = await Promise.all(
      rounds.map(async (round) => {
        const scores = await ctx.db
          .query("scores")
          .withIndex("by_round", (q) => q.eq("roundId", round._id))
          .collect();
        const submitted = scores.filter((s) => s.submitted);
        const teamsScored = new Set(submitted.map((s) => s.teamId));
        const average = submitted.length
          ? submitted.reduce((sum, s) => sum + s.percent, 0) / submitted.length
          : null;

        return {
          _id: round._id,
          name: round.name,
          description: round.description ?? null,
          order: round.order,
          weight: round.weight,
          status: round.status,
          published: round.published,
          maxTotal,
          sheets: submitted.length,
          drafts: scores.length - submitted.length,
          teamsScored: teamsScored.size,
          teamsTotal: teams.length,
          averagePercent: average,
        };
      }),
    );

    return {
      rounds: rows,
      criteriaCount: criteria.length,
      maxTotal,
      teamCount: teams.length,
      evaluatorCount: evaluators.length,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export const upsert = mutation({
  args: {
    roundId: v.optional(v.id("rounds")),
    name: v.string(),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const name = args.name.trim();
    if (!name) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Give the round a name." });
    }

    const weight = args.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Weight must be above zero." });
    }

    if (args.roundId) {
      await ctx.db.patch(args.roundId, {
        name,
        description: args.description?.trim() || undefined,
        weight,
      });
      return args.roundId;
    }

    const all = await ctx.db.query("rounds").collect();
    return ctx.db.insert("rounds", {
      name,
      description: args.description?.trim() || undefined,
      order: all.length,
      weight,
      status: "draft",
      published: false,
      createdAt: Date.now(),
    });
  },
});

/**
 * Creates rounds 1..count in one go. Existing rounds are left alone and the
 * numbering continues after them, so running this twice does not duplicate.
 */
export const seed = mutation({
  args: { count: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const count = Math.round(args.count);
    if (count < 1 || count > SEED_NAMES.length) {
      throw new ConvexError({
        code: "BAD_INPUT",
        message: `Pick between 1 and ${SEED_NAMES.length} rounds.`,
      });
    }

    const existing = await ctx.db.query("rounds").collect();
    if (existing.length >= count) return { created: 0, total: existing.length };

    let order = existing.length;
    for (let i = existing.length; i < count; i++) {
      await ctx.db.insert("rounds", {
        name: SEED_NAMES[i],
        order: order++,
        weight: 1,
        status: "draft",
        published: false,
        createdAt: Date.now(),
      });
    }

    return { created: count - existing.length, total: count };
  },
});

export const setStatus = mutation({
  args: { roundId: v.id("rounds"), status: roundStatusValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new ConvexError({ code: "NOT_FOUND", message: "Round not found." });

    // Going back to draft would hide marks that already exist.
    if (args.status === "draft") {
      const scored = await ctx.db
        .query("scores")
        .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
        .first();
      if (scored) {
        throw new ConvexError({
          code: "HAS_SCORES",
          message: "This round already has marks. Lock it instead of returning it to draft.",
        });
      }
    }

    await ctx.db.patch(args.roundId, { status: args.status });
    return null;
  },
});

/** Releases (or hides) a round's marks for participants. */
export const setPublished = mutation({
  args: { roundId: v.id("rounds"), published: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.roundId, { published: args.published });
    return null;
  },
});

export const reorder = mutation({
  args: { roundIds: v.array(v.id("rounds")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let order = 0;
    for (const id of args.roundIds) {
      await ctx.db.patch(id, { order: order++ });
    }
    return null;
  },
});

/** Deletes a round and every sheet written in it. */
export const remove = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();
    for (const score of scores) await ctx.db.delete(score._id);

    await ctx.db.delete(args.roundId);
    return { deletedScores: scores.length };
  },
});

/**
 * Sheets written before rounds existed have no `roundId` and would otherwise
 * never appear again. This stamps them onto a round of the organiser's
 * choosing, once.
 */
export const adoptLegacyScores = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const round = await ctx.db.get(args.roundId);
    if (!round) throw new ConvexError({ code: "NOT_FOUND", message: "Round not found." });

    const orphans = (await ctx.db.query("scores").collect()).filter((s) => !s.roundId);
    for (const score of orphans) {
      await ctx.db.patch(score._id, { roundId: args.roundId });
    }
    return { adopted: orphans.length };
  },
});
