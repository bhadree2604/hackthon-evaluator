import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { TeamCard } from '@/components/team-card';
import { Button, Segmented } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { Banner, Card, EmptyState, Pill, ProgressBar, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useDebounced } from '@/hooks/use-debounced';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme } from '@/lib/theme';

type Scope = 'all' | 'todo' | 'done';

/**
 * The evaluator's panel, one round at a time.
 *
 * Everything on this screen belongs to the round chosen at the top: the
 * progress card, the still-to-score filter and the sheet a team card opens.
 * The same team comes back round after round, which is the whole point.
 */
export default function EvaluatorTeams() {
  const Brand = useColors();
  const RoleTheme = useRoleTheme();
  const accent = RoleTheme.evaluator.accent;
  const styles = useStyles();
  const router = useRouter();
  const { profile } = useSession();

  const rounds = useQuery(api.rounds.list, {});
  const [picked, setPicked] = useState<Id<'rounds'> | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 250);

  /**
   * Derived, not an effect: until a round is picked by hand, land on the one
   * actually being scored right now.
   */
  const roundId = useMemo(() => {
    if (!rounds || rounds.length === 0) return null;
    if (picked && rounds.some((round) => round._id === picked)) return picked;
    return (rounds.find((round) => round.status === 'open') ?? rounds[0])._id;
  }, [picked, rounds]);

  const teams = useQuery(api.teams.list, {
    search: debounced || undefined,
    scope,
    roundId: roundId ?? undefined,
  });
  const progress = useQuery(api.scores.myProgress, roundId ? { roundId } : {});

  const round = rounds?.find((entry) => entry._id === roundId) ?? null;

  if (rounds === undefined) {
    return (
      <Screen gradient={RoleTheme.evaluator.gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading rounds" />
      </Screen>
    );
  }

  return (
    <Screen gradient={RoleTheme.evaluator.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow="Evaluator"
        title={profile ? `Hello, ${profile.name.split(' ')[0]}` : 'Teams'}
        subtitle={
          round
            ? `Scoring ${round.name}. Pick a team, or scan its badge.`
            : 'Pick a round to start scoring.'
        }
      />

      <Button
        label="Scan a team badge"
        icon="qrcode-scan"
        accent={accent}
        onPress={() => router.push('/scan' as never)}
        full
      />

      {rounds.length === 0 ? (
        <EmptyState
          icon="clipboard-alert-outline"
          title="No rounds are open"
          message="An organiser creates the evaluation rounds and opens them when scoring starts."
        />
      ) : (
        <>
          <View style={styles.roundBar}>
            {rounds.map((entry) => {
              const active = entry._id === roundId;
              return (
                <Pressable
                  key={entry._id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPicked(entry._id)}
                  style={({ pressed }) => [
                    styles.roundChip,
                    active && {
                      backgroundColor: withAlpha(accent, 0.16),
                      borderColor: withAlpha(accent, 0.42),
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[styles.roundChipText, { color: active ? accent : Brand.textMuted }]}>
                    {entry.name}
                  </Text>
                  {entry.status === 'locked' && (
                    <MaterialCommunityIcons
                      name="lock-outline"
                      size={12}
                      color={active ? accent : Brand.textFaint}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          {round?.status === 'locked' && (
            <Banner
              tone="warn"
              title={`${round.name} is locked`}
              message="You can read your sheets, but marks can no longer be changed."
            />
          )}

          {!!progress && !!round && (
            <Card style={styles.progress}>
              <View style={styles.progressTop}>
                <View style={styles.flex}>
                  <Text style={styles.progressLabel}>{round.name.toUpperCase()}</Text>
                  <Text style={styles.progressValue}>
                    {progress.submitted}
                    <Text style={styles.progressMax}> / {progress.totalTeams} teams</Text>
                  </Text>
                </View>
                <View style={styles.progressPills}>
                  {progress.drafts > 0 && (
                    <Pill
                      label={`${progress.drafts} draft`}
                      icon="circle-edit-outline"
                      color={Brand.amber}
                      compact
                    />
                  )}
                  <Pill
                    label={`${progress.remaining} to go`}
                    icon="timer-sand"
                    color={progress.remaining === 0 ? Brand.green : accent}
                    compact
                  />
                </View>
              </View>
              <ProgressBar
                value={progress.submitted}
                max={Math.max(1, progress.totalTeams)}
                color={accent}
              />
              {progress.averagePercent !== null && (
                <Text style={styles.progressHint}>
                  Your average in this round is {Math.round(progress.averagePercent)}%.
                </Text>
              )}
            </Card>
          )}

          <SearchInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search team, code or project"
            accent={accent}
          />

          <Segmented
            accent={accent}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All teams' },
              { value: 'todo', label: 'Still to score' },
              { value: 'done', label: 'Done' },
            ]}
          />

          {teams === undefined ? (
            <ScreenLoading label="Loading teams" />
          ) : teams.length === 0 ? (
            <EmptyState
              icon="account-group-outline"
              title={scope === 'todo' ? 'Nothing left to score' : 'No teams here'}
              message={
                scope === 'todo'
                  ? `Every team has a submitted sheet from you in ${round?.name ?? 'this round'}.`
                  : 'Try a different search or filter.'
              }
            />
          ) : (
            teams.map((team) => (
              <TeamCard
                key={team._id}
                team={team}
                accent={accent}
                showScore
                onPress={() =>
                  router.push(
                    (roundId
                      ? `/score/${team._id}?roundId=${roundId}`
                      : `/score/${team._id}`) as never,
                  )
                }
                trailing={
                  team.scoredByMe ? (
                    <Pill label="Scored" icon="check-circle" color={Brand.green} compact />
                  ) : team.draftByMe ? (
                    <Pill label="Draft" icon="circle-edit-outline" color={Brand.amber} compact />
                  ) : undefined
                }
              />
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  pressed: { opacity: 0.65 },

  roundBar: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.inputBg,
  },
  roundChipText: { fontSize: 12, fontWeight: '700' },

  progress: { gap: Space.md },
  progressTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  progressLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  progressValue: {
    color: Brand.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 3,
  },
  progressMax: { color: Brand.textFaint, fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  progressPills: { alignItems: 'flex-end', gap: 6 },
  progressHint: { color: Brand.textFaint, fontSize: 11.5 },
}));
