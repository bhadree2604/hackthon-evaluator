import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireAdmin, requireProfile, rolesOf, type Role } from "./lib/guards";
import { roleValidator } from "./schema";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo accepts 100 messages per request; 90 leaves room under the size cap. */
const CHUNK = 90;
/** Receipts are fetched in larger batches, 1000 is Expo's documented maximum. */
const RECEIPT_CHUNK = 300;
/**
 * A receipt only exists once Expo has handed the message to Apple or Google,
 * which is not instant. Half a minute is long enough in practice.
 */
const RECEIPT_DELAY_MS = 30_000;

/** Android channels are declared on the device; these ids must match app code. */
export const CHANNEL_DEFAULT = "hackthon-evaluator-default";
export const CHANNEL_URGENT = "hackthon-evaluator-urgent";

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
/* Internals used by chat, announcements and results                           */
/* -------------------------------------------------------------------------- */

export const collectTokens = internalQuery({
  args: {
    roles: v.optional(v.array(roleValidator)),
    teamId: v.optional(v.id("teams")),
    excludeProfileId: v.optional(v.id("profiles")),
    /** Only this one account, used by the self test. */
    onlyProfileId: v.optional(v.id("profiles")),
  },
  handler: async (ctx, args) => {
    let profiles = await ctx.db.query("profiles").collect();

    if (args.onlyProfileId) {
      profiles = profiles.filter((p) => p._id === args.onlyProfileId);
    }
    if (args.roles && args.roles.length > 0) {
      /**
       * Matched against every role the account holds, not the legacy primary
       * one: an organiser who also evaluates must still receive the alerts
       * addressed to evaluators.
       */
      const wanted = new Set<Role>(args.roles);
      profiles = profiles.filter((p) => rolesOf(p).some((role) => wanted.has(role)));
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
      const wanted = new Set<Role>(args.roles);
      profiles = profiles.filter((p) => rolesOf(p).some((role) => wanted.has(role)));
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
  args: {
    announcementId: v.id("announcements"),
    pushedTo: v.number(),
    failed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.announcementId);
    if (row) {
      await ctx.db.patch(args.announcementId, {
        pushedTo: args.pushedTo,
        pushFailed: args.failed,
      });
    }
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

/* -------------------------------------------------------------------------- */
/* Delivery                                                                    */
/* -------------------------------------------------------------------------- */

type ExpoTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * One POST to Expo, retried once. A dropped connection on a campus wifi is the
 * normal failure here, and losing a whole batch of 90 phones to it is not
 * acceptable for a "report to your lab" call.
 */
async function postToExpo(url: string, body: unknown): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return await response.json();

      // 429 and 5xx are worth a second go; a 4xx will fail the same way twice.
      if (response.status < 429 && response.status !== 408) return null;
    } catch {
      // Network error: fall through to the retry.
    }

    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

/**
 * Resolves an audience to device tokens and hands them to Expo's push service.
 * Scheduled with `ctx.scheduler.runAfter(0, ...)` so a slow push never blocks
 * the mutation that triggered it.
 *
 * Expo accepting a message only means it was queued. Whether the phone was
 * actually reachable arrives later on a receipt, which `checkReceipts` picks
 * up so dead tokens stop inflating the reach count.
 */
export const dispatch = internalAction({
  args: {
    roles: v.optional(v.array(roleValidator)),
    teamId: v.optional(v.id("teams")),
    excludeProfileId: v.optional(v.id("profiles")),
    onlyProfileId: v.optional(v.id("profiles")),
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
      onlyProfileId: args.onlyProfileId,
    });

    if (tokens.length === 0) {
      if (args.announcementId) {
        await ctx.runMutation(internal.notifications.recordPushResult, {
          announcementId: args.announcementId,
          pushedTo: 0,
          failed: 0,
        });
      }
      return { sent: 0, failed: 0 };
    }

    const dead: string[] = [];
    const pending: { id: string; token: string }[] = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      const payload = batch.map((to) => ({
        to,
        title: args.title,
        body: args.body,
        sound: "default" as const,
        /**
         * High priority wakes a dozing phone; the Android channel is what
         * decides the heads-up banner and the vibration pattern, so there is
         * nothing to set here for those.
         */
        priority: "high" as const,
        channelId: args.urgent ? CHANNEL_URGENT : CHANNEL_DEFAULT,
        interruptionLevel: args.urgent ? ("timeSensitive" as const) : ("active" as const),
        /** Keep a call to the floor useful for an hour, not all weekend. */
        ttl: args.urgent ? 3600 : 21600,
        data: args.data ?? {},
      }));

      const json = (await postToExpo(EXPO_PUSH_ENDPOINT, payload)) as
        | { data?: ExpoTicket[] }
        | null;

      if (!json?.data) {
        failed += batch.length;
        continue;
      }

      json.data.forEach((ticket, index) => {
        if (ticket.status === "ok") {
          sent++;
          if (ticket.id) pending.push({ id: ticket.id, token: batch[index] });
          return;
        }
        failed++;
        if (ticket.details?.error === "DeviceNotRegistered") dead.push(batch[index]);
      });
    }

    if (dead.length > 0) {
      await ctx.runMutation(internal.notifications.dropTokens, { tokens: dead });
    }

    if (args.announcementId) {
      await ctx.runMutation(internal.notifications.recordPushResult, {
        announcementId: args.announcementId,
        pushedTo: sent,
        failed,
      });
    }

    // Expo only reports an unreachable phone on the receipt, not the ticket.
    if (pending.length > 0) {
      await ctx.scheduler.runAfter(RECEIPT_DELAY_MS, internal.notifications.checkReceipts, {
        tickets: pending,
      });
    }

    return { sent, failed };
  },
});

/**
 * Reads the receipts for messages Expo accepted and drops the tokens of phones
 * that have since uninstalled or revoked notifications, so `reach` keeps
 * telling the truth about how many phones will actually buzz.
 */
export const checkReceipts = internalAction({
  args: {
    tickets: v.array(v.object({ id: v.string(), token: v.string() })),
  },
  handler: async (ctx, args) => {
    const tokenById = new Map(args.tickets.map((t) => [t.id, t.token]));
    const ids = [...tokenById.keys()];
    const dead: string[] = [];
    let delivered = 0;
    let errored = 0;

    for (let i = 0; i < ids.length; i += RECEIPT_CHUNK) {
      const batch = ids.slice(i, i + RECEIPT_CHUNK);
      const json = (await postToExpo(EXPO_RECEIPT_ENDPOINT, { ids: batch })) as
        | { data?: Record<string, ExpoTicket> }
        | null;
      if (!json?.data) continue;

      for (const [id, receipt] of Object.entries(json.data)) {
        if (receipt.status === "ok") {
          delivered++;
          continue;
        }
        errored++;
        const token = tokenById.get(id);
        if (token && receipt.details?.error === "DeviceNotRegistered") dead.push(token);
      }
    }

    if (dead.length > 0) {
      await ctx.runMutation(internal.notifications.dropTokens, { tokens: dead });
    }

    return { delivered, errored, dropped: dead.length };
  },
});

/**
 * Sends a real push to the caller's own phones, down the same path an
 * announcement takes. Locking the phone first and then pressing this is the
 * only way to prove remote delivery actually works on a given build.
 */
export const sendTest = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);

    if (profile.pushTokens.length === 0) {
      throw new ConvexError({
        code: "NO_DEVICE",
        message:
          "This phone has no push token yet. Allow notifications, then reopen the app once.",
      });
    }

    await ctx.scheduler.runAfter(0, internal.notifications.dispatch, {
      onlyProfileId: profile._id,
      title: "Hackthon Evaluator test alert",
      body: "Remote notifications are working on this phone. Lock it and send this again to be sure.",
      urgent: true,
      data: { type: "test" },
    });

    return { devices: profile.pushTokens.length };
  },
});
