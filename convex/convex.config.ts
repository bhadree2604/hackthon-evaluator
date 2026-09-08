import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";

/**
 * Declaring the env var here puts it on the typed `env` object in
 * `_generated/server`, so functions never touch an untyped `process.env`.
 */
const app = defineApp({
  env: {
    /** One-time key that claims the very first organiser account. */
    ADMIN_SETUP_KEY: v.optional(v.string()),
    /**
     * The one organiser account no other organiser may touch. Set it before
     * that account signs up so the flag is applied on creation.
     */
    MASTER_ADMIN_EMAIL: v.optional(v.string()),
    /**
     * Google OAuth. Optional: sign-in falls back to email + password until
     * both are set with `npx convex env set`.
     */
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
  },
});

app.use(betterAuth);

export default app;
