import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { ConvexReactClient } from 'convex/react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { StrictMode, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BackendSetup } from '@/components/backend-setup';
import { ToastProvider } from '@/components/ui/overlays';
import { initAuthClient } from '@/lib/auth-client';
import { makeStyles, ThemeProvider, useColors, useThemeMode } from '@/lib/theme';
import { deriveSiteUrl, loadBackendConfig } from '@/lib/backend';
import { errorCode, errorMessage } from '@/lib/errors';
import { clearAuthSession, clearLocalData } from '@/lib/reset';
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
              <NotificationsProvider>
                <ToastProvider>
                  <ThemedStatusBar />
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: Brand.bg },
                    }}
                  />
                </ToastProvider>
              </NotificationsProvider>
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
 * expo-router renders this instead of a red screen when a route throws, so a
 * bad query on one screen never takes the whole event app down.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const Brand = useColors();
  const styles = useStyles();
  const [clearing, setClearing] = useState(false);

  /**
   * A session the server will not accept is not something to make the user
   * read. Drop it and retry once; only a second failure reaches this screen.
   */
  const code = errorCode(error);
  const staleSession = code === 'NO_PROFILE' || code === 'DISABLED';
  const recovered = useRef(false);
  const [recovering, setRecovering] = useState(staleSession);

  useEffect(() => {
    if (!staleSession || recovered.current) return;
    recovered.current = true;

    clearAuthSession()
      .catch(() => {
        // Nothing stored, or the keystore is unavailable: fall through.
      })
      .finally(() => {
        setRecovering(false);
        retry();
      });
  }, [retry, staleSession]);

  if (recovering) return <Booting />;

  return (
    <View style={styles.error}>
      <MaterialCommunityIcons name="alert-circle-outline" size={34} color={Brand.orange} />
      <Text style={styles.errorTitle}>Something went wrong</Text>

      {/* Shown in full: the message is what tells us what actually broke. */}
      <ScrollView style={styles.errorScroll} contentContainerStyle={styles.errorScrollContent}>
        <Text selectable style={styles.errorBody}>
          {errorMessage(error)}
        </Text>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        onPress={() => retry()}
        style={({ pressed }) => [styles.retry, pressed && { opacity: 0.7 }]}>
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        disabled={clearing}
        onPress={async () => {
          setClearing(true);
          try {
            await clearLocalData();
          } finally {
            setClearing(false);
            retry();
          }
        }}
        style={({ pressed }) => [styles.reset, pressed && { opacity: 0.7 }]}>
        <Text style={styles.resetText}>
          {clearing ? 'Clearing...' : 'Clear saved data and restart'}
        </Text>
      </Pressable>

      <Text style={styles.errorHint}>
        Clearing signs you out on this device. Your event data is untouched.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  root: { flex: 1, backgroundColor: Brand.bg },
  booting: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    flex: 1,
    backgroundColor: Brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: { color: Brand.text, fontSize: 19, fontWeight: '700' },
  errorBody: {
    color: Brand.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
  },
  retry: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Brand.cyan,
  },
  retryText: { color: Brand.onAccent, fontSize: 14, fontWeight: '700' },
  reset: { marginTop: 4, paddingHorizontal: 18, paddingVertical: 10 },
  resetText: { color: Brand.textMuted, fontSize: 13, fontWeight: '700' },
  errorScroll: { maxHeight: 180, alignSelf: 'stretch' },
  errorScrollContent: { paddingHorizontal: 8 },
  errorHint: {
    color: Brand.textFaint,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 300,
  },
}));
