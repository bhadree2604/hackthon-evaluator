import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
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
      message: "This account is not registered for Hackfinity 3.0.",
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

/** Staff can read every team; participants only their own. */
export async function requireStaff(ctx: Ctx) {
  return requireRole(ctx, ["admin", "evaluator", "coordinator"]);
}

/**
 * Coordinators only ever touch their own teams. Organisers bypass.
 * Ownership is either an explicit team assignment or the team's lab.
 */
export function coordinatorOwnsTeam(profile: Doc<"profiles">, team: Doc<"teams">) {
  if (hasRole(profile, "admin")) return true;
  if (team.coordinatorId === profile._id) return true;
  return !!team.labId && profile.labIds.includes(team.labId);
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

export async function requireOwnedTeam(ctx: Ctx, teamId: Id<"teams">) {
  const profile = await requireCoordinator(ctx);
  const team = await ctx.db.get(teamId);
  if (!team) throw new ConvexError({ code: "NOT_FOUND", message: "Team not found." });
  if (!coordinatorOwnsTeam(profile, team)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "This team is not assigned to you." });
  }
  return { profile, team };
}
