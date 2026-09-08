import { expoClient } from '@better-auth/expo/client';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * `expo.scheme` in app.json. Better Auth signs the deep link back into the app
 * with this, and it has to match `trustedOrigins` in convex/auth.ts.
 */
const rawScheme = Constants.expoConfig?.scheme;
export const APP_SCHEME = (Array.isArray(rawScheme) ? rawScheme[0] : rawScheme) ?? 'hackfinity30';

export type AppAuthClient = ReturnType<typeof buildAuthClient>;

function buildAuthClient(siteUrl: string) {
  return createAuthClient({
    baseURL: siteUrl,
    plugins: [
      expoClient({
        scheme: APP_SCHEME,
        storagePrefix: APP_SCHEME,
        storage: SecureStore,
      }),
      convexClient(),
    ],
  });
}

let client: AppAuthClient | null = null;
let clientSiteUrl: string | null = null;

/**
 * The Convex site URL is only known after the backend config resolves, so the
 * client is created once at that point rather than at module load.
 */
export function initAuthClient(siteUrl: string): AppAuthClient {
  if (client && clientSiteUrl === siteUrl) return client;
  client = buildAuthClient(siteUrl);
  clientSiteUrl = siteUrl;
  return client;
}

export function getAuthClient(): AppAuthClient {
  if (!client) {
    throw new Error('Auth client used before the backend URL was resolved.');
  }
  return client;
}
