import * as SecureStore from '@/lib/secure-store';

/**
 * Where the Convex deployment lives.
 *
 * Normally this comes from `.env.local` at build time. A build made before the
 * deployment existed would otherwise be dead on arrival, so an organiser can
 * paste the URL once on first launch and it is remembered on the device.
 */

const STORAGE_KEY = 'hackthon-evaluator.convexUrl';

const ENV_CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? '';
const ENV_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? '';

export type BackendConfig = { convexUrl: string; siteUrl: string };

let cached: BackendConfig | null = null;

/** `https://x.convex.cloud` hosts the sync engine, `https://x.convex.site` the HTTP routes. */
export function deriveSiteUrl(convexUrl: string) {
  const trimmed = convexUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('.convex.site')) return trimmed;
  if (trimmed.endsWith('.convex.cloud')) return `${trimmed.slice(0, -'.convex.cloud'.length)}.convex.site`;
  return trimmed;
}

export function normalizeConvexUrl(input: string) {
  let value = input.trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  if (value.endsWith('.convex.site')) {
    value = `${value.slice(0, -'.convex.site'.length)}.convex.cloud`;
  }
  return value;
}

export function isValidConvexUrl(input: string) {
  const value = normalizeConvexUrl(input);
  return /^https:\/\/[a-z0-9-]+\.convex\.cloud$/i.test(value) || /^https?:\/\/.+/.test(value);
}

/** Resolves the config once per launch: env first, stored value second. */
export async function loadBackendConfig(): Promise<BackendConfig> {
  if (cached) return cached;

  if (ENV_CONVEX_URL) {
    cached = {
      convexUrl: ENV_CONVEX_URL,
      siteUrl: ENV_SITE_URL || deriveSiteUrl(ENV_CONVEX_URL),
    };
    return cached;
  }

  let stored = '';
  try {
    stored = (await SecureStore.getItemAsync(STORAGE_KEY)) ?? '';
  } catch {
    // Keystore unavailable: fall through to the setup screen.
  }

  cached = stored
    ? { convexUrl: stored, siteUrl: deriveSiteUrl(stored) }
    : { convexUrl: '', siteUrl: '' };
  return cached;
}

export async function saveBackendUrl(input: string): Promise<BackendConfig> {
  const convexUrl = normalizeConvexUrl(input);
  await SecureStore.setItemAsync(STORAGE_KEY, convexUrl);
  cached = { convexUrl, siteUrl: deriveSiteUrl(convexUrl) };
  return cached;
}

export async function clearBackendUrl() {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  cached = null;
}

/** True when the URL was baked in at build time and cannot be changed in-app. */
export const backendUrlIsFixed = ENV_CONVEX_URL.length > 0;
