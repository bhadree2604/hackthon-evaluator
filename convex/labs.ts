import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin, requireStaff } from "./lib/guards";

/** Labs with live occupancy. Readable by every signed-in role. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const labs = await ctx.db.query("labs").collect();
    const teams = await ctx.db.query("teams").collect();

    const counts = new Map<string, number>();
    for (const team of teams) {
      if (team.labId) counts.set(team.labId, (counts.get(team.labId) ?? 0) + 1);
    }

    return labs
      .map((lab) => ({ ...lab, teamCount: counts.get(lab._id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    block: v.optional(v.string()),
    floor: v.optional(v.string()),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "BAD_INPUT", message: "Lab name is required." });

    const existing = await ctx.db
      .query("labs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) {
      throw new ConvexError({ code: "DUPLICATE", message: `Lab "${name}" already exists.` });
    }

    return ctx.db.insert("labs", {
      name,
      block: args.block?.trim() || undefined,
      floor: args.floor?.trim() || undefined,
      capacity: args.capacity,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    labId: v.id("labs"),
    name: v.optional(v.string()),
    block: v.optional(v.string()),
    floor: v.optional(v.string()),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const { labId, ...rest } = args;
    await ctx.db.patch(labId, {
      ...(rest.name?.trim() ? { name: rest.name.trim() } : {}),
      ...(rest.block !== undefined ? { block: rest.block.trim() || undefined } : {}),
      ...(rest.floor !== undefined ? { floor: rest.floor.trim() || undefined } : {}),
      ...(rest.capacity !== undefined ? { capacity: rest.capacity } : {}),
    });
    return null;
  },
});

export const remove = mutation({
  args: { labId: v.id("labs") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const assigned = await ctx.db
      .query("teams")
      .withIndex("by_lab", (q) => q.eq("labId", args.labId))
      .first();
    if (assigned) {
      throw new ConvexError({
        code: "IN_USE",
        message: "Move the teams out of this lab before deleting it.",
      });
    }
    // Detach the lab from any coordinator that still references it.
    const profiles = await ctx.db.query("profiles").collect();
    for (const profile of profiles) {
      if (profile.labIds.includes(args.labId)) {
        await ctx.db.patch(profile._id, {
          labIds: profile.labIds.filter((id) => id !== args.labId),
        });
      }
    }
    await ctx.db.delete(args.labId);
    return null;
  },
});
