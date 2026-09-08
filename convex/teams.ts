import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  coordinatorOwnsTeam,
  requireAdmin,
  requireStaff,
  type Ctx,
} from "./lib/guards";
import { paymentStatusValidator, teamStatusValidator, trackValidator } from "./schema";

/**
 * Teams the caller is allowed to see.
 * - admin / evaluator: every team
 * - coordinator: teams explicitly assigned to them, plus teams in their labs
 */
async function visibleTeams(ctx: Ctx, profile: Doc<"profiles">) {
  if (profile.role !== "coordinator") {
    return ctx.db.query("teams").collect();
  }

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
    for (const team of inLab) {
      if (!seen.has(team._id)) {
        seen.add(team._id);
        result.push(team);
      }
    }
  }
  return result;
}

/**
 * Coordinators are explicitly not part of the evaluation panel, so scores are
 * stripped here rather than merely hidden in the UI.
 */
async function decorate(ctx: QueryCtx, teams: Doc<"teams">[], viewer: Doc<"profiles">) {
  const canSeeScores = viewer.role === "admin" || viewer.role === "evaluator";
  const labs = await ctx.db.query("labs").collect();
  const labById = new Map(labs.map((l) => [l._id, l]));

  const coordinators = await ctx.db
    .query("profiles")
    .withIndex("by_role", (q) => q.eq("role", "coordinator"))
    .collect();
  const coordinatorById = new Map(coordinators.map((c) => [c._id, c]));

  return Promise.all(
    teams.map(async (team) => {
      const members = await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      const scores = await ctx.db
        .query("scores")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      const submitted = scores.filter((s) => s.submitted);
      const avgPercent = submitted.length
        ? submitted.reduce((sum, s) => sum + s.percent, 0) / submitted.length
        : null;

      const lab = team.labId ? labById.get(team.labId) : undefined;
      const coordinator = team.coordinatorId
        ? coordinatorById.get(team.coordinatorId)
        : undefined;

      return {
        _id: team._id,
        code: team.code,
        name: team.name,
        projectTitle: team.projectTitle,
        problemStatementId: team.problemStatementId,
        domain: team.domain,
        track: team.track,
        college: team.college,
        tableNo: team.tableNo,
        status: team.status,
        notes: team.notes,
        photoUrl: team.photoUrl ?? null,
        paymentStatus: team.paymentStatus ?? "pending",
        paymentLink: team.paymentLink ?? null,
        paymentAmount: team.paymentAmount ?? null,
        labId: team.labId,
        labName: lab?.name ?? null,
        labBlock: lab?.block ?? null,
        coordinatorId: team.coordinatorId,
        coordinatorName: coordinator?.name ?? null,
        coordinatorPhone: coordinator?.phone ?? null,
        memberCount: members.length,
        leader: members.find((m) => m.isLeader)?.name ?? members[0]?.name ?? null,
        evaluationCount: canSeeScores ? submitted.length : 0,
        avgPercent: canSeeScores ? avgPercent : null,
      };
    }),
  );
}

export type TeamCard = Awaited<ReturnType<typeof decorate>>[number];

export const list = query({
  args: {
    search: v.optional(v.string()),
    labId: v.optional(v.id("labs")),
    status: v.optional(teamStatusValidator),
    /** Evaluator shortcut: everything, still to score, or already submitted. */
    scope: v.optional(
      v.union(v.literal("all"), v.literal("todo"), v.literal("done")),
    ),
    /** Scopes "scored by me" to a single round. */
    roundId: v.optional(v.id("rounds")),
    unassignedOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    let teams = await visibleTeams(ctx, profile);

    if (args.labId) teams = teams.filter((t) => t.labId === args.labId);
    if (args.status) teams = teams.filter((t) => t.status === args.status);

    const needle = args.search?.trim().toLowerCase();
    if (needle) {
      teams = teams.filter(
        (t) =>
          t.name.toLowerCase().includes(needle) ||
          t.code.toLowerCase().includes(needle) ||
          (t.projectTitle ?? "").toLowerCase().includes(needle) ||
          (t.problemStatementId ?? "").toLowerCase().includes(needle),
      );
    }

    if (args.unassignedOnly) {
      teams = teams.filter((t) => !t.coordinatorId || !t.labId);
    }

    const decorated = await decorate(ctx, teams, profile);

    // Scored / still to score is a per round question once rounds exist.
    const roundId = args.roundId;
    const mine = roundId
      ? await ctx.db
          .query("scores")
          .withIndex("by_round_evaluator", (q) =>
            q.eq("roundId", roundId).eq("evaluatorId", profile._id),
          )
          .collect()
      : await ctx.db
          .query("scores")
          .withIndex("by_evaluator", (q) => q.eq("evaluatorId", profile._id))
          .collect();
    const submittedByMe = new Set(mine.filter((s) => s.submitted).map((s) => s.teamId));
    const draftByMe = new Set(mine.filter((s) => !s.submitted).map((s) => s.teamId));

    let cards = decorated.map((card) => ({
      ...card,
      scoredByMe: submittedByMe.has(card._id),
      draftByMe: draftByMe.has(card._id),
    }));

    if (args.scope === "todo") cards = cards.filter((c) => !c.scoredByMe);
    if (args.scope === "done") cards = cards.filter((c) => c.scoredByMe);

    return cards.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  },
});

/** Full detail for one team, scoped to what the caller may read. */
export const get = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    if (profile.role === "coordinator" && !coordinatorOwnsTeam(profile, team)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "This team is not assigned to you." });
    }

    const [card] = await decorate(ctx, [team], profile);
    const members = (
      await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()
    ).sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name));

    const sessions = await ctx.db.query("attendanceSessions").withIndex("by_order").collect();
    const activeSessions = sessions.filter((s) => s.active);
    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    const attendanceBySession = activeSessions.map((session) => {
      const forSession = marks.filter((m) => m.sessionId === session._id);
      const present = forSession.filter(
        (m) => m.status === "present" || m.status === "late",
      ).length;
      return {
        sessionId: session._id,
        sessionName: session.name,
        day: session.day,
        present,
        marked: forSession.length,
        total: members.length,
      };
    });

    // Evaluators only ever see their own sheet; admins see the whole panel.
    const allScores = await ctx.db
      .query("scores")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();
    const evaluatorNames = new Map<string, string>();
    for (const s of allScores) {
      const e = await ctx.db.get(s.evaluatorId);
      if (e) evaluatorNames.set(s.evaluatorId, e.name);
    }

    const canSeeAllScores = profile.role === "admin";
    const scores = allScores
      .filter((s) => canSeeAllScores || s.evaluatorId === profile._id)
      .map((s) => ({
        _id: s._id,
        evaluatorId: s.evaluatorId,
        evaluatorName: evaluatorNames.get(s.evaluatorId) ?? "Evaluator",
        values: s.values,
        total: s.total,
        maxTotal: s.maxTotal,
        percent: s.percent,
        notes: s.notes,
        submitted: s.submitted,
        updatedAt: s.updatedAt,
      }));

    return { team: card, members, attendanceBySession, scores };
  },
});

/**
 * Scanner lookup. The QR and the barcode on a team's badge both carry the team
 * code, so this is the one entry point both of them land on.
 */
export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);

    // Badges are printed upper case; a manually typed code may not be.
    const code = args.code.trim().toUpperCase();
    if (!code) return null;

    const team = await ctx.db
      .query("teams")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!team) return null;

    if (profile.role === "coordinator" && !coordinatorOwnsTeam(profile, team)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: `${team.code} is not one of your teams.`,
      });
    }

    const [card] = await decorate(ctx, [team], profile);
    const members = (
      await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect()
    ).sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.name.localeCompare(b.name));

    return {
      team: card,
      members: members.map((m) => ({
        _id: m._id,
        name: m.name,
        email: m.email ?? null,
        phone: m.phone ?? null,
        department: m.department ?? null,
        year: m.year ?? null,
        rollNo: m.rollNo ?? null,
        isLeader: m.isLeader,
      })),
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Admin write paths                                                           */
/* -------------------------------------------------------------------------- */

export const upsert = mutation({
  args: {
    teamId: v.optional(v.id("teams")),
    code: v.string(),
    name: v.string(),
    projectTitle: v.optional(v.string()),
    problemStatementId: v.optional(v.string()),
    domain: v.optional(v.string()),
    track: v.optional(trackValidator),
    college: v.optional(v.string()),
    labId: v.optional(v.id("labs")),
    tableNo: v.optional(v.string()),
    coordinatorId: v.optional(v.id("profiles")),
    status: v.optional(teamStatusValidator),
    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const code = args.code.trim().toUpperCase();
    const name = args.name.trim();
    if (!code || !name) {
      throw new ConvexError({ code: "BAD_INPUT", message: "Team code and name are required." });
    }

    const clash = await ctx.db
      .query("teams")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (clash && clash._id !== args.teamId) {
      throw new ConvexError({ code: "DUPLICATE", message: `Team code ${code} is already used.` });
    }

    const fields = {
      code,
      name,
      projectTitle: args.projectTitle?.trim() || undefined,
      problemStatementId: args.problemStatementId?.trim().toUpperCase() || undefined,
      domain: args.domain?.trim() || undefined,
      track: args.track,
      college: args.college?.trim() || undefined,
      labId: args.labId,
      tableNo: args.tableNo?.trim() || undefined,
      coordinatorId: args.coordinatorId,
      status: args.status ?? ("active" as const),
      notes: args.notes?.trim() || undefined,
      photoUrl: args.photoUrl?.trim() || undefined,
      updatedAt: Date.now(),
    };

    if (args.teamId) {
      await ctx.db.patch(args.teamId, fields);
      return args.teamId;
    }
    return ctx.db.insert("teams", { ...fields, createdAt: Date.now() });
  },
});

export const assign = mutation({
  args: {
    teamId: v.id("teams"),
    labId: v.optional(v.id("labs")),
    coordinatorId: v.optional(v.id("profiles")),
    tableNo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.teamId, {
      labId: args.labId,
      coordinatorId: args.coordinatorId,
      tableNo: args.tableNo?.trim() || undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Registration payment, visible to the team on their own screen. */
export const setPayment = mutation({
  args: {
    teamId: v.id("teams"),
    paymentStatus: paymentStatusValidator,
    paymentLink: v.optional(v.string()),
    paymentAmount: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    paymentProofUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.teamId, {
      paymentStatus: args.paymentStatus,
      paymentLink: args.paymentLink?.trim() || undefined,
      paymentAmount: args.paymentAmount,
      paymentReference: args.paymentReference?.trim() || undefined,
      paymentProofUrl: args.paymentProofUrl?.trim() || undefined,
      paidAt: args.paymentStatus === "paid" ? Date.now() : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setStatus = mutation({
  args: { teamId: v.id("teams"), status: teamStatusValidator },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.teamId, { status: args.status, updatedAt: Date.now() });
    return null;
  },
});

/** Deletes the team and every row that points at it. */
export const remove = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const members = await ctx.db
      .query("members")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const m of marks) await ctx.db.delete(m._id);

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    for (const s of scores) await ctx.db.delete(s._id);

    await ctx.db.delete(args.teamId);
    return null;
  },
});

/* -------------------------------------------------------------------------- */
/* Members                                                                     */
/* -------------------------------------------------------------------------- */

export const upsertMember = mutation({
  args: {
    memberId: v.optional(v.id("members")),
    teamId: v.id("teams"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    college: v.optional(v.string()),
    department: v.optional(v.string()),
    year: v.optional(v.string()),
    rollNo: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    isLeader: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError({ code: "BAD_INPUT", message: "Member name is required." });

    const fields = {
      teamId: args.teamId,
      name,
      email: args.email?.trim().toLowerCase() || undefined,
      phone: args.phone?.trim() || undefined,
      college: args.college?.trim() || undefined,
      department: args.department?.trim() || undefined,
      year: args.year?.trim() || undefined,
      rollNo: args.rollNo?.trim() || undefined,
      photoUrl: args.photoUrl?.trim() || undefined,
      isLeader: args.isLeader ?? false,
    };

    if (args.isLeader) {
      const siblings = await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
        .collect();
      for (const s of siblings) {
        if (s.isLeader && s._id !== args.memberId) {
          await ctx.db.patch(s._id, { isLeader: false });
        }
      }
    }

    if (args.memberId) {
      await ctx.db.patch(args.memberId, fields);
      return args.memberId;
    }
    return ctx.db.insert("members", { ...fields, createdAt: Date.now() });
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const marks = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
    for (const m of marks) await ctx.db.delete(m._id);
    await ctx.db.delete(args.memberId);
    return null;
  },
});
