import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TAB_BAR_INSET } from '@/components/role-shell';
import { Segmented } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/inputs';
import { Card, EmptyState, Pill, ProgressBar, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { medalColours, Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { makeStyles, useColors, useThemeMode } from '@/lib/theme';

/**
 * Standings.
 *
 * The default view is the cumulative, which is the number that decides the
 * winners: every round's percentage combined by that round's weight. Picking a
 * round instead ranks that round on its own. A row opens to show where the
 * marks came from, round by round.
 */

type Filter = 'all' | 'scored' | 'pending';

export function LeaderboardView({
  accent,
  eyebrow,
  gradient,
}: {
  accent: string;
  eyebrow: string;
  gradient: [string, string, string];
}) {
  const Brand = useColors();
  const { isDark } = useThemeMode();
  const styles = useStyles();
  const router = useRouter();

  const [roundId, setRoundId] = useState<Id<'rounds'> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const board = useQuery(api.scores.leaderboard, roundId ? { roundId } : {});
  const medals = medalColours(isDark);

  const rows = useMemo(() => {
    if (!board) return [];
    const needle = search.trim().toLowerCase();

    return board.rows.filter((row) => {
      if (filter === 'scored' && !row.scored) return false;
      if (filter === 'pending' && row.scored) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle) ||
        (row.projectTitle ?? '').toLowerCase().includes(needle)
      );
    });
  }, [board, filter, search]);

  if (board === undefined) {
    return (
      <Screen gradient={gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Working out the standings" />
      </Screen>
    );
  }

  const selected = board.rounds.find((round) => round._id === roundId) ?? null;
  const scoredCount = board.rows.filter((row) => row.scored).length;

  return (
    <Screen gradient={gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow={eyebrow}
        title={selected ? selected.name : 'Cumulative'}
        subtitle={
          selected
            ? `Ranked on this round alone. It carries a weight of ×${selected.weight}.`
            : 'Every round combined by weight. This is the board that decides the winners.'
        }
      />

      {board.rounds.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No rounds are being counted yet"
          message="Once an organiser opens a round, results appear here as evaluators submit."
        />
      ) : (
        <>
          <View style={styles.roundBar}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: roundId === null }}
              onPress={() => setRoundId(null)}
              style={({ pressed }) => [
                styles.roundChip,
                roundId === null && {
                  backgroundColor: withAlpha(accent, 0.16),
                  borderColor: withAlpha(accent, 0.42),
                },
                pressed && styles.pressed,
              ]}>
              <MaterialCommunityIcons
                name="sigma"
                size={13}
                color={roundId === null ? accent : Brand.textMuted}
              />
              <Text
                style={[
                  styles.roundChipText,
                  { color: roundId === null ? accent : Brand.textMuted },
                ]}>
                Cumulative
              </Text>
            </Pressable>

            {board.rounds.map((round) => {
              const active = round._id === roundId;
              return (
                <Pressable
                  key={round._id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setRoundId(round._id)}
                  style={({ pressed }) => [
                    styles.roundChip,
                    active && {
                      backgroundColor: withAlpha(accent, 0.16),
                      borderColor: withAlpha(accent, 0.42),
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.roundChipText,
                      { color: active ? accent : Brand.textMuted },
                    ]}>
                    {round.name}
                  </Text>
                  {round.status === 'locked' && (
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

          <SearchInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search team, code or project"
            accent={accent}
          />

          <Segmented
            accent={accent}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: board.rows.length },
              { value: 'scored', label: 'Scored', count: scoredCount },
              {
                value: 'pending',
                label: 'Not yet',
                count: board.rows.length - scoredCount,
              },
            ]}
          />

          {rows.length === 0 ? (
            <EmptyState
              icon="trophy-broken"
              title="Nothing to show"
              message="No team matches that filter yet."
            />
          ) : (
            rows.map((row) => {
              const percent = roundId ? row.roundPercent : row.cumulativePercent;
              const points = roundId ? row.roundPoints : row.cumulativePoints;
              const outOf = roundId ? board.maxTotal : board.maxPoints;
              const isOpen = expanded === row.teamId;
              const medal = row.rank !== null && row.rank <= 3 ? medals[row.rank - 1] : null;

              return (
                <Card key={row.teamId} style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${row.name}, ${
                      percent === null ? 'not scored' : `${Math.round(percent)} percent`
                    }`}
                    onPress={() => setExpanded(isOpen ? null : row.teamId)}
                    style={({ pressed }) => [styles.rowHead, pressed && styles.pressed]}>
                    <View
                      style={[
                        styles.rank,
                        {
                          backgroundColor: medal
                            ? withAlpha(medal, 0.16)
                            : Brand.surfaceStrong,
                          borderColor: medal ? withAlpha(medal, 0.4) : Brand.borderSubtle,
                        },
                      ]}>
                      {medal ? (
                        <MaterialCommunityIcons name="trophy" size={15} color={medal} />
                      ) : (
                        <Text style={styles.rankText}>{row.rank ?? '-'}</Text>
                      )}
                    </View>

                    <View style={styles.flex}>
                      <Text style={styles.teamName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.teamMeta} numberOfLines={1}>
                        {row.code}
                        {row.labName ? ` · ${row.labName}` : ''}
                        {` · ${row.roundsScored}/${row.roundsCounted} rounds`}
                      </Text>
                    </View>

                    <View style={styles.scoreBox}>
                      <Text
                        style={[
                          styles.score,
                          { color: points === null ? Brand.textFaint : accent },
                        ]}>
                        {points === null ? '–' : Math.round(points * 10) / 10}
                        <Text style={styles.scoreMax}> / {outOf}</Text>
                      </Text>
                      <Text style={styles.scoreSub}>
                        {percent === null ? '' : `${Math.round(percent)}% · `}
                        {row.sheets} sheet{row.sheets === 1 ? '' : 's'}
                      </Text>
                    </View>

                    <MaterialCommunityIcons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Brand.textFaint}
                    />
                  </Pressable>

                  <ProgressBar value={percent ?? 0} color={medal ?? accent} />

                  {/* Every round at a glance, even in the cumulative view. */}
                  <View style={styles.roundStrip}>
                    {row.perRound.map((round) => (
                      <View
                        key={round.roundId}
                        style={[
                          styles.roundPip,
                          {
                            borderColor:
                              round.percent === null
                                ? Brand.borderSubtle
                                : withAlpha(accent, 0.35),
                            backgroundColor:
                              round.percent === null
                                ? Brand.inputBg
                                : withAlpha(accent, 0.1),
                          },
                        ]}>
                        <Text style={styles.roundPipName} numberOfLines={1}>
                          {round.name.replace(/^Round\s*/i, 'R')}
                        </Text>
                        <Text
                          style={[
                            styles.roundPipValue,
                            {
                              color: round.percent === null ? Brand.textFaint : Brand.text,
                            },
                          ]}>
                          {round.percent === null ? '-' : `${Math.round(round.percent)}%`}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {isOpen && (
                    <View style={styles.detail}>
                      {!!row.projectTitle && (
                        <Text style={styles.project}>{row.projectTitle}</Text>
                      )}

                      <View style={styles.detailRounds}>
                        {row.perRound.map((round) => (
                          <View key={round.roundId} style={styles.detailRound}>
                            <View style={styles.detailRoundHead}>
                              <Text style={styles.detailRoundName}>{round.name}</Text>
                              <Pill
                                label={`×${round.weight}`}
                                color={Brand.lilac}
                                compact
                              />
                            </View>
                            <Text style={styles.detailRoundValue}>
                              {round.total === null
                                ? 'Not scored yet'
                                : `${Math.round(round.total * 10) / 10} / ${round.maxTotal}`}
                              {round.sheets > 0
                                ? `  ·  ${round.sheets} evaluator${
                                    round.sheets === 1 ? '' : 's'
                                  }`
                                : ''}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <Text style={styles.detailLabel}>AVERAGE PER CRITERION</Text>
                      {row.breakdown.map((criterion) => (
                        <View key={criterion.key} style={styles.criterion}>
                          <Text style={styles.criterionLabel} numberOfLines={1}>
                            {criterion.label}
                          </Text>
                          <View style={styles.criterionBar}>
                            <ProgressBar
                              value={criterion.average ?? 0}
                              max={criterion.maxScore}
                              color={accent}
                              height={5}
                            />
                          </View>
                          <Text style={styles.criterionValue}>
                            {criterion.average === null
                              ? '-'
                              : `${Math.round(criterion.average * 10) / 10}/${
                                  criterion.maxScore
                                }`}
                          </Text>
                        </View>
                      ))}

                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push(`/team/${row.teamId}` as never)}
                        style={({ pressed }) => [styles.openTeam, pressed && styles.pressed]}>
                        <Text style={[styles.openTeamText, { color: accent }]}>
                          Open the team record
                        </Text>
                        <MaterialCommunityIcons name="chevron-right" size={16} color={accent} />
                      </Pressable>
                    </View>
                  )}
                </Card>
              );
            })
          )}

          {!roundId && (
            <Text style={styles.footnote}>
              Every round&apos;s mark is the average of its submitted sheets, and the cumulative
              adds those rounds together out of {board.maxPoints}. A round a team has not been
              scored in yet counts as zero, so the board only settles once every round is in.
            </Text>
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

  row: { gap: Space.md },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rank: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rankText: { color: Brand.textMuted, fontSize: 13, fontWeight: '800' },
  teamName: { color: Brand.text, fontSize: 15, fontWeight: '700' },
  teamMeta: { color: Brand.textFaint, fontSize: 11.5, marginTop: 2 },
  scoreBox: { alignItems: 'flex-end' },
  score: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  scoreMax: { color: Brand.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  scoreSub: { color: Brand.textFaint, fontSize: 10.5 },

  roundStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roundPip: {
    flexGrow: 1,
    minWidth: 62,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: 2,
  },
  roundPipName: {
    color: Brand.textFaint,
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  roundPipValue: { fontSize: 13, fontWeight: '800' },

  detail: { gap: Space.md, paddingTop: Space.sm },
  project: { color: Brand.textDim, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  detailRounds: { gap: Space.sm },
  detailRound: {
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
    gap: 4,
  },
  detailRoundHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  detailRoundName: { color: Brand.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
  detailRoundValue: { color: Brand.textMuted, fontSize: 12.5 },

  detailLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  criterion: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  criterionLabel: { color: Brand.textDim, fontSize: 12.5, width: 104 },
  criterionBar: { flex: 1 },
  criterionValue: {
    color: Brand.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
    width: 54,
    textAlign: 'right',
  },

  openTeam: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  openTeamText: { fontSize: 13, fontWeight: '700' },

  footnote: {
    color: Brand.textFaint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
}));
