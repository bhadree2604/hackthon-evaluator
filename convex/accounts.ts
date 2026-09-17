import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { env, mutation, query } from "./_generated/server";
import { createAuth, MIN_PASSWORD } from "./auth";
import {
  assertCanEdit,
  hasRole,
  isMaster,
  normalizeEmail,
  requireAdmin,
  requireProfile,
  rolesOf,
  type Ctx,
  type Role,
} from "./lib/guards";
import { roleValidator, staffRoleValidator } from "./schema";

/**
 * Staff hold accounts that can read every team's marks, so they keep a real
 * minimum even though the Better Auth floor is 1 for participants.
 */
const MIN_STAFF_PASSWORD = 8;

function assertPassword(password: string, min = MIN_STAFF_PASSWORD) {
  if (password.length < min) {
    throw new ConvexError({
      code: "WEAK",
      message:
        min <= 1
          ? "Enter a password."
          : `Passwords must be at least ${min} characters.`,
    });
  }
}

/** Participants may use anything; everyone else keeps the staff minimum. */
function minimumFor(profile: Doc<"profiles">) {
  const roles = rolesOf(profile);
  const isStaff = roles.some((role) => role !== "participant");
  return isStaff ? MIN_STAFF_PASSWORD : MIN_PASSWORD;
}

/**
 * Organiser is the only role that can be handed out with the setup key, and it
 * is the only role that *requires* it. Even a signed-in organiser must supply
 * the key to mint another one, so the key alone controls who can ever reach
 * organiser access.
 */
function assertOrganiserKey(setupKey: string | undefined) {
  const expected = env.ADMIN_SETUP_KEY;
  if (!expected) {
    throw new ConvexError({
      code: "NO_KEY",
      message: "ADMIN_SETUP_KEY is not set on this deployment.",
    });
  }
  if (!setupKey || setupKey !== expected) {
    throw new ConvexError({
      code: "BAD_KEY",
      message: "Organiser accounts need the admin setup key.",
    });
  }
}

/** True when this email is the deployment's designated master organiser. */
function isMasterEmail(email: string) {
  const master = env.MASTER_ADMIN_EMAIL;
  return !!master && normalizeEmail(master) === email;
}

async function profileByEmail(ctx: Ctx, email: string) {
  return ctx.db
    .query("profiles")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

/* -------------------------------------------------------------------------- */
/* Creating accounts                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Organisers hand out credentials; evaluators and coordinators never sign
 * themselves up. If the email already has an account, this adds the role to it
 * instead of failing, which is how one person becomes organiser *and*
 * evaluator on a single login.
 */
export const createStaffAccount = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: staffRoleValidator,
    password: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    labIds: v.optional(v.array(v.id("labs"))),
    /** Required when `role` is "admin". Ignored otherwise. */
    setupKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.role === "admin") assertOrganiserKey(args.setupKey);

    const email = normalizeEmail(args.email);
    if (!email.includes("@")) {
      throw new ConvexError({ code: "BAD_EMAIL", message: "Enter a valid email address." });
    }
    const name = args.name.trim() || email.split("@")[0];
    const labIds = args.labIds ?? [];

    const existing = await profileByEmail(ctx, email);

    // Existing person: widen their roles, optionally reset the password.
    if (existing) {
      assertCanEdit(admin, existing);

      const roles = Array.from(new Set([...rolesOf(existing), args.role])) as Role[];
      await ctx.db.patch(existing._id, {
        name: name || existing.name,
        roles,
        phone: args.phone?.trim() || existing.phone,
        department: args.department?.trim() || existing.department,
        labIds: labIds.length > 0 ? labIds : existing.labIds,
        active: true,
      });

      if (args.password) {
        assertPassword(args.password);
        await writePassword(ctx, existing.authUserId, args.password);
      }
      return { created: false, roleAdded: !hasRole(existing, args.role), email };
    }

    // New person: they need a password to sign in with.
    if (!args.password) {
      throw new ConvexError({
        code: "NO_PASSWORD",
        message: "Set a password for the new account.",
      });
    }
    assertPassword(args.password);

    const auth = createAuth(ctx);
    let authUserId: string;
    try {
      const result = await auth.api.signUpEmail({
        body: { email, password: args.password, name },
      });
      authUserId = result.user.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create the account.";
      throw new ConvexError({ code: "SIGNUP_FAILED", message });
    }

    await ctx.db.insert("profiles", {
      authUserId,
      email,
      name,
      role: args.role,
      roles: [args.role],
      isMaster: isMasterEmail(email) ? true : undefined,
      phone: args.phone?.trim(),
      department: args.department?.trim(),
      labIds,
      pushTokens: [],
      /** A new account starts level with the room: no backlog to catch up on. */
      chatLastReadAt: Date.now(),
      active: true,
      createdAt: Date.now(),
    });

    return { created: true, roleAdded: true, email };
  },
});

/**
 * Creates or repairs the master organiser account. Protected by the same setup
 * key as organiser creation, so it can be run from the CLI to guarantee a
 * working way in even if a signup was left half finished.
 */
export const provisionMaster = mutation({
  args: {
    setupKey: v.string(),
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expected = env.ADMIN_SETUP_KEY;
    if (!expected || args.setupKey !== expected) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Wrong setup key." });
    }
    assertPassword(args.password);

    const email = normalizeEmail(args.email);
    const name = args.name?.trim() || email.split("@")[0];

    const existing = await profileByEmail(ctx, email);
    if (existing) {
      // Account is there: force the password and make sure it is a master admin.
      await writePassword(ctx, existing.authUserId, args.password);
      const roles = Array.from(new Set([...rolesOf(existing), "admin"])) as Role[];
      await ctx.db.patch(existing._id, {
        roles,
        role: "admin",
        isMaster: true,
        active: true,
      });
      return { action: "repaired" as const, email };
    }

    // No profile. The Better Auth user may still exist from a failed signup.
    const auth = createAuth(ctx);
    let authUserId: string | null = null;
    try {
      const created = await auth.api.signUpEmail({
        body: { email, password: args.password, name },
      });
      authUserId = created.user.id;
    } catch {
      authUserId = null;
    }

    if (!authUserId) {
      // Signup failed because the Better Auth user already exists from an
      // earlier half-finished attempt. Adopt it: reset the password and give
      // it the profile it never got.
      const authContext = await auth.$context;
      const orphan = await authContext.internalAdapter.findUserByEmail(email);
      if (!orphan?.user?.id) {
        throw new ConvexError({
          code: "ORPHANED",
          message: "Could not find or create an auth account for that address.",
        });
      }
      authUserId = orphan.user.id;
      await writePassword(ctx, authUserId, args.password);
    }

    await ctx.db.insert("profiles", {
      authUserId,
      email,
      name,
      role: "admin",
      roles: ["admin"],
      isMaster: true,
      labIds: [],
      pushTokens: [],
      /** A new account starts level with the room: no backlog to catch up on. */
      chatLastReadAt: Date.now(),
      active: true,
      createdAt: Date.now(),
    });
    return { action: "created" as const, email };
  },
});

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Writes a new password hash straight through Better Auth's own hasher, so the
 * stored credential is identical to one the user would have set themselves.
 */
async function writePassword(ctx: Ctx, authUserId: string, password: string) {
  const auth = createAuth(ctx);
  const authContext = await auth.$context;
  const hashed = await authContext.password.hash(password);
  await authContext.internalAdapter.updatePassword(authUserId, hashed);
}

/** Organiser resets anyone's password. The master account is off limits. */
export const setPassword = mutation({
  args: { profileId: v.id("profiles"), newPassword: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(args.profileId);
    if (!target) throw new ConvexError({ code: "NOT_FOUND", message: "Account not found." });

    assertCanEdit(admin, target);
    assertPassword(args.newPassword, minimumFor(target));

    await writePassword(ctx, target.authUserId, args.newPassword);
    return { email: target.email };
  },
});

/** Anyone signed in can change their own password, master included. */
export const changeMyPassword = mutation({
  args: { newPassword: v.string() },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    assertPassword(args.newPassword, minimumFor(me));
    await writePassword(ctx, me.authUserId, args.newPassword);
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

export const setRoles = mutation({
  args: {
    profileId: v.id("profiles"),
    roles: v.array(roleValidator),
    /** Required when this grants organiser access to someone who lacks it. */
    setupKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(args.profileId);
    if (!target) throw new ConvexError({ code: "NOT_FOUND", message: "Account not found." });
    assertCanEdit(admin, target);

    const grantingAdmin = args.roles.includes("admin") && !hasRole(target, "admin");
    if (grantingAdmin) assertOrganiserKey(args.setupKey);

    const roles = Array.from(new Set(args.roles)) as Role[];
    if (roles.length === 0) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Give the account at least one role." });
    }
    if (isMaster(target) && !roles.includes("admin")) {
      throw new ConvexError({
        code: "MASTER_PROTECTED",
        message: "The master account must stay an organiser.",
      });
    }
    if (admin._id === target._id && !roles.includes("admin")) {
      throw new ConvexError({
        code: "SELF",
        message: "You cannot remove your own organiser access.",
      });
    }

    await ctx.db.patch(args.profileId, { roles, role: roles[0] });
    return null;
  },
});

/** Every staff account with the roles it can sign in as. */
export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const profiles = (await ctx.db.query("profiles").collect()).filter(
      (p) => !(rolesOf(p).length === 1 && rolesOf(p)[0] === "participant"),
    );
    const labs = await ctx.db.query("labs").collect();
    const labName = new Map<Id<"labs">, string>(labs.map((l) => [l._id, l.name]));

    const teams = await ctx.db.query("teams").collect();
    const teamCount = new Map<string, number>();
    for (const team of teams) {
      if (team.coordinatorId) {
        teamCount.set(team.coordinatorId, (teamCount.get(team.coordinatorId) ?? 0) + 1);
      }
    }

    return profiles
      .map((p: Doc<"profiles">) => ({
        _id: p._id,
        name: p.name,
        email: p.email,
        roles: rolesOf(p),
        isMaster: isMaster(p),
        active: p.active,
        phone: p.phone ?? null,
        department: p.department ?? null,
        labIds: p.labIds,
        labNames: p.labIds.map((id) => labName.get(id) ?? "Unknown lab"),
        teamCount: teamCount.get(p._id) ?? 0,
      }))
      .sort(
        (a, b) =>
          Number(b.isMaster) - Number(a.isMaster) || a.name.localeCompare(b.name),
      );
  },
});

/* -------------------------------------------------------------------------- */
/* Roll call                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Headline counts for the People screen: how many organisers, evaluators and
 * coordinators exist, and how far the participant logins have got.
 *
 * The three staff numbers overlap on purpose. One email can hold several
 * roles, so a person who is both organiser and evaluator is counted in both;
 * `people` is the number of distinct humans behind them.
 */
export const rollcall = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const profiles = await ctx.db.query("profiles").collect();
    const allMembers = await ctx.db.query("members").collect();
    const teams = await ctx.db.query("teams").collect();

    /**
     * A member whose team has been deleted cannot be given a login and must
     * not be counted as one that is missing. Sample rows from an early import
     * are the usual source.
     */
    const teamIds = new Set(teams.map((team) => team._id));
    const members = allMembers.filter((member) => teamIds.has(member.teamId));
    const orphans = allMembers.length - members.length;

    const staff = profiles.filter((p) => rolesOf(p).some((role) => role !== "participant"));
    const activeStaff = staff.filter((p) => p.active);
    const holding = (role: Role) => activeStaff.filter((p) => hasRole(p, role)).length;

    const participantProfiles = profiles.filter((p) => hasRole(p, "participant"));
    const loginEmails = new Set(participantProfiles.map((p) => p.email));

    const withEmail = members.filter((m) => !!m.email);
    const withLogin = withEmail.filter((m) => loginEmails.has(normalizeEmail(m.email ?? "")));

    return {
      staff: {
        organisers: holding("admin"),
        evaluators: holding("evaluator"),
        coordinators: holding("coordinator"),
        /** Distinct people, however many roles each of them holds. */
        people: activeStaff.length,
        disabled: staff.length - activeStaff.length,
      },
      participants: {
        teams: teams.length,
        onRoster: members.length,
        withEmail: withEmail.length,
        withLogin: withLogin.length,
        missing: withEmail.length - withLogin.length,
        noEmail: members.length - withEmail.length,
        /** Has actually opened the app at least once. */
        signedIn: participantProfiles.filter((p) => p.lastSeenAt != null).length,
        disabled: participantProfiles.filter((p) => !p.active).length,
        /** Members left behind by a deleted team. Not counted above. */
        orphans,
      },
    };
  },
});
