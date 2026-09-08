import * as SecureStore from 'expo-secure-store';

import { APP_SCHEME } from '@/lib/auth-client';

/**
 * Everything this app persists on the device. Listed explicitly because
 * SecureStore has no way to enumerate its keys.
 */
const APP_KEYS = ['hackfinity.convexUrl', 'hackfinity.themeMode', 'hackfinity.activeRole'];

/** Better Auth's Expo client stores the session under its storage prefix. */
const AUTH_KEYS = [
  `${APP_SCHEME}_cookie`,
  `${APP_SCHEME}_session_data`,
  `${APP_SCHEME}_user`,
];

/**
 * Wipes local state so a device stuck on a bad launch can recover without the
 * user having to uninstall. Signs them out as a side effect, which is the
 * point: a corrupt stored session is one of the few things that can wedge the
 * app before any screen renders.
 */
/**
 * Drops only the signed-in session, keeping the backend URL and theme. Used to
 * recover automatically from a session the server no longer accepts.
 */
export async function clearAuthSession() {
  await Promise.allSettled(AUTH_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
}

export async function clearLocalData() {
  const results = await Promise.allSettled(
    [...APP_KEYS, ...AUTH_KEYS].map((key) => SecureStore.deleteItemAsync(key)),
  );
  return results.filter((r) => r.status === 'fulfilled').length;
}
