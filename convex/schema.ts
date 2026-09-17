import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("evaluator"),
  v.literal("coordinator"),
  v.literal("participant"),
);

/** Roles an admin can invite from the People screen. */
export const staffRoleValidator = v.union(
  v.literal("admin"),
  v.literal("evaluator"),
  v.literal("coordinator"),
);

export const teamStatusValidator = v.union(
  v.literal("active"),
  v.literal("disqualified"),
  v.literal("withdrawn"),
);

export const attendanceStatusValidator = v.union(
  v.literal("present"),
  v.literal("absent"),
  v.literal("late"),
  v.literal("excused"),
);

export const trackValidator = v.union(
  v.literal("software"),
  v.literal("hardware"),
  v.literal("open"),
);

export const paymentStatusValidator = v.union(
  v.literal("paid"),
  v.literal("pending"),
  v.literal("failed"),
  v.literal("waived"),
);

export const roundStatusValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("locked"),
);

export const audienceValidator = v.union(
  v.literal("all"),
  v.literal("participants"),
  v.literal("coordinators"),
  v.literal("evaluators"),
  v.literal("admins"),
);

export default defineSchema({
  /**
   * App-side identity. One row per person who can sign in, linked to the
   * Better Auth user by `authUserId`. Role lives here, never on the client.
   */
  profiles: defineTable({
    authUserId: v.string(),
    email: v.string(), // always stored lowercased
    name: v.string(),
    /**
     * Primary role, kept for sorting and for rows created before multi-role.
     * `roles` is the authority; read it through `rolesOf()`.
     */
    role: roleValidator,
    /** Every role this person may sign in as. One email, many hats. */
    roles: v.optional(v.array(roleValidator)),
    /**
     * The master organiser. Other organisers can never change this account's
     * password, disable it, or take its admin role away.
     */
    isMaster: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    /** Labs a coordinator is responsible for. Empty for other roles. */
    labIds: v.array(v.id("labs")),
    /** Participants only: the team and member row they belong to. */
    teamId: v.optional(v.id("teams")),
    memberId: v.optional(v.id("members")),
    /** Expo push tokens, one per device the person signed in on. */
    pushTokens: v.array(v.string()),
    /** Timestamp of the newest chat message this person has seen. */
    chatLastReadAt: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_team", ["teamId"]),

  /**
   * Allow list. Nobody gets a profile, and therefore any access, unless an
   * organiser pre-registered their email here.
   */
  invites: defineTable({
    email: v.string(), // lowercased
    name: v.string(),
    role: roleValidator,
    phone: v.optional(v.string()),
    department: v.optional(v.string()),
    labIds: v.array(v.id("labs")),
    teamId: v.optional(v.id("teams")),
    memberId: v.optional(v.id("members")),
    /**
     * Participant accounts are created for them, so organisers can hand out
     * the credentials. Staff invites leave this empty and pick their own.
     */
    assignedPassword: v.optional(v.string()),
    accountCreated: v.boolean(),
    claimed: v.boolean(),
    claimedAt: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.optional(v.id("profiles")),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_team", ["teamId"]),

  labs: defineTable({
    name: v.string(),
    block: v.optional(v.string()),
    floor: v.optional(v.string()),
    capacity: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  teams: defineTable({
    code: v.string(), // e.g. HF3-001, unique
    name: v.string(),
    projectTitle: v.optional(v.string()),
    problemStatementId: v.optional(v.string()), // e.g. HF3-SW-25
    domain: v.optional(v.string()),
    track: v.optional(trackValidator),
    college: v.optional(v.string()),
    labId: v.optional(v.id("labs")),
    tableNo: v.optional(v.string()),
    coordinatorId: v.optional(v.id("profiles")),
    status: teamStatusValidator,
    notes: v.optional(v.string()),

    /** Registration payment, shown to the team on their own screen. */
    paymentStatus: v.optional(paymentStatusValidator),
    paymentLink: v.optional(v.string()),
    paymentAmount: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    paymentProofUrl: v.optional(v.string()),
    paidAt: v.optional(v.number()),

    /** Team photo plus any extra images supplied with the import. */
    photoUrl: v.optional(v.string()),
    imageUrls: v.optional(v.array(v.string())),

    /**
     * Straight off the registration form. `teamSize` is what the team declared,
     * which can differ from the members actually on the roster.
     */
    problemDomain: v.optional(v.string()),
    teamSize: v.optional(v.number()),
    /** Members who asked for a place to stay. */
    accommodationCount: v.optional(v.number()),
    feePerPerson: v.optional(v.number()),
    stayFeePerPerson: v.optional(v.number()),
    /** When the team submitted the registration form. */
    registeredAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_lab", ["labId"])
    .index("by_coordinator", ["coordinatorId"])
    .index("by_status", ["status"])
    .searchIndex("search_name", { searchField: "name", filterFields: ["status"] }),

  members: defineTable({
    teamId: v.id("teams"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    college: v.optional(v.string()),
    department: v.optional(v.string()),
    year: v.optional(v.string()),
    rollNo: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    isLeader: v.boolean(),
    /** Position on the registration form, 1 for whoever filled it in. */
    memberNo: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_email", ["email"]),

  /** Rubric rows evaluators fill in. Editable by organisers. */
  criteria: defineTable({
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    maxScore: v.number(),
    weight: v.number(),
    order: v.number(),
    active: v.boolean(),
  })
    .index("by_key", ["key"])
    .index("by_order", ["order"]),

  /** Attendance windows, e.g. "Day 1 - Morning". */
  attendanceSessions: defineTable({
    name: v.string(),
    day: v.number(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    order: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_order", ["order"]),

  attendance: defineTable({
    sessionId: v.id("attendanceSessions"),
    teamId: v.id("teams"),
    memberId: v.id("members"),
    status: attendanceStatusValidator,
    markedBy: v.id("profiles"),
    markedAt: v.number(),
    note: v.optional(v.string()),
  })
    .index("by_session_member", ["sessionId", "memberId"])
    .index("by_session_team", ["sessionId", "teamId"])
    .index("by_team", ["teamId"])
    .index("by_session", ["sessionId"])
    .index("by_member", ["memberId"]),

  /**
   * Evaluation rounds. The rubric is shared by every round; what a round owns
   * is its own set of sheets and its `weight` in the cumulative total.
   */
  rounds: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    /** Relative weight in the cumulative. A final demo can count double. */
    weight: v.number(),
    /** draft: hidden from evaluators. open: scoring. locked: frozen. */
    status: roundStatusValidator,
    /** Whether participants may see this round's marks yet. */
    published: v.boolean(),
    createdAt: v.number(),
  }).index("by_order", ["order"]),

  scores: defineTable({
    teamId: v.id("teams"),
    evaluatorId: v.id("profiles"),
    /**
     * The round this sheet belongs to. Optional so sheets written before
     * rounds existed still validate; `rounds.adoptLegacyScores` stamps them.
     */
    roundId: v.optional(v.id("rounds")),
    /**
     * Who actually sat in front of the team, as they signed the sheet, next to
     * the account the sheet was written from. Both are snapshots taken at save
     * time: a sheet has to stay readable as the evaluation that happened, even
     * if the profile is later renamed or the account is handed to someone else.
     * Optional so sheets written before signing existed still validate.
     */
    evaluatorName: v.optional(v.string()),
    evaluatorEmail: v.optional(v.string()),
    /** The team as it was named when it was scored, for the same reason. */
    teamCode: v.optional(v.string()),
    teamName: v.optional(v.string()),
    values: v.array(v.object({ key: v.string(), value: v.number() })),
    total: v.number(),
    maxTotal: v.number(),
    percent: v.number(),
    notes: v.optional(v.string()),
    submitted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_evaluator", ["evaluatorId"])
    .index("by_team_evaluator", ["teamId", "evaluatorId"])
    .index("by_round", ["roundId"])
    .index("by_round_team", ["roundId", "teamId"])
    .index("by_round_evaluator", ["roundId", "evaluatorId"])
    .index("by_round_team_evaluator", ["roundId", "teamId", "evaluatorId"]),

  /** One support conversation per team, between the team and the organisers. */
  chats: defineTable({
    teamId: v.id("teams"),
    status: v.union(v.literal("open"), v.literal("resolved")),
    lastMessageAt: v.number(),
    lastMessagePreview: v.string(),
    lastMessageRole: roleValidator,
    unreadForAdmin: v.number(),
    unreadForTeam: v.number(),
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_status", ["status"]),

  /**
   * One shared room everyone at the event talks in. Kept flat rather than
   * threaded: a participant asking about food should be visible to every
   * organiser and coordinator at once.
   */
  messages: defineTable({
    /** Room key. Only "general" today, but named so more can be added. */
    room: v.optional(v.string()),
    authorProfileId: v.id("profiles"),
    authorName: v.string(),
    authorRole: roleValidator,
    /** Participants are shown with their team so staff know who is asking. */
    authorTeamName: v.optional(v.string()),
    authorTeamCode: v.optional(v.string()),
    body: v.string(),
    createdAt: v.number(),

    /** Legacy per-team threads, kept so old rows still validate. */
    chatId: v.optional(v.id("chats")),
    teamId: v.optional(v.id("teams")),
  })
    .index("by_room", ["room", "createdAt"])
    .index("by_chat", ["chatId"])
    .index("by_team", ["teamId"]),

  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    audience: audienceValidator,
    urgent: v.boolean(),
    createdBy: v.id("profiles"),
    createdByName: v.string(),
    createdAt: v.number(),
    /** People in the audience. */
    deliveredTo: v.number(),
    /** Devices the push service actually accepted, filled in after sending. */
    pushedTo: v.optional(v.number()),
    /** Devices Expo refused, so a partial delivery is visible rather than silent. */
    pushFailed: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_audience", ["audience"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
