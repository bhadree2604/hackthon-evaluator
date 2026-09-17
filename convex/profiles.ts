import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { env, mutation, query } from "./_generated/server";
import {
  getAuthUser,
  getProfile,
  normalizeEmail,
  requireAdmin,
  requireProfile,
  rolesOf,
} from "./lib/guards";
import { roleValidator, staffRoleValidator } from "./schema";

function publicProfile(profile: Doc<"profiles">) {
  return {
    _id: profile._id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    roles: rolesOf(profile),
    isMaster: profile.isMaster === true,
    phone: profile.phone,
    department: profile.department,
    labIds: profile.labIds,
    teamId: profile.teamId,
    memberId: profile.memberId,
    active: profile.active,
  };
}

/** Everything the app shell needs to route the signed-in user. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx);
    if (!user) return { state: "signed-out" as const };

    const profile = await getProfile(ctx);
    if (!profile) {
      return { state: "unregistered" as const, email: user.email ?? null };
    }
    if (!profile.active) {
      return { state: "disabled" as const, email: profile.email };
    }

    const labs = await Promise.all(profile.labIds.map((id) => ctx.db.get(id)));
    return {
      state: "ready" as const,
      profile: publicProfile(profile),
      labs: labs.filter((l): l is Doc<"labs"> => l !== null),
    };
  },
});

/**
 * Called right after a successful sign-in / sign-up. Links the Better Auth user
 * to an app profile using the admin-managed invite allow list. `setupKey` is
 * only consulted while the deployment has no admin at all.
 */
export const ensureProfile = mutation({
  args: { setupKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return { state: "signed-out" as const };

    const email = normalizeEmail(user.email ?? "");
    const name = user.name?.trim() || email.split("@")[0] || "Member";

    const existing = await getProfile(ctx);
    if (existing) {
      const patch: Partial<Doc<"profiles">> = { lastSeenAt: Date.now() };
      if (existing.authUserId !== user._id) patch.authUserId = user._id;
      if (email && existing.email !== email) patch.email = email;

      // Accounts created before multi-role shipped have no `roles` array.
      if (!existing.roles || existing.roles.length === 0) {
        patch.roles = [existing.role];
      }

      // The master organiser may have claimed the account before the flag
      // existed. Adopt it here, as long as nobody else already holds it.
      const masterEmail = env.MASTER_ADMIN_EMAIL
        ? normalizeEmail(env.MASTER_ADMIN_EMAIL)
        : null;
      if (masterEmail && masterEmail === email && existing.isMaster !== true) {
        const others = await ctx.db.query("profiles").collect();
        const claimed = others.some((p) => p.isMaster === true && p._id !== existing._id);
        if (!claimed) {
          patch.isMaster = true;
          const roles = patch.roles ?? existing.roles ?? [existing.role];
          if (!roles.includes("admin")) patch.roles = [...roles, "admin"];
        }
      }

      await ctx.db.patch(existing._id, patch);
      return { state: existing.active ? ("ready" as const) : ("disabled" as const) };
    }

    if (!email) return { state: "unregistered" as const, email: null };

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (invite) {
      await ctx.db.insert("profiles", {
        authUserId: user._id,
        email,
        name: invite.name || name,
        role: invite.role,
        roles: [invite.role],
        phone: invite.phone,
        department: invite.department,
        labIds: invite.labIds,
        teamId: invite.teamId,
        memberId: invite.memberId,
        pushTokens: [],
        /** A new account starts level with the room: no backlog to catch up on. */
        chatLastReadAt: Date.now(),
        active: true,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      await ctx.db.patch(invite._id, { claimed: true, claimedAt: Date.now() });
      return { state: "ready" as const };
    }

    // A participant is anyone whose address is on a team roster. No invite
    // needed: importing the teams is what grants them access.
    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (member) {
      const team = await ctx.db.get(member.teamId);
      await ctx.db.insert("profiles", {
        authUserId: user._id,
        email,
        name: member.name || name,
        role: "participant",
        roles: ["participant"],
        phone: member.phone,
        department: member.department,
        labIds: [],
        teamId: team?._id,
        memberId: member._id,
        pushTokens: [],
        /** A new account starts level with the room: no backlog to catch up on. */
        chatLastReadAt: Date.now(),
        active: true,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      return { state: "ready" as const };
    }

    // The setup key is the gate for organiser accounts. Anyone holding it can
    // create one; the master flag is reserved for the configured address.
    const setupKey = env.ADMIN_SETUP_KEY;
    const masterEmail = env.MASTER_ADMIN_EMAIL ? normalizeEmail(env.MASTER_ADMIN_EMAIL) : null;

    if (setupKey && args.setupKey && args.setupKey === setupKey) {
      const everyone = await ctx.db.query("profiles").collect();
      const masterTaken = everyone.some((p) => p.isMaster === true);
      const claimsMaster = masterEmail !== null && masterEmail === email && !masterTaken;

      await ctx.db.insert("profiles", {
        authUserId: user._id,
        email,
        name,
        role: "admin",
        roles: ["admin"],
        isMaster: claimsMaster ? true : undefined,
        labIds: [],
        pushTokens: [],
        /** A new account starts level with the room: no backlog to catch up on. */
        chatLastReadAt: Date.now(),
        active: true,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      return { state: "ready" as const };
    }

    return { state: "unregistered" as const, email };
  },
});

/** Signup screens call this first so we never create orphan auth accounts. */
export const checkInvite = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email) return { ok: false as const };

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (profile) {
      return { ok: true as const, role: profile.role, name: profile.name, hasAccount: true };
    }

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (invite) {
      return {
        ok: true as const,
        role: invite.role,
        name: invite.name,
        hasAccount: invite.claimed,
      };
    }
    return { ok: false as const };
  },
});

/** Drives the one-time bootstrap card on the organiser sign-in screen. */
export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    return profiles.some((p) => rolesOf(p).includes("admin"));
  },
});

/**
 * Whether the setup key can still be used, and for what. The master account
 * can be claimed even after other organisers exist.
 */
export const bootstrapState = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    return {
      adminExists: profiles.some((p) => rolesOf(p).includes("admin")),
      masterExists: profiles.some((p) => p.isMaster === true),
      masterEmail: env.MASTER_ADMIN_EMAIL ? normalizeEmail(env.MASTER_ADMIN_EMAIL) : null,
    };
  },
});

export const updateMyProfile = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const patch: Partial<Doc<"profiles">> = {};
    if (args.name?.trim()) patch.name = args.name.trim();
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.department !== undefined) patch.department = args.department.trim() || undefined;
    await ctx.db.patch(profile._id, patch);
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Admin: people management                                                    */
/* -------------------------------------------------------------------------- */

export const listPeople = query({
  args: { role: v.optional(roleValidator) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const role = args.role;

    // Participants are managed on their own screen; keep this list to staff.
    const profiles = (
      role
        ? await ctx.db
            .query("profiles")
            .withIndex("by_role", (q) => q.eq("role", role))
            .collect()
        : await ctx.db.query("profiles").collect()
    ).filter((p) => p.role !== "participant");

    const invites = (await ctx.db.query("invites").collect()).filter(
      (i) => i.role !== "participant" && (!role || i.role === role),
    );
    const labs = await ctx.db.query("labs").collect();
    const labName = new Map(labs.map((l) => [l._id, l.name]));

    const teams = await ctx.db.query("teams").collect();
    const teamCount = new Map<string, number>();
    for (const team of teams) {
      if (team.coordinatorId) {
        teamCount.set(team.coordinatorId, (teamCount.get(team.coordinatorId) ?? 0) + 1);
      }
    }

    const claimedEmails = new Set(profiles.map((p) => p.email));

    return {
      members: profiles
        .map((p) => ({
          ...publicProfile(p),
          labNames: p.labIds.map((id) => labName.get(id) ?? "Unknown lab"),
          teamCount: teamCount.get(p._id) ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      pending: invites
        .filter((i) => !claimedEmails.has(i.email))
        .map((i) => ({
          _id: i._id,
          name: i.name,
          email: i.email,
          role: i.role,
          labIds: i.labIds,
          labNames: i.labIds.map((id) => labName.get(id) ?? "Unknown lab"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

export const invitePerson = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    role: staffRoleValidator,
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    labIds: v.optional(v.array(v.id("labs"))),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) {
      throw new ConvexError({ code: "BAD_EMAIL", message: "Enter a valid email address." });
    }
    const labIds = args.labIds ?? [];

    const existingProfile = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingProfile) {
      await ctx.db.patch(existingProfile._id, {
        name: args.name.trim() || existingProfile.name,
        role: args.role,
        phone: args.phone?.trim() || existingProfile.phone,
        department: args.department?.trim() || existingProfile.department,
        labIds,
      });
      return { updated: true };
    }

    const existingInvite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingInvite) {
      await ctx.db.patch(existingInvite._id, {
        name: args.name.trim() || existingInvite.name,
        role: args.role,
        phone: args.phone?.trim(),
        department: args.department?.trim(),
        labIds,
      });
      return { updated: true };
    }

    await ctx.db.insert("invites", {
      email,
      name: args.name.trim() || email.split("@")[0],
      role: args.role,
      phone: args.phone?.trim(),
      department: args.department?.trim(),
      labIds,
      accountCreated: false,
      claimed: false,
      createdAt: Date.now(),
      createdBy: admin._id,
    });
    return { updated: false };
  },
});

export const setPersonLabs = mutation({
  args: { profileId: v.id("profiles"), labIds: v.array(v.id("labs")) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.profileId, { labIds: args.labIds });
    return null;
  },
});

export const setPersonActive = mutation({
  args: { profileId: v.id("profiles"), active: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.profileId && !args.active) {
      throw new ConvexError({ code: "SELF", message: "You cannot disable your own account." });
    }
    await ctx.db.patch(args.profileId, { active: args.active });
    return null;
  },
});

export const removeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.delete(args.inviteId);
    return null;
  },
});

/** Coordinator options for the admin team editor. */
export const listCoordinators = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const coordinators = await ctx.db
      .query("profiles")
      .withIndex("by_role", (q) => q.eq("role", "coordinator"))
      .collect();
    return coordinators
      .filter((c) => c.active)
      .map((c) => ({ _id: c._id, name: c.name, email: c.email, labIds: c.labIds }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
