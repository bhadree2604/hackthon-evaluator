import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin, requireStaff } from "./lib/guards";

/** Default Hackfinity 3.0 rubric, seeded on first admin visit. */
export const DEFAULT_CRITERIA = [
  {
    key: "innovation",
    label: "Innovation",
    description: "Originality of the idea and how far it moves past the obvious solution.",
    maxScore: 10,
    weight: 1,
  },
  {
    key: "implementation",
    label: "Implementation",
    description: "How much actually works end to end, and the quality of the build.",
    maxScore: 10,
    weight: 1,
  },
  {
    key: "impact",
    label: "Impact",
    description: "Size of the problem solved and who benefits from it.",
    maxScore: 10,
    weight: 1,
  },
  {
    key: "presentation",
    label: "Presentation",
    description: "Clarity of the demo, the pitch and the answers to questions.",
    maxScore: 10,
    weight: 1,
  },
  {
    key: "feasibility",
    label: "Feasibility",
    description: "Whether this can survive outside the 24 hours, technically and practically.",
    maxScore: 10,
    weight: 1,
  },
] as const;

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const all = await ctx.db.query("criteria").withIndex("by_order").collect();
    return args.includeInactive ? all : all.filter((c) => c.active);
  },
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("criteria").first();
    if (existing) return { seeded: 0 };

    let order = 0;
    for (const c of DEFAULT_CRITERIA) {
      await ctx.db.insert("criteria", { ...c, order: order++, active: true });
    }
    return { seeded: DEFAULT_CRITERIA.length };
  },
});

export const upsert = mutation({
  args: {
    criterionId: v.optional(v.id("criteria")),
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    maxScore: v.number(),
    weight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const key = args.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const label = args.label.trim();
    if (!key || !label) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Key and label are required." });
    }
    if (args.maxScore <= 0) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Max score must be above zero." });
    }

    if (args.criterionId) {
      await ctx.db.patch(args.criterionId, {
        key,
        label,
        description: args.description?.trim() || undefined,
        maxScore: args.maxScore,
        weight: args.weight ?? 1,
      });
      return args.criterionId;
    }

    const clash = await ctx.db
      .query("criteria")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (clash) {
      throw new ConvexError({ code: "DUPLICATE", message: `Criterion "${key}" already exists.` });
    }

    const all = await ctx.db.query("criteria").collect();
    return ctx.db.insert("criteria", {
      key,
      label,
      description: args.description?.trim() || undefined,
      maxScore: args.maxScore,
      weight: args.weight ?? 1,
      order: all.length,
      active: true,
    });
  },
});

export const setActive = mutation({
  args: { criterionId: v.id("criteria"), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.criterionId, { active: args.active });
    return null;
  },
});

export const remove = mutation({
  args: { criterionId: v.id("criteria") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.criterionId);
    return null;
  },
});
