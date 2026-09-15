import { reloadAppAsync } from 'expo';
import { Image } from 'expo-image';
import { router, type ErrorBoundaryProps } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { errorCode } from '@/lib/errors';
import { clearAuthSession } from '@/lib/reset';
import { makeStyles, useColors } from '@/lib/theme';

/**
 * Stands in for a screen that threw while rendering and quietly gets the app
 * back on its feet. The person holding the phone only ever sees the loading
 * mark; there is no error page and nothing to tap.
 *
 * Nothing here writes to the backend. The most it does is drop the stored
 * session on this device, and only when the server keeps rejecting it.
 *
 * Each failed attempt inside a short window escalates one step:
 *  - retry the screen after a short pause: most errors are a query that raced
 *    sign-in or a connection that dropped for a moment
 *  - from the 2nd, a session the server keeps rejecting is signed out
 *  - on the 3rd, go back to the landing route, which picks the right home
 *  - every 5th, reload the JavaScript bundle, at most once every two minutes
 * A module that failed to load stays cached as failed until the bundle is
 * reloaded, so for those the reload is tried first.
 */

const RELOAD_KEY = 'hackfinity.recoveryReloadAt';
const RELOAD_COOLDOWN_MS = 2 * 60_000;
/** A failure this long after the previous one starts a fresh streak. */
const QUIET_MS = 30_000;
const DELAYS_MS = [300, 800, 1500, 3000, 5000, 8000];

let streak = 0;
let lastFailureAt = 0;

function nextAttempt() {
  const now = Date.now();
  if (now - lastFailureAt > QUIET_MS) streak = 0;
  lastFailureAt = now;
  streak += 1;
  return streak;
}

function kindOf(error: unknown): 'session' | 'bundle' | 'other' {
  const code = errorCode(error);
  if (code === 'NO_PROFILE' || code === 'DISABLED') return 'session';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/cannot find module|requiring unknown module/i.test(message)) return 'bundle';
  return 'other';
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function reloadBundle() {
  try {
    const last = Number((await SecureStore.getItemAsync(RELOAD_KEY)) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    await SecureStore.setItemAsync(RELOAD_KEY, String(Date.now()));
    await reloadAppAsync('Recovering a screen that failed to render');
    // Where a reload is not available the loop simply carries on.
    await wait(1500);
  } catch {
    // Keystore or reload unavailable: keep retrying instead.
  }
}

function goHome() {
  try {
    router.replace('/');
  } catch {
    // No navigator mounted to handle it; the retry still runs.
  }
}

export function RecoveryBoundary({ error, retry }: ErrorBoundaryProps) {
  const Brand = useColors();
  const styles = useStyles();

  const latestError = useRef<unknown>(error);
  const alive = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    latestError.current = error;
  }, [error]);

  useEffect(() => {
    // Once per mount, including StrictMode's second effect pass.
    if (started.current) return;
    started.current = true;

    void (async () => {
      while (alive.current) {
        const attempt = nextAttempt();
        const current = latestError.current;
        const kind = kindOf(current);

        console.warn(
          `[recovery] attempt ${attempt} (${kind}):`,
          current instanceof Error ? current.message : current,
        );

        if (kind === 'bundle') await reloadBundle();
        if (kind === 'session' && attempt >= 2) await clearAuthSession().catch(() => {});
        if (attempt === 3) goHome();
        if (attempt % 5 === 0) await reloadBundle();

        await wait(DELAYS_MS[Math.min(attempt - 1, DELAYS_MS.length - 1)]);
        if (!alive.current) return;
        retry();

        // A successful retry unmounts this boundary and ends the loop.
        await wait(400);
      }
    })();
  }, [retry]);

  return (
    <View style={styles.root}>
      <Image
        source={require('@/assets/images/brand/icon-512.png')}
        style={styles.mark}
        contentFit="contain"
      />
      <ActivityIndicator color={Brand.cyan} />
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    backgroundColor: Brand.bg,
  },
  mark: { width: 64, height: 64, opacity: 0.9 },
}));
