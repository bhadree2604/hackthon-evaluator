import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { DarkColors } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { useSession } from '@/lib/session';

/** Must match the channel ids used by convex/notifications.ts. */
export const CHANNEL_DEFAULT = 'hackfinity-default';
export const CHANNEL_URGENT = 'hackfinity-urgent';

// Foreground behaviour: banner + sound, exactly like a background push.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationsValue = {
  permission: 'unknown' | 'granted' | 'denied';
  pushToken: string | null;
  /** False when the build has no EAS project id, so remote push is unavailable. */
  remotePushAvailable: boolean;
  /**
   * True only once this phone actually holds a push token. Until then a closed
   * app hears nothing, whatever the permission says.
   */
  remotePushReady: boolean;
  requestPermission: () => Promise<boolean>;
  /** Detaches this phone from the current account. Call before signing out. */
  releaseDevice: () => Promise<void>;
  /** Sends a real push from the server, the same path an announcement takes. */
  sendTestPush: () => Promise<{ devices: number }>;
  alertNow: (
    title: string,
    body: string,
    urgent?: boolean,
    options?: { hapticsOnly?: boolean },
  ) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

function projectId() {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromExtra ?? Constants.easConfig?.projectId ?? null;
}

async function ensureChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(CHANNEL_DEFAULT, {
    name: 'Hackfinity updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
    lightColor: DarkColors.cyan,
    sound: 'default',
    enableVibrate: true,
  });

  await Notifications.setNotificationChannelAsync(CHANNEL_URGENT, {
    name: 'Urgent announcements',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 150, 400, 150, 400],
    lightColor: DarkColors.orange,
    sound: 'default',
    enableVibrate: true,
    bypassDnd: false,
  });
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, profile, roles } = useSession();
  const registerPushToken = useMutation(api.notifications.registerPushToken);
  const unregisterPushToken = useMutation(api.notifications.unregisterPushToken);
  const requestTestPush = useMutation(api.notifications.sendTest);

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const registered = useRef<string | null>(null);

  const remotePushAvailable = Platform.OS !== 'web' && !!projectId();

  const alertNow = useCallback(async (title: string, body: string, urgent = false, options?: { hapticsOnly?: boolean }) => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(
        urgent
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      );
    } catch {
      // Haptics are best effort.
    }
    // A registered device also gets the remote push, so raising a local copy
    // here would show the same alert twice.
    if (options?.hapticsOnly) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          vibrate: urgent ? [0, 400, 150, 400, 150, 400] : [0, 250, 120, 250],
          priority: Notifications.AndroidNotificationPriority.MAX,
          ...(Platform.OS === 'android'
            ? { channelId: urgent ? CHANNEL_URGENT : CHANNEL_DEFAULT }
            : {}),
        },
        trigger: null,
      });
    } catch {
      // A blocked notification must never take the screen down with it.
    }
  }, []);

  /**
   * Several roles get tested on one phone during an event. Without this the
   * signed-out account keeps the token and keeps receiving that role's alerts.
   */
  const releaseDevice = useCallback(async () => {
    if (!pushToken) return;
    try {
      await unregisterPushToken({ token: pushToken });
    } catch {
      // Signing out matters more than tidying the token.
    }
    setPushToken(null);
    registered.current = null;
  }, [pushToken, unregisterPushToken]);

  /**
   * Goes through Expo and back down to this phone, so it proves the whole
   * chain rather than just that the app can raise a banner on itself. Lock the
   * phone before pressing it and the answer is unambiguous.
   */
  const sendTestPush = useCallback(async () => {
    const result = await requestTestPush({});
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return result;
  }, [requestTestPush]);

  const requestPermission = useCallback(async () => {
    if (Platform.OS === 'web') return false;
    await ensureChannels();

    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;

    if (!granted && current.canAskAgain !== false) {
      const asked = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = asked.granted;
    }

    setPermission(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  // Ask once the user is actually inside the app, then hand the token to Convex.
  useEffect(() => {
    if (status !== 'ready' || !profile) return;
    if (Platform.OS === 'web') return;
    if (registered.current === profile._id) return;
    registered.current = profile._id;

    let cancelled = false;

    (async () => {
      const granted = await requestPermission();
      if (!granted || cancelled) return;
      if (!Device.isDevice) return; // Simulators never get a push token.

      const id = projectId();
      if (!id) return; // No EAS project yet: in-app alerts still work.

      try {
        const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
        if (cancelled) return;
        setPushToken(token.data);
        await registerPushToken({ token: token.data });
      } catch {
        // Offline or unsupported: in-app alerts still work.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile, registerPushToken, requestPermission, status]);

  useEffect(() => {
    if (status === 'signed-out') registered.current = null;
  }, [status]);

  // Tapping a push opens the right screen.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; teamId?: string }
        | undefined;
      if (!data?.type) return;

      // Read from every role the account holds, not the legacy primary one.
      const isParticipant = roles.includes('participant');

      if (data.type === 'chat') {
        router.push(isParticipant ? '/participant/chat' : '/admin/chats');
      } else if (data.type === 'announcement') {
        if (isParticipant) router.push('/participant/updates');
      } else if (data.type === 'results') {
        if (isParticipant) router.push('/participant/results' as never);
      }
    });
    return () => sub.remove();
  }, [roles, router]);

  const value = useMemo<NotificationsValue>(
    () => ({
      permission,
      pushToken,
      remotePushAvailable,
      remotePushReady: pushToken !== null,
      requestPermission,
      releaseDevice,
      sendTestPush,
      alertNow,
    }),
    [
      alertNow,
      permission,
      pushToken,
      releaseDevice,
      remotePushAvailable,
      requestPermission,
      sendTestPush,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      <SilentBoundary>
        <LiveAlerts alertNow={alertNow} hapticsOnly={pushToken !== null} />
      </SilentBoundary>
      {children}
    </NotificationsContext.Provider>
  );
}

/**
 * A background alert poller must never be able to take the app shell down.
 * Anything thrown below this renders as nothing instead of reaching the
 * router's error screen.
 */
class SilentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Convex is realtime, so while the app is running we can raise a local
 * notification the moment an announcement or chat reply lands. Remote push
 * covers the case where the app is not running at all.
 */
function LiveAlerts({
  alertNow,
  hapticsOnly,
}: {
  alertNow: (
    title: string,
    body: string,
    urgent?: boolean,
    options?: { hapticsOnly?: boolean },
  ) => Promise<void>;
  /** True once this device has a push token, so the server alert wins. */
  hapticsOnly: boolean;
}) {
  const { status, profile } = useSession();
  /**
   * The stored session can report authenticated a beat before Convex holds a
   * usable token. Subscribing in that window runs these queries as a signed
   * out caller, so wait for the token as well as the profile.
   */
  const { isAuthenticated } = useConvexAuth();
  const enabled = isAuthenticated && status === 'ready' && !!profile;

  const feed = useQuery(api.announcements.feed, enabled ? { limit: 10 } : 'skip');
  const unread = useQuery(api.chat.unreadCount, enabled ? {} : 'skip');

  const seenAnnouncement = useRef<string | null>(null);
  const primed = useRef(false);
  const lastUnread = useRef<number | null>(null);

  useEffect(() => {
    if (!feed || feed.length === 0) return;
    const latest = feed[0];

    // First load only records where we are; it must not replay old news.
    if (!primed.current) {
      primed.current = true;
      seenAnnouncement.current = latest._id;
      return;
    }
    if (seenAnnouncement.current === latest._id) return;

    seenAnnouncement.current = latest._id;
    void alertNow(latest.title, latest.body, latest.urgent, { hapticsOnly });
  }, [alertNow, feed, hapticsOnly]);

  useEffect(() => {
    if (unread === undefined) return;
    if (lastUnread.current === null) {
      lastUnread.current = unread;
      return;
    }
    if (unread > lastUnread.current) {
      const isAdmin = profile?.role === 'admin';
      void alertNow(
        isAdmin ? 'New message from a team' : 'Reply from the organisers',
        isAdmin ? 'Open the Chats tab to respond.' : 'Open your chat to read it.',
        isAdmin,
        { hapticsOnly },
      );
    }
    lastUnread.current = unread;
  }, [alertNow, hapticsOnly, profile?.role, unread]);

  return null;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return ctx;
}
