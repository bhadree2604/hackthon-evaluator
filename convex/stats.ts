import { query } from "./_generated/server";
import {
  requireAdmin,
  requireCoordinator,
  requireEvaluator,
  requireStaff,
  rolesOf,
} from "./lib/guards";

const PRESENT = new Set(["present", "late"]);

export const adminOverview = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);

    const [teams, members, labs, profiles, invites, criteria, sessions, scores] =
      await Promise.all([
        ctx.db.query("teams").collect(),
        ctx.db.query("members").collect(),
        ctx.db.query("labs").collect(),
        ctx.db.query("profiles").collect(),
        ctx.db.query("invites").collect(),
        ctx.db.query("criteria").collect(),
        ctx.db.query("attendanceSessions").collect(),
        ctx.db.query("scores").collect(),
      ]);

    const activeTeams = teams.filter((t) => t.status === "active");
    const submitted = scores.filter((s) => s.submitted);
    const scoredTeamIds = new Set(submitted.map((s) => s.teamId));

    const evaluators = profiles.filter((p) => p.active && rolesOf(p).includes("evaluator"));
    const coordinators = profiles.filter((p) => p.active && rolesOf(p).includes("coordinator"));
    const participants = profiles.filter((p) => p.active && rolesOf(p).includes("participant"));

    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("room", "general"))
      .order("desc")
      .take(100);
    const since = admin.chatLastReadAt ?? 0;
    const unreadMessages = recentMessages.filter(
      (m) => m.createdAt > since && m.authorProfileId !== admin._id,
    ).length;
    const openChats = new Set(
      recentMessages.filter((m) => m.authorRole === "participant").map((m) => m.authorProfileId),
    );
    const paidTeams = activeTeams.filter((t) => t.paymentStatus === "paid").length;
    const claimedEmails = new Set(profiles.map((p) => p.email));
    const pendingInvites = invites.filter((i) => !claimedEmails.has(i.email));

    const latestSession = sessions
      .filter((s) => s.active)
      .sort((a, b) => b.order - a.order)[0];

    let attendanceRate = null as number | null;
    let latestSessionName = null as string | null;
    if (latestSession && members.length) {
      const marks = await ctx.db
        .query("attendance")
        .withIndex("by_session", (q) => q.eq("sessionId", latestSession._id))
        .collect();
      const present = marks.filter((m) => PRESENT.has(m.status)).length;
      attendanceRate = Math.round((present / members.length) * 100);
      latestSessionName = latestSession.name;
    }

    return {
      teams: teams.length,
      activeTeams: activeTeams.length,
      members: members.length,
      labs: labs.length,
      evaluators: evaluators.length,
      coordinators: coordinators.length,
      participants: participants.length,
      participantAccounts: participants.length,
      openChats: openChats.size,
      unreadMessages,
      paidTeams,
      unpaidTeams: Math.max(0, activeTeams.length - paidTeams),
      pendingInvites: pendingInvites.length,
      criteria: criteria.filter((c) => c.active).length,
      sessions: sessions.filter((s) => s.active).length,
      teamsScored: scoredTeamIds.size,
      teamsUnscored: Math.max(0, activeTeams.length - scoredTeamIds.size),
      evaluationsSubmitted: submitted.length,
      unassignedTeams: activeTeams.filter((t) => !t.coordinatorId || !t.labId).length,
      attendanceRate,
      latestSessionName,
      needsRubric: criteria.length === 0,
      needsSessions: sessions.length === 0,
    };
  },
});

export const evaluatorOverview = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireEvaluator(ctx);
    const teams = (await ctx.db.query("teams").collect()).filter((t) => t.status === "active");
    const mine = await ctx.db
      .query("scores")
      .withIndex("by_evaluator", (q) => q.eq("evaluatorId", profile._id))
      .collect();

    const submitted = mine.filter((s) => s.submitted);
    const members = await ctx.db.query("members").collect();
    const teamIds = new Set(teams.map((t) => t._id));

    return {
      totalTeams: teams.length,
      totalMembers: members.filter((m) => teamIds.has(m.teamId)).length,
      submitted: submitted.length,
      drafts: mine.length - submitted.length,
      remaining: Math.max(0, teams.length - submitted.length),
      averagePercent: submitted.length
        ? submitted.reduce((sum, s) => sum + s.percent, 0) / submitted.length
        : null,
    };
  },
});

export const coordinatorOverview = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireCoordinator(ctx);

    const byCoordinator = await ctx.db
      .query("teams")
      .withIndex("by_coordinator", (q) => q.eq("coordinatorId", profile._id))
      .collect();
    const seen = new Set(byCoordinator.map((t) => t._id));
    const teams = [...byCoordinator];
    for (const labId of profile.labIds) {
      const inLab = await ctx.db
        .query("teams")
        .withIndex("by_lab", (q) => q.eq("labId", labId))
        .collect();
      for (const t of inLab) {
        if (!seen.has(t._id)) {
          seen.add(t._id);
          teams.push(t);
        }
      }
    }

    const activeTeams = teams.filter((t) => t.status === "active");
    let memberCount = 0;
    for (const team of activeTeams) {
      const members = await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      memberCount += members.length;
    }

    const labs = (await Promise.all(profile.labIds.map((id) => ctx.db.get(id)))).filter(
      (l) => l !== null,
    );

    const sessions = (
      await ctx.db.query("attendanceSessions").withIndex("by_order").collect()
    ).filter((s) => s.active);
    const latest = sessions[sessions.length - 1];

    let presentNow = 0;
    let markedNow = 0;
    if (latest) {
      const teamIds = new Set(activeTeams.map((t) => t._id));
      const marks = (
        await ctx.db
          .query("attendance")
          .withIndex("by_session", (q) => q.eq("sessionId", latest._id))
          .collect()
      ).filter((m) => teamIds.has(m.teamId));
      presentNow = marks.filter((m) => PRESENT.has(m.status)).length;
      markedNow = marks.length;
    }

    return {
      teams: activeTeams.length,
      members: memberCount,
      labs: labs.map((l) => ({ _id: l._id, name: l.name, block: l.block ?? null })),
      latestSession: latest ? { _id: latest._id, name: latest.name, day: latest.day } : null,
      presentNow,
      markedNow,
      pendingNow: Math.max(0, memberCount - markedNow),
      attendanceRate: memberCount ? Math.round((presentNow / memberCount) * 100) : 0,
    };
  },
});

/** Static event facts shown on the sign-in and profile screens. */
export const event = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "event"))
      .unique();
    return (row?.value ?? null) as Record<string, unknown> | null;
  },
});
