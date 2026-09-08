/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as announcements from "../announcements.js";
import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as criteria from "../criteria.js";
import type * as http from "../http.js";
import type * as importer from "../importer.js";
import type * as labs from "../labs.js";
import type * as lib_guards from "../lib/guards.js";
import type * as notifications from "../notifications.js";
import type * as participants from "../participants.js";
import type * as profiles from "../profiles.js";
import type * as rounds from "../rounds.js";
import type * as scores from "../scores.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as stats from "../stats.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  announcements: typeof announcements;
  attendance: typeof attendance;
  auth: typeof auth;
  chat: typeof chat;
  criteria: typeof criteria;
  http: typeof http;
  importer: typeof importer;
  labs: typeof labs;
  "lib/guards": typeof lib_guards;
  notifications: typeof notifications;
  participants: typeof participants;
  profiles: typeof profiles;
  rounds: typeof rounds;
  scores: typeof scores;
  sessions: typeof sessions;
  settings: typeof settings;
  stats: typeof stats;
  teams: typeof teams;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
