import type { Doc } from "../_generated/dataModel";

/** Leader first, then the order members were entered on the registration form. */
export function rosterOrder(a: Doc<"members">, b: Doc<"members">) {
  return (
    Number(b.isLeader) - Number(a.isLeader) ||
    (a.memberNo ?? Number.MAX_SAFE_INTEGER) - (b.memberNo ?? Number.MAX_SAFE_INTEGER) ||
    a.name.localeCompare(b.name)
  );
}
