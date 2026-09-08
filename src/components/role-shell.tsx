import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Redirect } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';

import { Screen, ScreenLoading } from '@/components/ui/screen';
import { type RoleKey } from '@/constants/brand';
import { homeFor, useSession } from '@/lib/session';
import { makeStyles, useColors } from '@/lib/theme';

/** Height reserved for the tab bar so scroll content is never hidden by it. */
export const TAB_BAR_INSET = 62;

/**
 * Blocks a role area until the session is known. Organisers are allowed into
 * the evaluator and coordinator areas because the backend grants them the same
 * read access; everyone else is bounced to their own home.
 */
export function RoleGate({ role, children }: { role: RoleKey; children: ReactNode }) {
  const styles = useStyles();
  const { status, profile, roles, activeRole, setActiveRole } = useSession();

  // Entering an area makes that the active role, so the app reopens here.
  useEffect(() => {
    if (status === 'ready' && roles.includes(role) && activeRole !== role) {
      setActiveRole(role);
    }
  }, [activeRole, role, roles, setActiveRole, status]);

  if (status === 'loading') {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ScreenLoading label="Checking your access" />
      </Screen>
    );
  }
  if (status === 'signed-out') return <Redirect href="/" />;
  if (status !== 'ready' || !profile) return <Redirect href="/(auth)/pending" />;

  // One account can hold several roles. Organisers may also use the evaluator
  // and coordinator areas, but not the participant area, which needs a team.
  const allowed =
    roles.includes(role) || (roles.includes('admin') && role !== 'participant');
  if (!allowed) return <Redirect href={homeFor(activeRole ?? roles[0] ?? profile.role)} />;

  return <>{children}</>;
}

export function useTabScreenOptions(accent: string) {
  const Brand = useColors();
  return {
    headerShown: false,
    tabBarActiveTintColor: accent,
    tabBarInactiveTintColor: Brand.textFaint,
    tabBarStyle: {
      backgroundColor: Brand.tabBar,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      borderTopColor: Brand.borderSubtle,
      elevation: 0,
    },
    tabBarLabelStyle: { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.2 },
    tabBarItemStyle: { paddingTop: 4 },
  };
}

export function tabIcon(name: keyof typeof MaterialCommunityIcons.glyphMap) {
  const Icon = ({ color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={name} size={size - 2} color={color} />
  );
  Icon.displayName = `TabIcon(${name})`;
  return Icon;
}

const useStyles = makeStyles((Brand) => ({
  center: { flex: 1, justifyContent: 'center' },
}));
