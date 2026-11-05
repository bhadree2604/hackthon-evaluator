import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { ConvexReactClient } from 'convex/react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { StrictMode, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BackendSetup } from '@/components/backend-setup';
import { RecoveryBoundary } from '@/components/recovery';
import { ToastProvider } from '@/components/ui/overlays';
import { initAuthClient } from '@/lib/auth-client';
import { makeStyles, ThemeProvider, useColors, useThemeMode } from '@/lib/theme';
import { deriveSiteUrl, loadBackendConfig } from '@/lib/backend';
import { NotificationsProvider } from '@/lib/notifications';
import { SessionProvider } from '@/lib/session';

SplashScreen.preventAutoHideAsync().catch(() => {});

type ProviderAuthClient = ComponentProps<typeof ConvexBetterAuthProvider>['authClient'];

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <ThemeProvider>
        <RootShell />
      </ThemeProvider>
    </KeyboardProvider>
  );
}

function RootShell() {
  const styles = useStyles();
  // undefined while resolving, '' when the app still needs a backend URL.
  const [convexUrl, setConvexUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadBackendConfig()
      .then((config) => {
        if (!cancelled) setConvexUrl(config.convexUrl);
      })
      .catch(() => {
        if (!cancelled) setConvexUrl('');
      })
      .finally(() => {
        SplashScreen.hideAsync().catch(() => {});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (convexUrl === undefined) return <Booting />;

  if (!convexUrl) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <ThemedStatusBar />
          <BackendSetup onSaved={setConvexUrl} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return <App convexUrl={convexUrl} />;
}

function App({ convexUrl }: { convexUrl: string }) {
  const Brand = useColors();
  const styles = useStyles();
  /**
   * `expectAuth` is deliberately left off: the sign-in screens read public
   * queries (invite lookup, first-run organiser check) before a token exists,
   * and every authenticated query is gated on `isAuthenticated` in
   * SessionProvider.
   */
  const convex = useMemo(
    () => new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }),
    [convexUrl],
  );

  /**
   * The Expo plugin widens the Better Auth client type beyond the narrow shape
   * the provider declares. The runtime contract is identical.
   */
  const authClient = useMemo(
    () => initAuthClient(deriveSiteUrl(convexUrl)) as unknown as ProviderAuthClient,
    [convexUrl],
  );

  return (
    <StrictMode>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <ConvexBetterAuthProvider client={convex} authClient={authClient}>
            <SessionProvider>
              <ToastProvider>
                <NotificationsProvider>
                  <ThemedStatusBar />
                  {/*
                   * Every screen gets its own recovery boundary, so a screen that
                   * throws is retried in place while the navigator, the Convex
                   * connection and the session all stay up.
                   */}
                  <Stack
                    unstable_screenErrorBoundary={RecoveryBoundary}
                    screenOptions={{
                      headerShown: false,
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: Brand.bg },
                    }}
                  />
                </NotificationsProvider>
              </ToastProvider>
            </SessionProvider>
          </ConvexBetterAuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </StrictMode>
  );
}

function ThemedStatusBar() {
  const { isDark } = useThemeMode();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

function Booting() {
  const Brand = useColors();
  const styles = useStyles();
  return (
    <View style={styles.booting}>
      <ActivityIndicator color={Brand.cyan} />
    </View>
  );
}

/**
 * Last line of defence for anything above the screens (the providers
 * themselves). It never shows an error page: see RecoveryBoundary.
 */
export const ErrorBoundary = RecoveryBoundary;

const useStyles = makeStyles((Brand) => ({
  root: { flex: 1, backgroundColor: Brand.bg },
  booting: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
