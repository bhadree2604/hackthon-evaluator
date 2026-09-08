import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin, requireStaff } from "./lib/guards";

/** Attendance windows for the 24 hour build, Sep 18-19 2026. */
export const DEFAULT_SESSIONS = [
  { name: "Day 1 - Check-in", day: 1 },
  { name: "Day 1 - Morning", day: 1 },
  { name: "Day 1 - Afternoon", day: 1 },
  { name: "Day 1 - Evening", day: 1 },
  { name: "Day 1 - Midnight", day: 1 },
  { name: "Day 2 - Early Morning", day: 2 },
  { name: "Day 2 - Morning", day: 2 },
  { name: "Day 2 - Final Demo", day: 2 },
] as const;

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const all = await ctx.db.query("attendanceSessions").withIndex("by_order").collect();
    return args.includeInactive ? all : all.filter((s) => s.active);
  },
});

export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("attendanceSessions").first();
    if (existing) return { seeded: 0 };

    let order = 0;
    for (const s of DEFAULT_SESSIONS) {
      await ctx.db.insert("attendanceSessions", {
        name: s.name,
        day: s.day,
        order: order++,
        active: true,
        createdAt: Date.now(),
      });
    }
    return { seeded: DEFAULT_SESSIONS.length };
  },
});

export const upsert = mutation({
  args: {
    sessionId: v.optional(v.id("attendanceSessions")),
    name: v.string(),
    day: v.number(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();

    if (args.sessionId) {
      await ctx.db.patch(args.sessionId, {
        name,
        day: args.day,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
      });
      return args.sessionId;
    }

    const all = await ctx.db.query("attendanceSessions").collect();
    return ctx.db.insert("attendanceSessions", {
      name,
      day: args.day,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      order: all.length,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const setActive = mutation({
  args: { sessionId: v.id("attendanceSessions"), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.sessionId, { active: args.active });
    return null;
  },
});

export const remove = mutation({
  args: { sessionId: v.id("attendanceSessions") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    for (const mark of marks) await ctx.db.delete(mark._id);
    await ctx.db.delete(args.sessionId);
    return null;
  },
});
