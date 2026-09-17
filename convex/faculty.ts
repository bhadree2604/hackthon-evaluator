import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdmin, requireEvaluator, requireStaff } from "./lib/guards";

/**
 * The college staff roster.
 *
 * Internal evaluators are faculty, and a faculty member is identified by the
 * employee id printed on their staff card. The roster exists so a sheet can be
 * signed by typing that id: the name comes off this table rather than being
 * retyped, which is what stops one person appearing on the leaderboard as
 * "KARTHIK PRABHU D", "Dr.D.Karthik Prabhu" and "karthik" across three rounds.
 *
 * Imported from the approval system's user table. That table is a Django auth
 * table and also holds password hashes, login timestamps and student records;
 * none of that is imported here. Only the employee id, the name, the email and
 * the department come across, and only for non-student, active accounts.
 */

/** Employee ids are matched case- and space-insensitively. */
function keyOf(employeeId: string) {
  return employeeId.trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Upsert the roster. Organisers only.
 *
 * Matching is on the employee id, so re-running this with a corrected export
 * updates the names in place rather than doubling the roster. Ids that are no
 * longer in the export are left alone rather than deleted: a sheet may already
 * cite one, and a name that has been signed should stay resolvable.
 */
export const importRoster = mutation({
  args: {
    rows: v.array(
      v.object({
        employeeId: v.string(),
        name: v.string(),
        email: v.optional(v.string()),
        department: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of args.rows) {
      const employeeId = row.employeeId.trim();
      const name = row.name.trim();
      if (!employeeId || !name) {
        skipped++;
        continue;
      }

      const searchKey = keyOf(employeeId);
      const existing = await ctx.db
        .query("faculty")
        .withIndex("by_employeeId", (q) => q.eq("searchKey", searchKey))
        .unique();

      const fields = {
        employeeId,
        name,
        email: row.email?.trim().toLowerCase() || undefined,
        department: row.department?.trim() || undefined,
        searchKey,
        active: true,
        importedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, fields);
        updated++;
      } else {
        await ctx.db.insert("faculty", fields);
        created++;
      }
    }

    const total = (await ctx.db.query("faculty").collect()).length;
    return { created, updated, skipped, total };
  },
});

/**
 * The same upsert, for loading the roster from the command line.
 *
 * Internal, so it is not reachable from the app. `npx convex run` authenticates
 * with the deployment's admin key and carries no signed-in user, which is why
 * the organiser-gated `importRoster` above cannot be used for the initial load.
 */
export const seedRoster = internalMutation({
  args: {
    rows: v.array(
      v.object({
        employeeId: v.string(),
        name: v.string(),
        email: v.optional(v.string()),
        department: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const row of args.rows) {
      const employeeId = row.employeeId.trim();
      const name = row.name.trim();
      if (!employeeId || !name) continue;

      const searchKey = keyOf(employeeId);
      const existing = await ctx.db
        .query("faculty")
        .withIndex("by_employeeId", (q) => q.eq("searchKey", searchKey))
        .unique();

      const fields = {
        employeeId,
        name,
        email: row.email?.trim().toLowerCase() || undefined,
        department: row.department?.trim() || undefined,
        searchKey,
        active: true,
        importedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, fields);
        updated++;
      } else {
        await ctx.db.insert("faculty", fields);
        created++;
      }
    }

    return { created, updated, total: (await ctx.db.query("faculty").collect()).length };
  },
});

/** Wipe the roster. Organisers only, and only ever used to re-import cleanly. */
export const clearRoster = mutation({
  args: { confirm: v.literal("DELETE") },
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("faculty").collect();
    for (const row of all) await ctx.db.delete(row._id);
    return { removed: all.length };
  },
});

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resolve one employee id to a name, for the field that fills itself in.
 *
 * Returns null rather than throwing when the id is not on the roster: the
 * evaluator is typing, and most of what they type on the way to a valid id is
 * not one. The screen shows "not on the roster" and still lets them past,
 * because a new member of staff may not be in the export yet.
 */
export const lookup = query({
  args: { employeeId: v.string() },
  handler: async (ctx, args) => {
    await requireEvaluator(ctx);
    const searchKey = keyOf(args.employeeId);
    if (!searchKey) return null;

    const row = await ctx.db
      .query("faculty")
      .withIndex("by_employeeId", (q) => q.eq("searchKey", searchKey))
      .unique();
    if (!row || !row.active) return null;

    return {
      employeeId: row.employeeId,
      name: row.name,
      email: row.email ?? null,
      department: row.department ?? null,
    };
  },
});

/**
 * The dropdown. Matches on employee id or on any word of the name.
 *
 * With no query this returns the first page of the roster alphabetically, so
 * the list is useful before anything is typed. The roster is around five
 * hundred rows, which is small enough to filter in the function.
 */
export const search = query({
  args: { query: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireEvaluator(ctx);
    const limit = Math.min(args.limit ?? 25, 100);
    const needle = (args.query ?? "").trim().toLowerCase();

    const all = (await ctx.db.query("faculty").collect()).filter((row) => row.active);

    const matched = needle
      ? all.filter(
          (row) =>
            row.searchKey.includes(needle) ||
            row.name.toLowerCase().includes(needle) ||
            (row.email ?? "").includes(needle),
        )
      : all;

    /** An id typed in full should be the first thing offered, not the tenth. */
    matched.sort((a, b) => {
      if (needle) {
        const exact = Number(b.searchKey === needle) - Number(a.searchKey === needle);
        if (exact) return exact;
        const starts =
          Number(b.searchKey.startsWith(needle)) - Number(a.searchKey.startsWith(needle));
        if (starts) return starts;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      rows: matched.slice(0, limit).map((row) => ({
        employeeId: row.employeeId,
        name: row.name,
        department: row.department ?? null,
      })),
      matched: matched.length,
      total: all.length,
    };
  },
});

/** Roster size, for the organiser's setup screen. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const all = await ctx.db.query("faculty").collect();
    return {
      total: all.length,
      active: all.filter((row) => row.active).length,
      importedAt: all.reduce<number | null>(
        (latest, row) => (latest === null || row.importedAt > latest ? row.importedAt : latest),
        null,
      ),
    };
  },
});

/**
 * Add or correct one person by hand. Organisers only.
 *
 * The export is a snapshot; somebody who joined last week evaluates anyway.
 */
export const upsert = mutation({
  args: {
    employeeId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    department: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const employeeId = args.employeeId.trim();
    const name = args.name.trim();
    if (!employeeId || !name) {
      throw new ConvexError({
        code: "BAD_INPUT",
        message: "An employee id and a name are both required.",
      });
    }

    const searchKey = keyOf(employeeId);
    const existing = await ctx.db
      .query("faculty")
      .withIndex("by_employeeId", (q) => q.eq("searchKey", searchKey))
      .unique();

    const fields = {
      employeeId,
      name,
      email: args.email?.trim().toLowerCase() || undefined,
      department: args.department?.trim() || undefined,
      searchKey,
      active: args.active ?? true,
      importedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return { created: false, employeeId, name };
    }

    await ctx.db.insert("faculty", fields);
    return { created: true, employeeId, name };
  },
});
