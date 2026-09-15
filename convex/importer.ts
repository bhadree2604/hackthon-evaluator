import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { normalizeEmail, requireAdmin } from "./lib/guards";
import { paymentStatusValidator, trackValidator } from "./schema";

const importRow = v.object({
  teamCode: v.string(),
  teamName: v.string(),
  projectTitle: v.optional(v.string()),
  problemStatementId: v.optional(v.string()),
  domain: v.optional(v.string()),
  problemDomain: v.optional(v.string()),
  track: v.optional(trackValidator),
  college: v.optional(v.string()),
  lab: v.optional(v.string()),
  tableNo: v.optional(v.string()),
  coordinatorEmail: v.optional(v.string()),
  teamPhotoUrl: v.optional(v.string()),

  paymentStatus: v.optional(paymentStatusValidator),
  paymentLink: v.optional(v.string()),
  paymentAmount: v.optional(v.number()),
  paymentReference: v.optional(v.string()),
  paymentProofUrl: v.optional(v.string()),

  teamSize: v.optional(v.number()),
  accommodationCount: v.optional(v.number()),
  feePerPerson: v.optional(v.number()),
  stayFeePerPerson: v.optional(v.number()),
  registeredAt: v.optional(v.number()),

  memberNo: v.optional(v.number()),
  memberName: v.optional(v.string()),
  memberEmail: v.optional(v.string()),
  memberPhone: v.optional(v.string()),
  memberDepartment: v.optional(v.string()),
  memberYear: v.optional(v.string()),
  memberRollNo: v.optional(v.string()),
  memberPhotoUrl: v.optional(v.string()),
  isLeader: v.optional(v.boolean()),
});

/** Trimmed text, or undefined for a blank cell. */
function text(value: string | undefined) {
  return value?.trim() || undefined;
}

/**
 * A blank cell never erases what is already stored. The registration export
 * has no column for a table number, a photo or a payment link, so re-importing
 * it must not wipe the ones an organiser typed in by hand.
 */
function keepExisting<T extends object>(incoming: T, existing: Partial<T>): T {
  const merged = { ...incoming };
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    if (merged[key] === undefined) merged[key] = existing[key] as T[keyof T];
  }
  return merged;
}

/**
 * Bulk import, one row per member. Rows that repeat a team code update that
 * team instead of creating a duplicate, so the sheet can be re-uploaded after
 * a correction without producing a mess.
 *
 * The client sends this in chunks; each call is independently safe to retry.
 */
export const importRows = mutation({
  args: { rows: v.array(importRow) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();

    const warnings: string[] = [];
    let teamsCreated = 0;
    let teamsUpdated = 0;
    let membersCreated = 0;
    let membersUpdated = 0;
    let labsCreated = 0;

    const labCache = new Map<string, Id<"labs">>();
    for (const lab of await ctx.db.query("labs").collect()) {
      labCache.set(lab.name.toLowerCase(), lab._id);
    }

    const coordinatorCache = new Map<string, Id<"profiles"> | null>();

    for (const [index, row] of args.rows.entries()) {
      const lineNo = index + 1;
      const code = row.teamCode.trim().toUpperCase();
      const teamName = row.teamName.trim();
      if (!code || !teamName) {
        warnings.push(`Row ${lineNo}: missing team code or team name, skipped.`);
        continue;
      }

      // Lab, created on demand.
      let labId: Id<"labs"> | undefined;
      const labName = row.lab?.trim();
      if (labName) {
        const cached = labCache.get(labName.toLowerCase());
        if (cached) {
          labId = cached;
        } else {
          labId = await ctx.db.insert("labs", { name: labName, createdAt: now });
          labCache.set(labName.toLowerCase(), labId);
          labsCreated++;
        }
      }

      // Coordinator, matched by email against existing profiles.
      let coordinatorId: Id<"profiles"> | undefined;
      const coordEmail = row.coordinatorEmail ? normalizeEmail(row.coordinatorEmail) : "";
      if (coordEmail) {
        if (!coordinatorCache.has(coordEmail)) {
          const profile = await ctx.db
            .query("profiles")
            .withIndex("by_email", (q) => q.eq("email", coordEmail))
            .unique();
          coordinatorCache.set(
            coordEmail,
            profile && profile.role === "coordinator" ? profile._id : null,
          );
          if (!profile) {
            warnings.push(
              `Row ${lineNo}: no coordinator account for ${coordEmail}. Invite them first, then re-import.`,
            );
          } else if (profile.role !== "coordinator") {
            warnings.push(`Row ${lineNo}: ${coordEmail} is not a coordinator, assignment skipped.`);
          }
        }
        coordinatorId = coordinatorCache.get(coordEmail) ?? undefined;
      }

      const existingTeam = await ctx.db
        .query("teams")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();

      const incomingTeam = {
        name: teamName,
        projectTitle: text(row.projectTitle),
        problemStatementId: text(row.problemStatementId)?.toUpperCase(),
        domain: text(row.domain),
        problemDomain: text(row.problemDomain),
        track: row.track,
        college: text(row.college),
        tableNo: text(row.tableNo),
        photoUrl: text(row.teamPhotoUrl),
        paymentStatus: row.paymentStatus,
        paymentLink: text(row.paymentLink),
        paymentAmount: row.paymentAmount,
        paymentReference: text(row.paymentReference),
        paymentProofUrl: text(row.paymentProofUrl),
        teamSize: row.teamSize,
        accommodationCount: row.accommodationCount,
        feePerPerson: row.feePerPerson,
        stayFeePerPerson: row.stayFeePerPerson,
        registeredAt: row.registeredAt,
      };

      let teamId: Id<"teams">;
      if (existingTeam) {
        teamId = existingTeam._id;
        const merged = keepExisting(incomingTeam, existingTeam);
        await ctx.db.patch(teamId, {
          ...merged,
          // Never blank out an assignment that already exists.
          labId: labId ?? existingTeam.labId,
          coordinatorId: coordinatorId ?? existingTeam.coordinatorId,
          // Re-importing must not move the payment date to today.
          paidAt:
            merged.paymentStatus === "paid"
              ? (existingTeam.paidAt ?? merged.registeredAt ?? now)
              : undefined,
          updatedAt: now,
        });
        teamsUpdated++;
      } else {
        teamId = await ctx.db.insert("teams", {
          code,
          ...incomingTeam,
          labId,
          coordinatorId,
          status: "active",
          paidAt:
            incomingTeam.paymentStatus === "paid" ? (incomingTeam.registeredAt ?? now) : undefined,
          createdAt: now,
          updatedAt: now,
        });
        teamsCreated++;
      }

      const memberName = row.memberName?.trim();
      if (!memberName) continue;

      const memberEmail = row.memberEmail ? normalizeEmail(row.memberEmail) : undefined;
      const siblings = await ctx.db
        .query("members")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .collect();

      const match = siblings.find(
        (m) =>
          (memberEmail && m.email === memberEmail) ||
          m.name.toLowerCase() === memberName.toLowerCase(),
      );

      const incomingMember = {
        teamId,
        name: memberName,
        email: memberEmail,
        phone: text(row.memberPhone),
        college: text(row.college),
        department: text(row.memberDepartment),
        year: text(row.memberYear),
        rollNo: text(row.memberRollNo),
        photoUrl: text(row.memberPhotoUrl),
        memberNo: row.memberNo,
        isLeader: row.isLeader,
      };

      if (match) {
        await ctx.db.patch(match._id, keepExisting(incomingMember, match));
        membersUpdated++;
      } else {
        await ctx.db.insert("members", {
          ...incomingMember,
          isLeader: row.isLeader ?? false,
          createdAt: now,
        });
        membersCreated++;
      }

      // Exactly one leader per team.
      if (row.isLeader) {
        for (const s of siblings) {
          if (s.isLeader && s._id !== match?._id) {
            await ctx.db.patch(s._id, { isLeader: false });
          }
        }
      }
    }

    return {
      teamsCreated,
      teamsUpdated,
      membersCreated,
      membersUpdated,
      labsCreated,
      warnings: warnings.slice(0, 50),
      warningCount: warnings.length,
    };
  },
});

/** Wipes participant data. Auth accounts, labs and the rubric are untouched. */
export const clearParticipants = mutation({
  args: { confirm: v.literal("DELETE") },
  handler: async (ctx) => {
    await requireAdmin(ctx);

    for (const table of [
      "attendance",
      "scores",
      "messages",
      "chats",
      "members",
      "teams",
    ] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    // Participant accounts only exist to view a team, so they go too.
    const invites = await ctx.db.query("invites").collect();
    for (const invite of invites) {
      if (invite.role === "participant") await ctx.db.delete(invite._id);
    }
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_role", (q) => q.eq("role", "participant"))
      .collect();
    for (const profile of profiles) await ctx.db.delete(profile._id);

    return null;
  },
});
