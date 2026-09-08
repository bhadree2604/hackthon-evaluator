import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  coordinatorOwnsTeam,
  requireCoordinator,
  requireStaff,
  type Ctx,
} from "./lib/guards";
import { attendanceStatusValidator } from "./schema";

const PRESENT = new Set(["present", "late"]);

async function teamsForProfile(ctx: Ctx, profile: Doc<"profiles">) {
  if (profile.role !== "coordinator") return ctx.db.query("teams").collect();

  const byCoordinator = await ctx.db
    .query("teams")
    .withIndex("by_coordinator", (q) => q.eq("coordinatorId", profile._id))
    .collect();
  const seen = new Set<Id<"teams">>(byCoordinator.map((t) => t._id));
  const result = [...byCoordinator];
  for (const labId of profile.labIds) {
    const inLab = await ctx.db
      .query("teams")
      .withIndex("by_lab", (q) => q.eq("labId", labId))
      .collect();
    for (const t of inLab) {
      if (!seen.has(t._id)) {
        seen.add(t._id);
        result.push(t);
      }
    }
  }
  return result;
}

/**
 * The marking board: every team the caller can act on, with its members and
 * the current mark for the chosen session.
 */
export const board = query({
  args: { sessionId: v.id("attendanceSessions"), labId: v.optional(v.id("labs")) },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    let teams = await teamsForProfile(ctx, profile);
    if (args.labId) teams = teams.filter((t) => t.labId === args.labId);
    teams = teams.filter((t) => t.status === "active");

    const labs = await ctx.db.query("labs").collect();
    const labById = new Map(labs.map((l) => [l._id, l]));

    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const markByMember = new Map(marks.map((m) => [m.memberId, m]));

    const rows = await Promise.all(
      teams.map(async (team) => {
        const members = (
          await ctx.db
            .query("members")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect()
        ).sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name));

        const memberRows = members.map((m) => {
          const mark = markByMember.get(m._id);
          return {
            _id: m._id,
            name: m.name,
            phone: m.phone,
            department: m.department,
            isLeader: m.isLeader,
            status: mark?.status ?? null,
            markedAt: mark?.markedAt ?? null,
          };
        });

        const present = memberRows.filter((m) => m.status && PRESENT.has(m.status)).length;
        const marked = memberRows.filter((m) => m.status !== null).length;

        return {
          teamId: team._id,
          code: team.code,
          name: team.name,
          labName: team.labId ? (labById.get(team.labId)?.name ?? null) : null,
          tableNo: team.tableNo ?? null,
          // coordinatorOwnsTeam already lets organisers through, by role
          // membership rather than the legacy single `role` field.
          canMark: coordinatorOwnsTeam(profile, team),
          members: memberRows,
          present,
          marked,
          total: memberRows.length,
        };
      }),
    );

    return rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  },
});

async function writeMark(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  sessionId: Id<"attendanceSessions">,
  member: Doc<"members">,
  status: "present" | "absent" | "late" | "excused",
  note?: string,
) {
  const existing = await ctx.db
    .query("attendance")
    .withIndex("by_session_member", (q) =>
      q.eq("sessionId", sessionId).eq("memberId", member._id),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      status,
      markedBy: profile._id,
      markedAt: Date.now(),
      note: note?.trim() || undefined,
    });
    return existing._id;
  }

  return ctx.db.insert("attendance", {
    sessionId,
    teamId: member.teamId,
    memberId: member._id,
    status,
    markedBy: profile._id,
    markedAt: Date.now(),
    note: note?.trim() || undefined,
  });
}

export const mark = mutation({
  args: {
    sessionId: v.id("attendanceSessions"),
    memberId: v.id("members"),
    status: attendanceStatusValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await requireCoordinator(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new ConvexError({ code: "NOT_FOUND", message: "Member not found." });

    const team = await ctx.db.get(member.teamId);
    if (!team) throw new ConvexError({ code: "NOT_FOUND", message: "Team not found." });
    if (!coordinatorOwnsTeam(profile, team)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "This team is not assigned to you." });
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session || !session.active) {
      throw new ConvexError({ code: "CLOSED", message: "That attendance session is closed." });
    }

    await writeMark(ctx, profile, args.sessionId, member, args.status, args.note);
    return null;
  },
});

/** One tap to mark every member of a team. */
export const markTeam = mutation({
  args: {
    sessionId: v.id("attendanceSessions"),
    teamId: v.id("teams"),
    status: attendanceStatusValidator,
  },
  handler: async (ctx, args) => {
    const profile = await requireCoordinator(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new ConvexError({ code: "NOT_FOUND", message: "Team not found." });
    if (!coordinatorOwnsTeam(profile, team)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "This team is not assigned to you." });
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session || !session.active) {
      throw new ConvexError({ code: "CLOSED", message: "That attendance session is closed." });
    }

    const members = await ctx.db
      .query("members")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const member of members) {
      await writeMark(ctx, profile, args.sessionId, member, args.status);
    }
    return { marked: members.length };
  },
});

/** Read-only rollup used by evaluators and the admin overview. */
export const overview = query({
  args: { sessionId: v.optional(v.id("attendanceSessions")) },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    const teams = (await teamsForProfile(ctx, profile)).filter((t) => t.status === "active");

    const sessions = (
      await ctx.db.query("attendanceSessions").withIndex("by_order").collect()
    ).filter((s) => s.active);
    const targetSessions = args.sessionId
      ? sessions.filter((s) => s._id === args.sessionId)
      : sessions;

    const labs = await ctx.db.query("labs").collect();
    const labById = new Map(labs.map((l) => [l._id, l]));

    const allMarks = args.sessionId
      ? await ctx.db
          .query("attendance")
          .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId!))
          .collect()
      : await ctx.db.query("attendance").collect();

    const rows = await Promise.all(
      teams.map(async (team) => {
        const members = await ctx.db
          .query("members")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();
        const memberIds = new Set(members.map((m) => m._id));
        const teamMarks = allMarks.filter((m) => memberIds.has(m.memberId));

        const perSession = targetSessions.map((session) => {
          const forSession = teamMarks.filter((m) => m.sessionId === session._id);
          return {
            sessionId: session._id,
            sessionName: session.name,
            day: session.day,
            present: forSession.filter((m) => PRESENT.has(m.status)).length,
            marked: forSession.length,
            total: members.length,
          };
        });

        const totalSlots = members.length * targetSessions.length;
        const totalPresent = perSession.reduce((sum, s) => sum + s.present, 0);

        return {
          teamId: team._id,
          code: team.code,
          name: team.name,
          labName: team.labId ? (labById.get(team.labId)?.name ?? null) : null,
          memberCount: members.length,
          perSession,
          totalPresent,
          totalSlots,
          rate: totalSlots ? Math.round((totalPresent / totalSlots) * 100) : 0,
        };
      }),
    );

    return {
      sessions: targetSessions.map((s) => ({ _id: s._id, name: s.name, day: s.day })),
      rows: rows.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    };
  },
});

/** Headline numbers for one session. */
export const sessionSummary = query({
  args: { sessionId: v.id("attendanceSessions") },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    const teams = (await teamsForProfile(ctx, profile)).filter((t) => t.status === "active");
    const teamIds = new Set(teams.map((t) => t._id));

    let total = 0;
    for (const team of teams) {
      const members = await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      total += members.length;
    }

    const marks = (
      await ctx.db
        .query("attendance")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect()
    ).filter((m) => teamIds.has(m.teamId));

    const present = marks.filter((m) => PRESENT.has(m.status)).length;
    const absent = marks.filter((m) => m.status === "absent").length;
    const excused = marks.filter((m) => m.status === "excused").length;

    return {
      total,
      marked: marks.length,
      present,
      absent,
      excused,
      pending: Math.max(0, total - marks.length),
      rate: total ? Math.round((present / total) * 100) : 0,
    };
  },
});
