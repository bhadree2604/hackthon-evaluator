import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

export type Role = "admin" | "evaluator" | "coordinator" | "participant";

export type Ctx = QueryCtx | MutationCtx;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Better Auth user for the caller, or null when signed out. */
export async function getAuthUser(ctx: Ctx) {
  return authComponent.safeGetAuthUser(ctx);
}

/** App profile for the caller. Null when signed out or not on the allow list. */
export async function getProfile(ctx: Ctx): Promise<Doc<"profiles"> | null> {
  const user = await getAuthUser(ctx);
  if (!user) return null;

  const byAuthId = await ctx.db
    .query("profiles")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", user._id))
    .unique();
  if (byAuthId) return byAuthId;

  if (!user.email) return null;
  return ctx.db
    .query("profiles")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(user.email)))
    .unique();
}

export async function requireProfile(ctx: Ctx): Promise<Doc<"profiles">> {
  const profile = await getProfile(ctx);
  if (!profile) {
    throw new ConvexError({
      code: "NO_PROFILE",
      message: "This account is not registered for Hackthon Evaluator.",
    });
  }
  if (!profile.active) {
    throw new ConvexError({
      code: "DISABLED",
      message: "This account has been disabled by an organiser.",
    });
  }
  return profile;
}

/** Every role a profile may sign in as. Falls back to the legacy single role. */
export function rolesOf(profile: Doc<"profiles">): Role[] {
  const list = profile.roles && profile.roles.length > 0 ? profile.roles : [profile.role];
  return Array.from(new Set(list)) as Role[];
}

export function hasRole(profile: Doc<"profiles">, role: Role) {
  return rolesOf(profile).includes(role);
}

export async function requireRole(ctx: Ctx, roles: Role[]): Promise<Doc<"profiles">> {
  const profile = await requireProfile(ctx);
  const mine = rolesOf(profile);
  if (!roles.some((r) => mine.includes(r))) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Requires ${roles.join(" or ")} access.`,
    });
  }
  return profile;
}

/** The master organiser is immune to other organisers' edits. */
export function isMaster(profile: Doc<"profiles">) {
  return profile.isMaster === true;
}

export function assertCanEdit(actor: Doc<"profiles">, target: Doc<"profiles">) {
  if (isMaster(target) && actor._id !== target._id) {
    throw new ConvexError({
      code: "MASTER_PROTECTED",
      message: "The master organiser account can only be changed by itself.",
    });
  }
}

export const requireAdmin = (ctx: Ctx) => requireRole(ctx, ["admin"]);
export const requireEvaluator = (ctx: Ctx) => requireRole(ctx, ["evaluator", "admin"]);
export const requireCoordinator = (ctx: Ctx) => requireRole(ctx, ["coordinator", "admin"]);
export const requireParticipant = (ctx: Ctx) => requireRole(ctx, ["participant"]);

/**
 * The master organiser, as named by `MASTER_ADMIN_EMAIL` on the deployment.
 *
 * `profile.isMaster` is a copy of this, written when the account is created,
 * and it is what the account screens read. It is still a database row, and any
 * organiser can reach the database. Rewriting or deleting a mark an evaluator
 * has already signed is the one thing on this app that can change the result
 * without leaving a trace, so it is checked against the environment instead:
 * the authority lives on the deployment, where it takes `npx convex env set`
 * to move it, rather than in a field somebody could patch.
 */
function masterEmail() {
  const configured = env.MASTER_ADMIN_EMAIL;
  return configured ? normalizeEmail(configured) : null;
}

/** Non-throwing form, for telling a UI whether to offer the controls at all. */
export function isMasterAdmin(profile: Doc<"profiles">) {
  const master = masterEmail();
  return !!master && normalizeEmail(profile.email) === master && hasRole(profile, "admin");
}

export async function requireMasterAdmin(ctx: Ctx): Promise<Doc<"profiles">> {
  const profile = await requireAdmin(ctx);
  const master = masterEmail();
  if (!master) {
    throw new ConvexError({
      code: "NO_MASTER",
      message:
        "MASTER_ADMIN_EMAIL is not set on this deployment, so no account can change a signed sheet.",
    });
  }
  if (normalizeEmail(profile.email) !== master) {
    throw new ConvexError({
      code: "MASTER_ONLY",
      message: "Only the master organiser can change or delete an evaluator's sheet.",
    });
  }
  return profile;
}

/** Staff can read every team; participants only their own. */
export async function requireStaff(ctx: Ctx) {
  return requireRole(ctx, ["admin", "evaluator", "coordinator"]);
}

/**
 * Every coordinator covers the whole event, not one lab.
 *
 * Teams move rooms on the day and a badge is handed to whichever coordinator
 * is standing in front of it, so scoping a coordinator to their assigned labs
 * left the one person able to help unable to act. The lab assignment is still
 * recorded and still shown, because it is what a team is told to report to,
 * but it no longer gates what a coordinator may read or mark.
 */
export function canActOnTeam(profile: Doc<"profiles">) {
  return hasRole(profile, "coordinator") || hasRole(profile, "admin");
}

/** The team a participant belongs to. Throws for anyone without one. */
export async function requireOwnTeam(ctx: Ctx) {
  const profile = await requireRole(ctx, ["participant"]);
  if (!profile.teamId) {
    throw new ConvexError({
      code: "NO_TEAM",
      message: "Your account is not linked to a team yet. Contact the organisers.",
    });
  }
  const team = await ctx.db.get(profile.teamId);
  if (!team) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Your team record was removed." });
  }
  return { profile, team };
}
