import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin, requireStaff } from "./lib/guards";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    return row?.value ?? null;
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (row) {
      await ctx.db.patch(row._id, { value: args.value, updatedAt: Date.now() });
      return row._id;
    }
    return ctx.db.insert("settings", {
      key: args.key,
      value: args.value,
      updatedAt: Date.now(),
    });
  },
});
