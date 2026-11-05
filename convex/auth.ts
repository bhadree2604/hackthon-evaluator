import { expo } from "@better-auth/expo";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env, query } from "./_generated/server";
import authConfig from "./auth.config";

/**
 * App scheme, must match `expo.scheme` in app.json. Better Auth rejects the
 * deep link redirect coming back from the native app unless it is trusted.
 */
export const APP_SCHEME = "hackthon-evaluator";

/**
 * Shortest password Better Auth will accept anywhere in the app. It is 1 so a
 * participant can pick anything they will remember while standing in a queue;
 * staff are held to `MIN_STAFF_PASSWORD` in convex/accounts.ts, which is what
 * actually protects the accounts that can read every team's marks.
 */
export const MIN_PASSWORD = 1;

/** The password every participant account is created with. */
export const DEFAULT_PARTICIPANT_PASSWORD = "123";

export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * Google is only offered once both credentials exist on the deployment, so a
 * half-configured provider can never produce a broken button in the app.
 */
function googleProvider() {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return { google: { clientId, clientSecret } };
}

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    // The *.convex.site origin that hosts the Better Auth HTTP routes.
    baseURL: env.CONVEX_SITE_URL,
    trustedOrigins: [`${APP_SCHEME}://`, "http://localhost:8081", "http://localhost:19006"],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      /**
       * Participants are handed a default of "123" on a printed slip and can
       * change it once inside, so the floor minimum is 3. Staff accounts are
       * held to a longer password by `accounts.ts` instead.
       */
      minPasswordLength: MIN_PASSWORD,
    },
    socialProviders: googleProvider(),
    /**
     * Google hands back a verified address, so an existing account with the
     * same email is linked rather than duplicated.
     */
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    plugins: [expo(), convex({ authConfig })],
  });

/** Which social buttons the sign-in screens should show. Public on purpose. */
export const socialProviders = query({
  args: {},
  handler: async () => ({ google: googleProvider() !== undefined }),
});

/** Raw Better Auth user for the caller, or null when signed out. */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => authComponent.safeGetAuthUser(ctx),
});
