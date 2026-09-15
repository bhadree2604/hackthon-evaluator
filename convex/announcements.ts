import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getProfile, requireAdmin, rolesOf, type Role } from "./lib/guards";
import { audienceValidator } from "./schema";

type Audience = "all" | "participants" | "coordinators" | "evaluators" | "admins";

const AUDIENCE_ROLES: Record<Audience, Role[] | undefined> = {
  all: undefined, // every active profile
  participants: ["participant"],
  coordinators: ["coordinator"],
  evaluators: ["evaluator"],
  admins: ["admin"],
};

/** Feed for the signed-in user: anything addressed to them or to everyone. */
export const feed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    /**
     * Fails soft. The app subscribes to this at boot, and a pass that runs
     * before the access token lands would otherwise throw into the render
     * tree and take the whole shell down.
     */
    const profile = await getProfile(ctx);
    if (!profile || !profile.active) return [];

    const all = await ctx.db
      .query("announcements")
      .withIndex("by_createdAt")
      .order("desc")
      .take(args.limit ?? 50);

    // Every role the account holds, not just the primary one, so a person who
    // is both organiser and evaluator sees what is addressed to either.
    const roles = rolesOf(profile);
    const mine: Audience[] = ["all"];
    if (roles.includes("participant")) mine.push("participants");
    if (roles.includes("coordinator")) mine.push("coordinators");
    if (roles.includes("evaluator")) mine.push("evaluators");
    if (roles.includes("admin")) mine.push("admins", "participants", "coordinators", "evaluators");

    return all.filter((a) => mine.includes(a.audience as Audience));
  },
});

export const publish = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    audience: audienceValidator,
    urgent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const title = args.title.trim();
    const body = args.body.trim();
    if (!title || !body) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Title and message are both required." });
    }

    const roles = AUDIENCE_ROLES[args.audience as Audience];
    const recipients = (await ctx.db.query("profiles").collect()).filter(
      (p) => p.active && (!roles || rolesOf(p).some((role) => roles.includes(role))),
    );

    const id = await ctx.db.insert("announcements", {
      title,
      body,
      audience: args.audience,
      urgent: args.urgent ?? false,
      createdBy: admin._id,
      createdByName: admin.name,
      createdAt: Date.now(),
      deliveredTo: recipients.length,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      roles,
      title,
      body: body.slice(0, 170),
      urgent: args.urgent ?? false,
      data: { type: "announcement", announcementId: id },
      announcementId: id,
    });

    return { id, recipients: recipients.length };
  },
});

export const remove = mutation({
  args: { announcementId: v.id("announcements") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.announcementId);
    return null;
  },
});
