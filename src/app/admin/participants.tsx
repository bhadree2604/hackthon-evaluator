import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Button, IconButton } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { ConfirmDialog, useToast } from '@/components/ui/overlays';
import {
  Banner,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Section,
  StatCard,
  StatGrid,
  withAlpha,
} from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { errorMessage } from '@/lib/errors';
import { useDebounced } from '@/hooks/use-debounced';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

/**
 * Participant logins, grouped the way the floor is: by team.
 *
 * Everyone gets the same default password, handed out on the team's slip. One
 * button creates the missing logins for a team, another does every team in
 * turn. Nobody's existing password is ever overwritten by that; resetting is
 * a deliberate, per person action.
 */
export default function AdminParticipants() {
  const Brand = useColors();
  const accent = useRoleTheme().admin.accent;
  const styles = useStyles();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);
  const data = useQuery(api.participants.provisioningByTeam, {
    search: debounced || undefined,
  });

  const provision = useMutation(api.participants.provisionTeamDefaults);
  const resetPassword = useMutation(api.participants.resetToDefaultPassword);

  const [working, setWorking] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const totals = useMemo(() => {
    const teams = data?.teams ?? [];
    return {
      teams: teams.length,
      people: teams.reduce((sum, team) => sum + team.members.length, 0),
      withAccount: teams.reduce((sum, team) => sum + team.withAccount, 0),
      missing: teams.reduce((sum, team) => sum + team.missing, 0),
      noEmail: teams.reduce((sum, team) => sum + team.noEmail, 0),
    };
  }, [data]);

  if (data === undefined) {
    return (
      <Screen bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading the roster" />
      </Screen>
    );
  }

  const password = data.defaultPassword;

  async function createFor(teamId: Id<'teams'>, code: string) {
    setWorking(teamId);
    try {
      const result = await provision({ teamId });
      const parts = [`${result.created} created`];
      if (result.existing > 0) parts.push(`${result.existing} already had one`);
      if (result.noEmail > 0) parts.push(`${result.noEmail} without an email`);
      toast.show(
        `${code}: ${parts.join(', ')}`,
        result.failures.length > 0 ? 'error' : 'success',
      );
      if (result.failures.length > 0) {
        toast.show(result.failures[0], 'error');
      }
    } catch (error) {
      toast.show(errorMessage(error), 'error');
    } finally {
      setWorking(null);
    }
  }

  /** One team per call: hashing a password is slow, so this walks the list. */
  async function createAll() {
    const pending = (data?.teams ?? []).filter((team) => team.missing > 0);
    setConfirmAll(false);
    setBulk({ done: 0, total: pending.length });

    let created = 0;
    let failed = 0;
    for (const [index, team] of pending.entries()) {
      try {
        const result = await provision({ teamId: team.teamId });
        created += result.created;
        failed += result.failures.length;
      } catch {
        failed++;
      }
      setBulk({ done: index + 1, total: pending.length });
    }

    setBulk(null);
    toast.show(
      failed === 0
        ? `${created} logins created, password ${password}`
        : `${created} created, ${failed} failed`,
      failed === 0 ? 'success' : 'error',
    );
  }

  return (
    <Screen bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Organiser"
        title="Participant logins"
        subtitle="One login per team member, grouped by team."
      />

      <Card style={styles.passwordCard}>
        <View style={styles.passwordTop}>
          <View style={styles.flex}>
            <Text style={styles.passwordLabel}>DEFAULT PASSWORD</Text>
            <Text style={[styles.password, { color: accent }]}>{password}</Text>
          </View>
          <IconButton
            icon="content-copy"
            accessibilityLabel="Copy the default password"
            color={accent}
            background={withAlpha(accent, 0.14)}
            onPress={async () => {
              await Clipboard.setStringAsync(password);
              toast.show('Default password copied', 'success');
            }}
          />
        </View>
        <Text style={styles.passwordHint}>
          Every new participant login is created with this password. They sign in with their own
          email address and can change it from their profile at any time.
        </Text>
      </Card>

      <StatGrid>
        <StatCard label="Teams" value={totals.teams} icon="account-group-outline" color={accent} />
        <StatCard
          label="Can sign in"
          value={totals.withAccount}
          sub={`of ${totals.people} people`}
          icon="login-variant"
          color={Brand.green}
        />
        <StatCard
          label="Need a login"
          value={totals.missing}
          sub="have an email, no account"
          icon="account-plus-outline"
          color={totals.missing > 0 ? Brand.amber : Brand.textFaint}
        />
        <StatCard
          label="No email"
          value={totals.noEmail}
          sub="cannot be given a login"
          icon="email-off-outline"
          color={totals.noEmail > 0 ? Brand.red : Brand.textFaint}
        />
      </StatGrid>

      {totals.noEmail > 0 && (
        <Banner
          tone="warn"
          title={`${totals.noEmail} people have no email on the roster`}
          message="A login needs an email address. Add theirs on the team record, then create the logins again."
        />
      )}

      {bulk ? (
        <Card style={styles.bulk}>
          <Text style={styles.bulkText}>
            Creating logins, team {bulk.done} of {bulk.total}
          </Text>
          <ProgressBar value={bulk.done} max={Math.max(1, bulk.total)} color={accent} />
        </Card>
      ) : (
        <Button
          label={
            totals.missing > 0
              ? `Create the ${totals.missing} missing logins`
              : 'Every login has been created'
          }
          icon="account-multiple-plus-outline"
          accent={accent}
          disabled={totals.missing === 0}
          onPress={() => setConfirmAll(true)}
          full
        />
      )}

      <SearchInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search team, code, name or email"
        accent={accent}
      />

      {data.teams.length === 0 ? (
        <EmptyState
          icon="account-group-outline"
          title="No teams yet"
          message="Import the registration CSV first, then the logins can be created from here."
        />
      ) : (
        <Section title="By team" hint="Tap a team to see its members.">
          {data.teams.map((team) => {
            const isOpen = expanded === team.teamId;
            const ready = team.missing === 0 && team.withEmail > 0;

            return (
              <Card key={team.teamId} style={styles.team}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${team.name}, ${team.withAccount} of ${team.members.length} can sign in`}
                  onPress={() => setExpanded(isOpen ? null : team.teamId)}
                  style={({ pressed }) => [styles.teamHead, pressed && styles.pressed]}>
                  <View
                    style={[
                      styles.teamMark,
                      {
                        backgroundColor: ready
                          ? withAlpha(Brand.green, 0.14)
                          : withAlpha(accent, 0.12),
                      },
                    ]}>
                    <MaterialCommunityIcons
                      name={ready ? 'check-bold' : 'account-key-outline'}
                      size={17}
                      color={ready ? Brand.green : accent}
                    />
                  </View>

                  <View style={styles.flex}>
                    <Text style={[styles.teamCode, { color: accent }]}>{team.code}</Text>
                    <Text style={styles.teamName} numberOfLines={1}>
                      {team.name}
                    </Text>
                  </View>

                  <View style={styles.teamCount}>
                    <Text style={styles.teamCountValue}>
                      {team.withAccount}
                      <Text style={styles.teamCountMax}>/{team.members.length}</Text>
                    </Text>
                    <Text style={styles.teamCountLabel}>logins</Text>
                  </View>

                  <MaterialCommunityIcons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={Brand.textFaint}
                  />
                </Pressable>

                {isOpen && (
                  <View style={styles.members}>
                    {team.members.map((member) => (
                      <View key={member.memberId} style={styles.member}>
                        <View style={styles.flex}>
                          <View style={styles.memberTop}>
                            <Text style={styles.memberName}>{member.name}</Text>
                            {member.isLeader && (
                              <Pill label="Lead" icon="star" color={Brand.amber} compact />
                            )}
                          </View>
                          <Text style={styles.memberEmail} numberOfLines={1}>
                            {member.email ?? 'No email on the roster'}
                          </Text>
                        </View>

                        {member.hasAccount ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Reset ${member.name} to the default password`}
                            disabled={working !== null}
                            onPress={async () => {
                              if (!member.profileId) return;
                              setWorking(member.memberId);
                              try {
                                await resetPassword({ profileId: member.profileId });
                                toast.show(`${member.name} reset to ${password}`, 'success');
                              } catch (error) {
                                toast.show(errorMessage(error), 'error');
                              } finally {
                                setWorking(null);
                              }
                            }}
                            style={({ pressed }) => [
                              styles.resetButton,
                              pressed && styles.pressed,
                            ]}>
                            <MaterialCommunityIcons
                              name="lock-reset"
                              size={14}
                              color={Brand.textMuted}
                            />
                            <Text style={styles.resetText}>Reset</Text>
                          </Pressable>
                        ) : (
                          <Pill
                            label={member.email ? 'No login' : 'No email'}
                            color={member.email ? Brand.amber : Brand.red}
                            compact
                          />
                        )}
                      </View>
                    ))}

                    <Button
                      label={
                        team.missing > 0
                          ? `Create ${team.missing} login${team.missing === 1 ? '' : 's'}`
                          : 'All logins exist'
                      }
                      size="sm"
                      variant="secondary"
                      icon="account-plus-outline"
                      accent={accent}
                      loading={working === team.teamId}
                      disabled={team.missing === 0 || working !== null}
                      onPress={() => createFor(team.teamId, team.code)}
                      full
                    />
                  </View>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      <ConfirmDialog
        visible={confirmAll}
        title={`Create ${totals.missing} logins?`}
        message={`Every member with an email and no account gets one, with the password ${password}. Existing passwords are left alone.`}
        confirmLabel="Create them"
        onCancel={() => setConfirmAll(false)}
        onConfirm={createAll}
      />
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },

  passwordCard: { gap: Space.md },
  passwordTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  passwordLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  password: { fontSize: 30, fontWeight: '800', letterSpacing: 4, marginTop: 2 },
  passwordHint: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18 },

  bulk: { gap: Space.md },
  bulkText: { color: Brand.textDim, fontSize: 13.5, fontWeight: '600' },

  team: { gap: Space.md },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  teamMark: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamCode: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1 },
  teamName: { color: Brand.text, fontSize: 15, fontWeight: '700', marginTop: 1 },
  teamCount: { alignItems: 'flex-end' },
  teamCountValue: { color: Brand.text, fontSize: 16, fontWeight: '800' },
  teamCountMax: { color: Brand.textFaint, fontSize: 12, fontWeight: '700' },
  teamCountLabel: { color: Brand.textFaint, fontSize: 10 },

  members: { gap: Space.md, paddingTop: Space.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  memberName: { color: Brand.text, fontSize: 14, fontWeight: '600' },
  memberEmail: { color: Brand.textFaint, fontSize: 11.5, marginTop: 2 },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.surfaceStrong,
  },
  resetText: { color: Brand.textMuted, fontSize: 11.5, fontWeight: '700' },
}));
