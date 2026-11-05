import * as ExpoSecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Key-value storage that works on every platform the app runs on.
 *
 * `expo-secure-store` has no web build (its web module is an empty object, so
 * any call would throw), while web needs the same keys the native app keeps:
 * the backend URL, the theme, the active role and the Better Auth session.
 * On web those live in localStorage — synchronous like SecureStore's
 * getItem/setItem, so the Better Auth Expo storage contract still holds.
 */

/** Survives blocked storage (private windows, SSR prerender) as a memory map. */
const memory = new Map<string, string>();

function webStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getItem(key: string): string | null {
  if (Platform.OS !== 'web') return ExpoSecureStore.getItem(key);
  try {
    return webStorage()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function setItem(key: string, value: string): void {
  if (Platform.OS !== 'web') {
    ExpoSecureStore.setItem(key, value);
    return;
  }
  memory.set(key, value);
  try {
    webStorage()?.setItem(key, value);
  } catch {
    // Storage unavailable: the memory copy still serves this session.
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS !== 'web') return ExpoSecureStore.getItemAsync(key);
  return getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS !== 'web') return ExpoSecureStore.setItemAsync(key, value);
  setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS !== 'web') return ExpoSecureStore.deleteItemAsync(key);
  memory.delete(key);
  try {
    webStorage()?.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
