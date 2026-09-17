import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getProfile, requireAdmin, requireProfile, rolesOf, type Role } from "./lib/guards";

const ROOM = "general";
const MAX_BODY = 2000;

/**
 * Where "unread" starts for someone who has never opened the room.
 *
 * An account signing in for the first time has no `chatLastReadAt`, and
 * treating that as the epoch made every message ever posted count as pending:
 * a coordinator joining on day two was met with a badge of eighty and an alert
 * for a conversation that had already happened. A profile without the stamp
 * has nothing waiting; `primeRead` writes the stamp on the first launch, and
 * everything after that moment is genuinely new.
 */
function readSince(profile: { chatLastReadAt?: number }, now: number) {
  return profile.chatLastReadAt ?? now;
}

/**
 * The room shows a participant with their team, and staff with their role, so
 * everyone can tell at a glance who is speaking.
 */
function speakingAs(roles: Role[]): Role {
  if (roles.includes("participant")) return "participant";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("coordinator")) return "coordinator";
  if (roles.includes("evaluator")) return "evaluator";
  return roles[0] ?? "participant";
}

/** Newest messages in the shared room, oldest first for rendering. */
export const room = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("room", ROOM))
      .order("desc")
      .take(Math.min(args.limit ?? 200, 400));

    const messages = recent.reverse().map((m) => ({
      _id: m._id,
      body: m.body,
      authorName: m.authorName,
      authorRole: m.authorRole,
      authorTeamName: m.authorTeamName ?? null,
      authorTeamCode: m.authorTeamCode ?? null,
      createdAt: m.createdAt,
      mine: m.authorProfileId === profile._id,
    }));

    const since = readSince(profile, Date.now());
    const unread = messages.filter((m) => !m.mine && m.createdAt > since).length;

    return {
      messages,
      unread,
      me: {
        profileId: profile._id,
        name: profile.name,
        role: speakingAs(rolesOf(profile)),
      },
    };
  },
});

export const send = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);

    const body = args.body.trim();
    if (!body) throw new ConvexError({ code: "EMPTY", message: "Write a message first." });
    if (body.length > MAX_BODY) {
      throw new ConvexError({
        code: "TOO_LONG",
        message: `Keep messages under ${MAX_BODY} characters.`,
      });
    }

    const role = speakingAs(rolesOf(profile));

    // Participants are labelled with their team; staff with their role.
    let teamName: string | undefined;
    let teamCode: string | undefined;
    if (role === "participant" && profile.teamId) {
      const team = await ctx.db.get(profile.teamId);
      teamName = team?.name;
      teamCode = team?.code;
    }

    await ctx.db.insert("messages", {
      room: ROOM,
      authorProfileId: profile._id,
      authorName: profile.name,
      authorRole: role,
      authorTeamName: teamName,
      authorTeamCode: teamCode,
      body,
      createdAt: Date.now(),
    });

    // Sending counts as reading everything before it.
    await ctx.db.patch(profile._id, { chatLastReadAt: Date.now() });

    // A participant asking for help wakes the people who can answer. Staff
    // replies are visible live in the room, so they do not push to 150 phones.
    if (role === "participant") {
      const who = teamCode ? `${profile.name} (${teamCode})` : profile.name;
      await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
        roles: ["admin", "coordinator"],
        excludeProfileId: profile._id,
        title: `${who} in the help desk`,
        body: body.slice(0, 140),
        urgent: true,
        data: { type: "chat" },
      });
    }

    return null;
  },
});

/**
 * Called once per launch, before the room has ever been opened. Anything
 * posted before this stamp belongs to the part of the event this account was
 * not here for, so it is never announced.
 */
export const primeRead = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await getProfile(ctx);
    if (!profile || !profile.active) return null;
    if (profile.chatLastReadAt !== undefined) return null;
    await ctx.db.patch(profile._id, { chatLastReadAt: Date.now() });
    return null;
  },
});

export const markRead = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const latest = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("room", ROOM))
      .order("desc")
      .first();

    const newest = latest?.createdAt ?? 0;
    // Only write when it actually moves, or the query republishes forever.
    if ((profile.chatLastReadAt ?? 0) < newest) {
      await ctx.db.patch(profile._id, { chatLastReadAt: newest });
    }
    return null;
  },
});

/** Badge count for the tab bar. */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    // Fails soft for the same reason as announcements.feed: it runs at boot.
    const profile = await getProfile(ctx);
    if (!profile || !profile.active) return 0;
    const since = readSince(profile, Date.now());

    const recent = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("room", ROOM))
      .order("desc")
      .take(100);

    return recent.filter((m) => m.createdAt > since && m.authorProfileId !== profile._id).length;
  },
});

/** Organisers can clear a message that should not be in the room. */
export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.messageId);
    return null;
  },
});
