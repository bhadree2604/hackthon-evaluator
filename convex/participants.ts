import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { createAuth, DEFAULT_PARTICIPANT_PASSWORD, MIN_PASSWORD } from "./auth";
import { normalizeEmail, requireAdmin, requireOwnTeam } from "./lib/guards";
import { rosterOrder } from "./lib/roster";

const PRESENT = new Set(["present", "late"]);

/**
 * Participant credentials are handed out on paper, so the password an
 * organiser generated has to stay readable to them. It is only ever returned
 * to an admin, never to any other role.
 */
function buildPassword(prefix: string, mode: "shared" | "unique") {
  const clean = prefix.trim();
  if (mode === "shared") return clean;
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `${clean}${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Organiser: account provisioning                                             */
/* -------------------------------------------------------------------------- */

/**
 * Creates a Better Auth account for every team member that has an email and
 * does not have one yet. Each failure is reported instead of aborting the run,
 * so one bad address cannot block a whole batch.
 */
export const provisionAccounts = mutation({
  args: {
    /**
     * One team at a time. Creating a Better Auth account hashes a password, so
     * a whole event in a single mutation would blow the time limit; the client
     * walks the team list and reports progress instead.
     */
    teamId: v.optional(v.id("teams")),
    passwordPrefix: v.string(),
    mode: v.union(v.literal("shared"), v.literal("unique")),
    leadersOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const prefix = args.passwordPrefix.trim();
    if (prefix.length < MIN_PASSWORD) {
      throw new ConvexError({
        code: "WEAK",
        message: "Enter a password to give them.",
      });
    }

    const teams = args.teamId
      ? ([await ctx.db.get(args.teamId)].filter((t): t is Doc<"teams"> => t !== null))
      : await ctx.db.query("teams").collect();

    const auth = createAuth(ctx);

    let created = 0;
    let skipped = 0;
    const failures: string[] = [];
    const credentials: {
      email: string;
      name: string;
      password: string;
      teamCode: string;
    }[] = [];

    for (const team of teams) {
      const members = await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();

      for (const member of members) {
        if (args.leadersOnly && !member.isLeader) continue;

        const email = member.email ? normalizeEmail(member.email) : "";
        if (!email || !email.includes("@")) {
          skipped++;
          continue;
        }

        const existingProfile = await ctx.db
          .query("profiles")
          .withIndex("by_email", (q) => q.eq("email", email))
          .unique();
        const existingInvite = await ctx.db
          .query("invites")
          .withIndex("by_email", (q) => q.eq("email", email))
          .unique();

        if (existingProfile) {
          // Keep the team link fresh, but never touch an existing password.
          await ctx.db.patch(existingProfile._id, {
            teamId: team._id,
            memberId: member._id,
          });
          if (existingInvite?.assignedPassword) {
            credentials.push({
              email,
              name: member.name,
              password: existingInvite.assignedPassword,
              teamCode: team.code,
            });
          }
          skipped++;
          continue;
        }

        const password = buildPassword(prefix, args.mode);

        try {
          await auth.api.signUpEmail({
            body: { email, password, name: member.name },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "account could not be created";
          failures.push(`${email}: ${message}`);
          continue;
        }

        if (existingInvite) {
          await ctx.db.patch(existingInvite._id, {
            name: member.name,
            role: "participant",
            teamId: team._id,
            memberId: member._id,
            assignedPassword: password,
            accountCreated: true,
          });
        } else {
          await ctx.db.insert("invites", {
            email,
            name: member.name,
            role: "participant",
            phone: member.phone,
            department: member.department,
            labIds: [],
            teamId: team._id,
            memberId: member._id,
            assignedPassword: password,
            accountCreated: true,
            claimed: false,
            createdAt: Date.now(),
            createdBy: admin._id,
          });
        }

        credentials.push({ email, name: member.name, password, teamCode: team.code });
        created++;
      }
    }

    return {
      created,
      skipped,
      failures: failures.slice(0, 25),
      failureCount: failures.length,
      credentials,
    };
  },
});

/** Credential sheet an organiser can read out or copy. Admin only. */
export const credentials = query({
  args: { teamId: v.optional(v.id("teams")), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    let invites = (await ctx.db.query("invites").collect()).filter(
      (i) => i.role === "participant",
    );
    if (args.teamId) invites = invites.filter((i) => i.teamId === args.teamId);

    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map<Id<"teams">, Doc<"teams">>(teams.map((t) => [t._id, t]));

    const profiles = await ctx.db.query("profiles").collect();
    const activeEmails = new Set(profiles.filter((p) => p.active).map((p) => p.email));

    const needle = args.search?.trim().toLowerCase();

    return invites
      .map((invite) => {
        const team = invite.teamId ? teamById.get(invite.teamId) : undefined;
        return {
          _id: invite._id,
          email: invite.email,
          name: invite.name,
          password: invite.assignedPassword ?? null,
          teamCode: team?.code ?? null,
          teamName: team?.name ?? null,
          teamId: invite.teamId ?? null,
          accountCreated: invite.accountCreated,
          signedIn: invite.claimed,
          active: activeEmails.has(invite.email),
        };
      })
      .filter((row) => {
        if (!needle) return true;
        return (
          row.email.includes(needle) ||
          row.name.toLowerCase().includes(needle) ||
          (row.teamCode ?? "").toLowerCase().includes(needle) ||
          (row.teamName ?? "").toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          (a.teamCode ?? "").localeCompare(b.teamCode ?? "", undefined, { numeric: true }) ||
          a.name.localeCompare(b.name),
      );
  },
});

export const setParticipantActive = mutation({
  args: { email: v.string(), active: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = normalizeEmail(args.email);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (profile) await ctx.db.patch(profile._id, { active: args.active });
    return null;
  },
});

/**
 * Public: is this address on a team roster? The participant sign-in screen
 * calls it before offering to create a password, so a stranger never gets an
 * account and a real participant is told which team they are joining as.
 */
export const checkEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) return { onRoster: false as const };

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    const member = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!member) {
      // Staff addresses are not on a roster but do have accounts.
      return { onRoster: false as const, hasAccount: profile !== null };
    }

    const team = await ctx.db.get(member.teamId);
    return {
      onRoster: true as const,
      hasAccount: profile !== null,
      memberName: member.name,
      teamName: team?.name ?? null,
      teamCode: team?.code ?? null,
    };
  },
});

/**
 * Organiser view of every participant: who is on the roster, who has signed
 * in, and the profile id needed to reset a password.
 */
export const roster = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const members = await ctx.db.query("members").collect();
    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map<Id<"teams">, Doc<"teams">>(teams.map((t) => [t._id, t]));

    const profiles = await ctx.db.query("profiles").collect();
    const profileByEmail = new Map(profiles.map((p) => [p.email, p]));

    const needle = args.search?.trim().toLowerCase();

    return members
      .map((m) => {
        const team = teamById.get(m.teamId);
        const email = m.email ? normalizeEmail(m.email) : null;
        const profile = email ? profileByEmail.get(email) : undefined;
        return {
          memberId: m._id,
          name: m.name,
          email,
          isLeader: m.isLeader,
          teamCode: team?.code ?? null,
          teamName: team?.name ?? null,
          profileId: profile?._id ?? null,
          hasAccount: profile !== undefined,
          active: profile?.active ?? false,
        };
      })
      .filter((row) => {
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) ||
          (row.email ?? "").includes(needle) ||
          (row.teamCode ?? "").toLowerCase().includes(needle) ||
          (row.teamName ?? "").toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          (a.teamCode ?? "").localeCompare(b.teamCode ?? "", undefined, { numeric: true }) ||
          Number(b.isLeader) - Number(a.isLeader) ||
          a.name.localeCompare(b.name),
      );
  },
});

/* -------------------------------------------------------------------------- */
/* Participant: my team                                                        */
/* -------------------------------------------------------------------------- */

/** Everything a participant is allowed to see about their own team. */
export const myTeam = query({
  args: {},
  handler: async (ctx) => {
    const { profile, team } = await requireOwnTeam(ctx);

    const members = (
      await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()
    ).sort(rosterOrder);

    const lab = team.labId ? await ctx.db.get(team.labId) : null;
    const coordinator = team.coordinatorId ? await ctx.db.get(team.coordinatorId) : null;

    const sessions = (
      await ctx.db.query("attendanceSessions").withIndex("by_order").collect()
    ).filter((s) => s.active);
    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    const attendance = sessions.map((session) => {
      const forSession = marks.filter((m) => m.sessionId === session._id);
      const mine = forSession.find((m) => m.memberId === profile.memberId);
      return {
        sessionId: session._id,
        sessionName: session.name,
        day: session.day,
        present: forSession.filter((m) => PRESENT.has(m.status)).length,
        marked: forSession.length,
        total: members.length,
        myStatus: mine?.status ?? null,
      };
    });

    return {
      me: { profileId: profile._id, memberId: profile.memberId ?? null, name: profile.name },
      team: {
        _id: team._id,
        code: team.code,
        name: team.name,
        projectTitle: team.projectTitle ?? null,
        problemStatementId: team.problemStatementId ?? null,
        domain: team.domain ?? null,
        track: team.track ?? null,
        college: team.college ?? null,
        status: team.status,
        tableNo: team.tableNo ?? null,
        notes: team.notes ?? null,
        photoUrl: team.photoUrl ?? null,
        imageUrls: team.imageUrls ?? [],
        problemDomain: team.problemDomain ?? null,
        registration: {
          teamSize: team.teamSize ?? null,
          accommodationCount: team.accommodationCount ?? null,
          feePerPerson: team.feePerPerson ?? null,
          stayFeePerPerson: team.stayFeePerPerson ?? null,
          registeredAt: team.registeredAt ?? null,
        },
        payment: {
          status: team.paymentStatus ?? "pending",
          link: team.paymentLink ?? null,
          amount: team.paymentAmount ?? null,
          reference: team.paymentReference ?? null,
          proofUrl: team.paymentProofUrl ?? null,
          paidAt: team.paidAt ?? null,
        },
      },
      lab: lab ? { name: lab.name, block: lab.block ?? null, floor: lab.floor ?? null } : null,
      coordinator: coordinator
        ? { name: coordinator.name, phone: coordinator.phone ?? null, email: coordinator.email }
        : null,
      members: members.map((m) => ({
        _id: m._id,
        name: m.name,
        email: m.email ?? null,
        phone: m.phone ?? null,
        department: m.department ?? null,
        year: m.year ?? null,
        rollNo: m.rollNo ?? null,
        college: m.college ?? null,
        photoUrl: m.photoUrl ?? null,
        isLeader: m.isLeader,
        memberNo: m.memberNo ?? null,
        isMe: m._id === profile.memberId,
      })),
      attendance,
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Organiser: one-tap default logins                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every team with the state of its participant logins, so the organiser can
 * see at a glance which teams still need accounts creating.
 */
export const provisioningByTeam = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const teams = await ctx.db.query("teams").collect();
    const profiles = await ctx.db.query("profiles").collect();
    const profileByEmail = new Map(profiles.map((p) => [p.email, p]));

    const needle = args.search?.trim().toLowerCase();

    const rows = await Promise.all(
      teams.map(async (team) => {
        const members = (
          await ctx.db
            .query("members")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect()
        ).sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name));

        const people = members.map((m) => {
          const email = m.email ? normalizeEmail(m.email) : null;
          const profile = email ? profileByEmail.get(email) : undefined;
          return {
            memberId: m._id,
            name: m.name,
            email,
            phone: m.phone ?? null,
            department: m.department ?? null,
            year: m.year ?? null,
            rollNo: m.rollNo ?? null,
            isLeader: m.isLeader,
            profileId: profile?._id ?? null,
            hasAccount: profile !== undefined,
            active: profile?.active ?? false,
            signedInAt: profile?.lastSeenAt ?? null,
          };
        });

        return {
          teamId: team._id,
          code: team.code,
          name: team.name,
          college: team.college ?? null,
          track: team.track ?? null,
          status: team.status,
          members: people,
          withEmail: people.filter((p) => !!p.email).length,
          withAccount: people.filter((p) => p.hasAccount).length,
          missing: people.filter((p) => !!p.email && !p.hasAccount).length,
          noEmail: people.filter((p) => !p.email).length,
        };
      }),
    );

    return {
      defaultPassword: DEFAULT_PARTICIPANT_PASSWORD,
      teams: rows
        .filter((row) => {
          if (!needle) return true;
          return (
            row.code.toLowerCase().includes(needle) ||
            row.name.toLowerCase().includes(needle) ||
            row.members.some(
              (m) =>
                m.name.toLowerCase().includes(needle) || (m.email ?? "").includes(needle),
            )
          );
        })
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    };
  },
});

/**
 * Creates a login for every member of one team that has an email and no
 * account yet, all with the shared default password. One team per call:
 * hashing a password is slow, and a whole event in a single mutation would
 * run past the time limit.
 */
export const provisionTeamDefaults = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new ConvexError({ code: "NOT_FOUND", message: "Team not found." });

    const members = await ctx.db
      .query("members")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const auth = createAuth(ctx);
    const password = DEFAULT_PARTICIPANT_PASSWORD;

    let created = 0;
    let existing = 0;
    let noEmail = 0;
    const failures: string[] = [];

    for (const member of members) {
      const email = member.email ? normalizeEmail(member.email) : "";
      if (!email.includes("@")) {
        noEmail++;
        continue;
      }

      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (profile) {
        // Already has a login: keep the team link fresh, never touch the password.
        await ctx.db.patch(profile._id, { teamId: team._id, memberId: member._id });
        existing++;
        continue;
      }

      let authUserId: string;
      try {
        const result = await auth.api.signUpEmail({
          body: { email, password, name: member.name },
        });
        authUserId = result.user.id;
      } catch (error) {
        failures.push(
          `${email}: ${error instanceof Error ? error.message : "could not be created"}`,
        );
        continue;
      }

      await ctx.db.insert("profiles", {
        authUserId,
        email,
        name: member.name,
        role: "participant",
        roles: ["participant"],
        phone: member.phone,
        department: member.department,
        labIds: [],
        teamId: team._id,
        memberId: member._id,
        pushTokens: [],
        active: true,
        createdAt: Date.now(),
      });

      const invite = await ctx.db
        .query("invites")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (invite) {
        await ctx.db.patch(invite._id, {
          name: member.name,
          role: "participant",
          teamId: team._id,
          memberId: member._id,
          assignedPassword: password,
          accountCreated: true,
        });
      } else {
        await ctx.db.insert("invites", {
          email,
          name: member.name,
          role: "participant",
          phone: member.phone,
          department: member.department,
          labIds: [],
          teamId: team._id,
          memberId: member._id,
          assignedPassword: password,
          accountCreated: true,
          claimed: false,
          createdAt: Date.now(),
          createdBy: admin._id,
        });
      }

      created++;
    }

    return { teamCode: team.code, created, existing, noEmail, failures, password };
  },
});

/**
 * Puts one participant back on the default password, for the desk queue of
 * "I changed it and forgot what to".
 */
export const resetToDefaultPassword = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const target = await ctx.db.get(args.profileId);
    if (!target) throw new ConvexError({ code: "NOT_FOUND", message: "Account not found." });
    if (target.isMaster) {
      throw new ConvexError({
        code: "MASTER_PROTECTED",
        message: "The master organiser account cannot be reset from here.",
      });
    }
    if (!(target.roles ?? [target.role]).includes("participant")) {
      throw new ConvexError({
        code: "NOT_PARTICIPANT",
        message: "Only participant logins take the shared default password.",
      });
    }

    const auth = createAuth(ctx);
    const authContext = await auth.$context;
    const hashed = await authContext.password.hash(DEFAULT_PARTICIPANT_PASSWORD);
    await authContext.internalAdapter.updatePassword(target.authUserId, hashed);

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", target.email))
      .unique();
    if (invite) {
      await ctx.db.patch(invite._id, { assignedPassword: DEFAULT_PARTICIPANT_PASSWORD });
    }

    return { email: target.email, password: DEFAULT_PARTICIPANT_PASSWORD };
  },
});

/**
 * Deletes members whose team no longer exists, along with any attendance they
 * carry. Sample rows from an early import are the usual source, and they can
 * never be given a login because there is no team behind them.
 */
export const removeOrphanMembers = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const teams = await ctx.db.query("teams").collect();
    const teamIds = new Set(teams.map((team) => team._id));

    let removed = 0;
    for (const member of await ctx.db.query("members").collect()) {
      if (teamIds.has(member.teamId)) continue;

      const marks = await ctx.db
        .query("attendance")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect();
      for (const mark of marks) await ctx.db.delete(mark._id);

      await ctx.db.delete(member._id);
      removed++;
    }

    return { removed };
  },
});
