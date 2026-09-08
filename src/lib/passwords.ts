import type { RoleKey } from '@/constants/brand';

/**
 * How short a password may be, by who owns it.
 *
 * Participants are handed a default on a printed slip and change it standing
 * in a queue, so anything they can type is accepted. Staff accounts can reach
 * every team's marks, so they keep a real minimum.
 *
 * The server enforces the same split in convex/accounts.ts; these constants
 * exist so the forms can say the same thing before a round trip.
 */

export const MIN_PARTICIPANT_PASSWORD = 1;
export const MIN_STAFF_PASSWORD = 8;

/** Anything other than participant counts as staff, however many roles. */
export function minPasswordFor(roles: readonly RoleKey[]) {
  const isStaff = roles.some((role) => role !== 'participant');
  return isStaff ? MIN_STAFF_PASSWORD : MIN_PARTICIPANT_PASSWORD;
}

export function passwordPlaceholder(min: number) {
  return min <= 1 ? 'Any password you will remember' : `At least ${min} characters`;
}

export function passwordError(password: string, min: number) {
  if (password.length === 0 || password.length >= min) return null;
  return min <= 1
    ? 'Enter a password'
    : `Password must be at least ${min} characters`;
}
