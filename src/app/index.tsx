import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Card, Pill, withAlpha } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { EVENT, Radius, Space, type RoleKey } from '@/constants/brand';
import { homeFor, useSession } from '@/lib/session';
import { makeStyles, useColors, useNeutralGradient, useRoleTheme } from '@/lib/theme';

const ROLES: { key: RoleKey; route: string; blurb: string }[] = [
  {
    key: 'participant',
    route: '/(auth)/participant',
    blurb: 'Your team, lab, payment status, updates and help desk chat.',
  },
  {
    key: 'evaluator',
    route: '/(auth)/evaluator',
    blurb: 'Team profiles, rubric scoring and the live leaderboard.',
  },
  {
    key: 'coordinator',
    route: '/(auth)/coordinator',
    blurb: 'Your lab, your teams and attendance for every session.',
  },
  {
    key: 'admin',
    route: '/(auth)/admin',
    blurb: 'Import teams, assign labs, manage evaluators and rubric.',
  },
];

export default function Landing() {
  const Brand = useColors();
  const neutral = useNeutralGradient();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const router = useRouter();
  const { status, profile, activeRole } = useSession();

  if (status === 'loading') {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <Image
          source={require('@/assets/images/brand/icon-512.png')}
          style={styles.bootMark}
          contentFit="contain"
        />
        <ActivityIndicator color={Brand.cyan} />
      </Screen>
    );
  }

  if (status === 'ready' && profile) return <Redirect href={homeFor(activeRole ?? profile.role)} />;
  if (status === 'unregistered' || status === 'disabled') {
    return <Redirect href="/(auth)/pending" />;
  }

  return (
    <Screen gradient={neutral}>
      <View style={styles.hero}>
        <Image
          source={require('@/assets/images/brand/icon-512.png')}
          style={styles.mark}
          contentFit="contain"
        />
        <Text style={styles.wordmark}>{EVENT.name}</Text>
        <Text style={styles.console}>Evaluation Console</Text>
        <Text style={styles.tagline}>
          One sign-in for evaluators, coordinators and organisers across the {EVENT.durationHours}
          -hour build.
        </Text>

        <View style={styles.chips}>
          <Pill label={EVENT.dates} icon="calendar-outline" color={Brand.cyan} compact />
          <Pill label={EVENT.host} icon="school-outline" color={Brand.lilac} compact />
          <Pill label={EVENT.prizePool} icon="trophy-outline" color={Brand.amber} compact />
        </View>
      </View>

      <View style={styles.rolesHead}>
        <Text style={styles.rolesTitle}>Choose your sign-in</Text>
        <Text style={styles.rolesHint}>
          Access is invite only. Ask the organisers to add your email if you cannot get in.
        </Text>
      </View>

      <View style={styles.roles}>
        {ROLES.map(({ key, route, blurb }) => {
          const theme = RoleTheme[key];
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${theme.label} sign in`}
              onPress={() => router.push(route as never)}
              style={({ pressed }) => [styles.roleWrap, pressed && styles.pressed]}>
              <Card accent={theme.accent} style={styles.roleCard}>
                <View
                  style={[styles.roleIcon, { backgroundColor: withAlpha(theme.accent, 0.14) }]}>
                  <MaterialCommunityIcons
                    name={theme.icon as never}
                    size={22}
                    color={theme.accent}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.roleLabel, { color: theme.accent }]}>{theme.label}</Text>
                  <Text style={styles.roleBlurb}>{blurb}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={Brand.textFaint} />
              </Card>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(auth)/sign-in')}
        style={({ pressed }) => [styles.generic, pressed && styles.pressed]}>
        <MaterialCommunityIcons name="login-variant" size={16} color={Brand.textDim} />
        <Text style={styles.genericText}>Not sure which one? Use the general sign-in</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerLink}>Hackthon Evaluator</Text>
        <Text style={styles.footerText}>
          {EVENT.host} · {EVENT.location}
        </Text>
        <Text style={styles.footerText}>{EVENT.supportEmail}</Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Space.xl },
  bootMark: { width: 76, height: 76, opacity: 0.9 },

  hero: { alignItems: 'center', gap: Space.sm, paddingTop: Space.xl },
  mark: { width: 62, height: 62 },
  wordmark: {
    color: Brand.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.9,
    marginTop: Space.sm,
  },
  console: {
    color: Brand.cyan,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  tagline: {
    color: Brand.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: Space.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    justifyContent: 'center',
    marginTop: Space.md,
  },

  rolesHead: { gap: 5, marginTop: Space.sm },
  rolesTitle: { color: Brand.text, fontSize: 17, fontWeight: '700' },
  rolesHint: { color: Brand.textFaint, fontSize: 12.5, lineHeight: 18 },

  roles: { gap: Space.md },
  roleWrap: { borderRadius: Radius.lg },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  roleBlurb: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },

  generic: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
  },
  genericText: { color: Brand.textDim, fontSize: 13, fontWeight: '600' },

  footer: { alignItems: 'center', gap: 4, marginTop: Space.sm },
  footerLink: { color: Brand.blue, fontSize: 12.5, fontWeight: '700' },
  footerText: { color: Brand.textFaint, fontSize: 11.5 },
}));
