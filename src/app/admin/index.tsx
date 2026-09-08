import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlays';
import { Banner, Card, Section, StatCard, StatGrid, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { EVENT, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { errorMessage } from '@/lib/errors';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';
import { useNotifications } from '@/lib/notifications';
import { useSession } from '@/lib/session';


type QuickAction = {
  label: string;
  hint: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  route: string;
  color: string;
};

function quickActions(Brand: ReturnType<typeof useColors>): QuickAction[] {
  return [
  {
    label: 'Evaluation rounds',
    hint: 'Create, open, publish',
    icon: 'numeric',
    route: '/admin/rounds',
    color: Brand.green,
  },
  {
    label: 'Scan a badge',
    hint: 'QR or barcode',
    icon: 'qrcode-scan',
    route: '/scan',
    color: Brand.blue,
  },
  {
    label: 'Import teams',
    hint: 'CSV or pasted rows',
    icon: 'tray-arrow-up',
    route: '/admin/import',
    color: Brand.cyan,
  },
  {
    label: 'Announce',
    hint: 'Buzz every phone',
    icon: 'bullhorn-outline',
    route: '/admin/announce',
    color: Brand.orange,
  },
  {
    label: 'Participant logins',
    hint: 'Create and share',
    icon: 'key-outline',
    route: '/admin/participants',
    color: Brand.lilac,
  },
  {
    label: 'Leaderboard',
    hint: 'Live standings',
    icon: 'trophy-outline',
    route: '/admin/leaderboard',
    color: Brand.amber,
  },
  {
    label: 'Attendance',
    hint: 'Every session',
    icon: 'clipboard-list-outline',
    route: '/admin/attendance',
    color: Brand.green,
  },
];;
}

export default function AdminOverview() {
  const Brand = useColors();
  const styles = useStyles();
  const RoleTheme = useRoleTheme();
  const accent = useRoleTheme().admin.accent;
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const stats = useQuery(api.stats.adminOverview, {});
  const seedCriteria = useMutation(api.criteria.seedDefaults);
  const seedSessions = useMutation(api.sessions.seedDefaults);
  const { permission, remotePushAvailable, requestPermission } = useNotifications();
  const [seeding, setSeeding] = useState(false);

  async function seed() {
    setSeeding(true);
    try {
      const [rubric, sessions] = await Promise.all([seedCriteria(), seedSessions()]);
      toast.show(
        `Added ${rubric.seeded} criteria and ${sessions.seeded} sessions`,
        'success',
      );
    } catch (err) {
      toast.show(errorMessage(err), 'error');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Screen gradient={RoleTheme.admin.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Organiser"
        title={`Hi ${profile?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`${EVENT.name} · ${EVENT.dates}`}
      />

      {stats === undefined ? (
        <ScreenLoading label="Loading the floor" />
      ) : (
        <>
          {(stats.needsRubric || stats.needsSessions) && (
            <Banner
              tone="warn"
              title="Finish setup first"
              message="Scoring and attendance need a rubric and session list. Load the Hackfinity defaults in one tap."
              action={
                <Button
                  label="Load defaults"
                  size="sm"
                  icon="auto-fix"
                  accent={accent}
                  loading={seeding}
                  onPress={seed}
                />
              }
            />
          )}

          {stats.unassignedTeams > 0 && (
            <Banner
              tone="info"
              title={`${stats.unassignedTeams} teams without a lab or coordinator`}
              message="Assign them so coordinators can mark attendance."
              action={
                <Button
                  label="Open teams"
                  size="sm"
                  variant="secondary"
                  accent={accent}
                  onPress={() => router.push('/admin/teams')}
                />
              }
            />
          )}

          {permission === 'denied' && (
            <Banner
              tone="danger"
              title="Notifications are blocked"
              message="You will not hear team help requests. Turn notifications on for this app."
              action={
                <Button
                  label="Enable"
                  size="sm"
                  icon="bell-ring-outline"
                  accent={accent}
                  onPress={() => void requestPermission()}
                />
              }
            />
          )}

          {!remotePushAvailable && (
            <Banner
              tone="info"
              title="Alerts arrive while the app is open"
              message="Run `eas init` and build with EAS to also receive pushes when the app is closed."
            />
          )}

          <StatGrid>
            <StatCard
              label="Teams"
              value={stats.activeTeams}
              sub={`${stats.members} participants`}
              icon="account-group-outline"
              color={accent}
              onPress={() => router.push('/admin/teams')}
            />
            <StatCard
              label="Unread chats"
              value={stats.unreadMessages}
              sub={`${stats.openChats} teams waiting`}
              icon="message-alert-outline"
              color={stats.unreadMessages > 0 ? Brand.red : Brand.green}
              onPress={() => router.push('/admin/chats')}
            />
            <StatCard
              label="Teams scored"
              value={`${stats.teamsScored}/${stats.activeTeams}`}
              sub={`${stats.evaluationsSubmitted} sheets in`}
              icon="clipboard-check-outline"
              color={Brand.cyan}
              onPress={() => router.push('/admin/leaderboard')}
            />
            <StatCard
              label="Attendance"
              value={stats.attendanceRate == null ? '—' : `${stats.attendanceRate}%`}
              sub={stats.latestSessionName ?? 'No session yet'}
              icon="account-check-outline"
              color={Brand.green}
              onPress={() => router.push('/admin/attendance')}
            />
            <StatCard
              label="Paid teams"
              value={`${stats.paidTeams}/${stats.activeTeams}`}
              sub={`${stats.unpaidTeams} outstanding`}
              icon="cash-check"
              color={stats.unpaidTeams > 0 ? Brand.amber : Brand.green}
            />
            <StatCard
              label="Participant logins"
              value={stats.participantAccounts}
              sub={`${stats.participants} signed in`}
              icon="key-outline"
              color={Brand.lilac}
              onPress={() => router.push('/admin/participants')}
            />
            <StatCard
              label="Evaluators"
              value={stats.evaluators}
              sub={`${stats.pendingInvites} invites pending`}
              icon="clipboard-account-outline"
              color={Brand.blue}
              onPress={() => router.push('/admin/people')}
            />
            <StatCard
              label="Coordinators"
              value={stats.coordinators}
              sub={`${stats.labs} labs`}
              icon="account-tie-outline"
              color={Brand.green}
              onPress={() => router.push('/admin/people')}
            />
          </StatGrid>

          <Section title="Quick actions">
            <View style={styles.actions}>
              {quickActions(Brand).map((action) => (
                <Pressable
                  key={action.route}
                  accessibilityRole="button"
                  onPress={() => router.push(action.route as never)}
                  style={({ pressed }) => [styles.actionWrap, pressed && styles.pressed]}>
                  <Card style={styles.action}>
                    <View
                      style={[
                        styles.actionIcon,
                        { backgroundColor: withAlpha(action.color, 0.14) },
                      ]}>
                      <MaterialCommunityIcons
                        name={action.icon}
                        size={19}
                        color={action.color}
                      />
                    </View>
                    <Text style={styles.actionLabel}>{action.label}</Text>
                    <Text style={styles.actionHint}>{action.hint}</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          </Section>
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  actionWrap: { flexGrow: 1, flexBasis: '46%', minWidth: 150 },
  action: { gap: 5, padding: Space.lg },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  actionLabel: { color: Brand.text, fontSize: 14.5, fontWeight: '700' },
  actionHint: { color: Brand.textFaint, fontSize: 11.5 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
}));
