import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireAdmin, requireProfile } from "./lib/guards";
import { roleValidator } from "./schema";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const CHUNK = 90;

/** Android channels are declared on the device; these ids must match app code. */
export const CHANNEL_DEFAULT = "hackfinity-default";
export const CHANNEL_URGENT = "hackfinity-urgent";

/* -------------------------------------------------------------------------- */
/* Device registration                                                         */
/* -------------------------------------------------------------------------- */

export const registerPushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const token = args.token.trim();
    if (!token.startsWith("ExponentPushToken") && !token.startsWith("ExpoPushToken")) {
      return { registered: false };
    }
    if (profile.pushTokens.includes(token)) return { registered: true };

    // Someone else may have signed in on this device before; the token can
    // only belong to one profile or they would get each other's alerts.
    const others = await ctx.db.query("profiles").collect();
    for (const other of others) {
      if (other._id !== profile._id && other.pushTokens.includes(token)) {
        await ctx.db.patch(other._id, {
          pushTokens: other.pushTokens.filter((t) => t !== token),
        });
      }
    }

    await ctx.db.patch(profile._id, { pushTokens: [...profile.pushTokens, token] });
    return { registered: true };
  },
});

export const unregisterPushToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    await ctx.db.patch(profile._id, {
      pushTokens: profile.pushTokens.filter((t) => t !== args.token),
    });
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Internals used by chat and announcements                                    */
/* -------------------------------------------------------------------------- */

export const collectTokens = internalQuery({
  args: {
    roles: v.optional(v.array(roleValidator)),
    teamId: v.optional(v.id("teams")),
    excludeProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => {
    let profiles = await ctx.db.query("profiles").collect();

    if (args.roles && args.roles.length > 0) {
      const wanted = new Set<string>(args.roles);
      profiles = profiles.filter((p) => wanted.has(p.role));
    }
    if (args.teamId) profiles = profiles.filter((p) => p.teamId === args.teamId);
    if (args.excludeProfileId) profiles = profiles.filter((p) => p._id !== args.excludeProfileId);

    return profiles
      .filter((p) => p.active)
      .flatMap((p) => p.pushTokens)
      .filter((token, index, all) => all.indexOf(token) === index);
  },
});

/**
 * How many phones an audience can actually be pushed to right now. Lets an
 * organiser see, before sending, whether anyone will hear it.
 */
export const reach = query({
  args: { roles: v.optional(v.array(roleValidator)) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let profiles = (await ctx.db.query("profiles").collect()).filter((p) => p.active);

    if (args.roles && args.roles.length > 0) {
      const wanted = new Set<string>(args.roles);
      profiles = profiles.filter((p) => wanted.has(p.role));
    }

    const withDevice = profiles.filter((p) => p.pushTokens.length > 0);
    const devices = profiles.reduce((sum, p) => sum + p.pushTokens.length, 0);

    return {
      people: profiles.length,
      reachable: withDevice.length,
      devices,
      silent: profiles.length - withDevice.length,
    };
  },
});

export const recordPushResult = internalMutation({
  args: { announcementId: v.id("announcements"), pushedTo: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.announcementId);
    if (row) await ctx.db.patch(args.announcementId, { pushedTo: args.pushedTo });
    return null;
  },
});

export const dropTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.tokens.length === 0) return null;
    const dead = new Set(args.tokens);
    const profiles = await ctx.db.query("profiles").collect();
    for (const profile of profiles) {
      const kept = profile.pushTokens.filter((t) => !dead.has(t));
      if (kept.length !== profile.pushTokens.length) {
        await ctx.db.patch(profile._id, { pushTokens: kept });
      }
    }
    return null;
  },
});

/**
 * Resolves an audience to device tokens and hands them to Expo's push service.
 * Scheduled with `ctx.scheduler.runAfter(0, ...)` so a slow push never blocks
 * the mutation that triggered it.
 */
export const dispatch = internalAction({
  args: {
    roles: v.optional(v.array(roleValidator)),
    teamId: v.optional(v.id("teams")),
    excludeProfileId: v.optional(v.id("profiles")),
    title: v.string(),
    body: v.string(),
    urgent: v.boolean(),
    data: v.optional(v.any()),
    /** When set, the delivered-device count is written back to this row. */
    announcementId: v.optional(v.id("announcements")),
  },
  handler: async (ctx, args) => {
    const tokens: string[] = await ctx.runQuery(internal.notifications.collectTokens, {
      roles: args.roles,
      teamId: args.teamId,
      excludeProfileId: args.excludeProfileId,
    });
    if (tokens.length === 0) {
      if (args.announcementId) {
        await ctx.runMutation(internal.notifications.recordPushResult, {
          announcementId: args.announcementId,
          pushedTo: 0,
        });
      }
      return { sent: 0 };
    }

    const dead: string[] = [];
    let sent = 0;

    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      const payload = batch.map((to) => ({
        to,
        title: args.title,
        body: args.body,
        sound: "default" as const,
        priority: "high" as const,
        channelId: args.urgent ? CHANNEL_URGENT : CHANNEL_DEFAULT,
        // Android honours this when the channel was created with a pattern.
        vibrate: args.urgent ? [0, 400, 150, 400] : [0, 250, 120, 250],
        interruptionLevel: args.urgent ? ("timeSensitive" as const) : ("active" as const),
        data: args.data ?? {},
      }));

      try {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) continue;

        const json = (await response.json()) as {
          data?: {
            status: string;
            message?: string;
            details?: { error?: string };
          }[];
        };

        json.data?.forEach((ticket, index) => {
          if (ticket.status === "ok") {
            sent++;
          } else if (ticket.details?.error === "DeviceNotRegistered") {
            dead.push(batch[index]);
          }
        });
      } catch {
        // Network hiccup: the announcement still lives in the app feed.
      }
    }

    if (dead.length > 0) {
      await ctx.runMutation(internal.notifications.dropTokens, { tokens: dead });
    }
    if (args.announcementId) {
      await ctx.runMutation(internal.notifications.recordPushResult, {
        announcementId: args.announcementId,
        pushedTo: sent,
      });
    }
    return { sent };
  },
});
