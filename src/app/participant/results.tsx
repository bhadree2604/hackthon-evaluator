import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { StyleSheet, Text, View } from 'react-native';

import { Podium } from '@/components/podium';
import { TAB_BAR_INSET } from '@/components/role-shell';
import { Card, EmptyState, Pill, ProgressBar, Section, withAlpha } from '@/components/ui/primitives';
import { Screen, ScreenHeader, ScreenLoading } from '@/components/ui/screen';
import { EVENT, medalColours, Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { useSession } from '@/lib/session';
import { makeStyles, useColors, useRoleTheme, useThemeMode } from '@/lib/theme';

/**
 * Final standings for a team.
 *
 * Nothing here exists until the organisers publish: both queries return
 * `published: false` and the screen shows the waiting state, so a placing can
 * never leak out through a half finished round.
 */
export default function ParticipantResults() {
  const RoleTheme = useRoleTheme();
  const accent = RoleTheme.participant.accent;
  const styles = useStyles();

  const { profile } = useSession();

  const board = useQuery(api.results.board, {});
  // `myResults` needs a team; asking without one throws rather than returning null.
  const mine = useQuery(api.results.myResults, profile?.teamId ? {} : 'skip');

  if (board === undefined) {
    return (
      <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenLoading label="Loading the results" />
      </Screen>
    );
  }

  if (!board.published) {
    return (
      <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
        <ScreenHeader
          eyebrow="Participant"
          title="Results"
          subtitle="The leaderboard opens here once judging is finished."
        />
        <EmptyState
          icon="trophy-outline"
          title="Results are not out yet"
          message="Every round is marked first, then the organisers release the standings all at once. You will get a notification the moment they do."
        />
      </Screen>
    );
  }

  const podium = board.rows
    .filter((row) => row.rank !== null && row.rank <= 3)
    .map((row) => ({
      teamId: row.teamId,
      rank: row.rank as number,
      code: row.code,
      name: row.name,
      points: row.points,
      percent: row.percent,
      isMine: row.isMine,
    }));

  return (
    <Screen gradient={RoleTheme.participant.gradient} bottomInset={TAB_BAR_INSET}>
      <ScreenHeader
        eyebrow={EVENT.name}
        title="Final results"
        subtitle={`${board.rows.length} teams, ranked on every round added together.`}
        right={<MaterialCommunityIcons name="trophy" size={22} color={accent} />}
      />

      <Card style={styles.stageCard}>
        <Podium top={podium} maxPoints={board.maxPoints} />
      </Card>

      {!!mine && mine.published && <MyPlacing data={mine} accent={accent} />}

      <Section title="Full standings" hint={`Out of ${board.maxPoints}`}>
        {board.rows.map((row) => (
          <StandingRow
            key={row.teamId}
            row={row}
            maxPoints={board.maxPoints}
            accent={accent}
          />
        ))}
      </Section>

      <Text style={styles.footnote}>
        Each round is the average of the evaluators who scored you, and the rounds are added
        together for the cumulative. Marks are final.
      </Text>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

/** The team's own result, spelled out round by round. */
type BoardData = Extract<(typeof api.results.board)['_returnType'], { published: true }>;
type MyResultsData = Extract<(typeof api.results.myResults)['_returnType'], { published: true }>;

function MyPlacing({ data, accent }: { data: MyResultsData; accent: string }) {
  const Brand = useColors();
  const styles = useStyles();

  return (
    <Section title="Your team">
      <Card accent={accent} style={styles.mine}>
        <View style={styles.mineTop}>
          <View style={styles.flex}>
            <Text style={styles.mineLabel}>CUMULATIVE</Text>
            <Text style={[styles.mineValue, { color: accent }]}>
              {Math.round(data.cumulativePoints * 10) / 10}
              <Text style={styles.mineMax}> / {data.maxPoints}</Text>
            </Text>
          </View>
          {data.rank !== null && (
            <Pill
              label={`${ordinal(data.rank)} of ${data.teamCount}`}
              color={accent}
              icon="podium"
            />
          )}
        </View>

        <ProgressBar value={data.cumulativePercent ?? 0} color={accent} />

        <View style={styles.rounds}>
          {data.rounds.map((round) => (
            <View key={round.roundId} style={styles.roundRow}>
              <Text style={styles.roundName} numberOfLines={1}>
                {round.name}
              </Text>
              <Text style={styles.roundMeta}>
                {round.evaluatorCount === 0
                  ? 'not scored'
                  : `${round.evaluatorCount} evaluator${round.evaluatorCount === 1 ? '' : 's'}`}
              </Text>
              <Text style={styles.roundPoints}>
                {round.points === null ? '–' : Math.round(round.points * 10) / 10}
                <Text style={styles.roundMax}> / {round.maxTotal}</Text>
              </Text>
            </View>
          ))}

          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Cumulative</Text>
            <Text style={[styles.sumValue, { color: accent }]}>
              {Math.round(data.cumulativePoints * 10) / 10}
              <Text style={styles.roundMax}> / {data.maxPoints}</Text>
            </Text>
          </View>
        </View>

        <Text style={styles.breakdownLabel}>AVERAGE PER CRITERION</Text>
        <View style={styles.breakdown}>
          {data.breakdown.map((criterion) => (
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
                  ? '–'
                  : `${Math.round(criterion.average * 10) / 10}/${criterion.maxScore}`}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.mineHint, { color: Brand.textFaint }]}>
          Averaged across every evaluator who scored you in each round.
        </Text>
      </Card>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function StandingRow({
  row,
  maxPoints,
  accent,
}: {
  row: BoardData['rows'][number];
  maxPoints: number;
  accent: string;
}) {
  const Brand = useColors();
  const { isDark } = useThemeMode();
  const styles = useStyles();

  const medal = row.rank !== null && row.rank <= 3 ? medalColours(isDark)[row.rank - 1] : null;
  const tint = row.isMine ? accent : (medal ?? Brand.textMuted);

  return (
    <Card
      accent={row.isMine ? accent : undefined}
      style={[styles.row, row.isMine && { borderColor: withAlpha(accent, 0.5) }]}>
      <View style={styles.rowHead}>
        <View
          style={[
            styles.rank,
            {
              backgroundColor: withAlpha(tint, 0.14),
              borderColor: withAlpha(tint, 0.38),
            },
          ]}>
          <Text style={[styles.rankText, { color: tint }]}>{row.rank ?? '–'}</Text>
        </View>

        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.teamName} numberOfLines={1}>
              {row.name}
            </Text>
            {row.isMine && <Pill label="You" color={accent} compact />}
          </View>
          <Text style={styles.teamMeta} numberOfLines={1}>
            {row.code}
            {row.labName ? ` · ${row.labName}` : ''}
          </Text>
        </View>

        <View style={styles.scoreBox}>
          <Text style={[styles.score, { color: tint }]}>
            {Math.round(row.points * 10) / 10}
            <Text style={styles.scoreMax}> / {maxPoints}</Text>
          </Text>
          {row.percent !== null && (
            <Text style={styles.scoreSub}>{Math.round(row.percent)}%</Text>
          )}
        </View>
      </View>

      {/* Where the total came from, round by round. */}
      <View style={styles.pips}>
        {row.perRound.map((round) => (
          <View
            key={round.roundId}
            style={[
              styles.pip,
              {
                borderColor:
                  round.points === null ? Brand.borderSubtle : withAlpha(tint, 0.3),
                backgroundColor: round.points === null ? Brand.inputBg : withAlpha(tint, 0.08),
              },
            ]}>
            <Text style={styles.pipName} numberOfLines={1}>
              {round.name.replace(/^Round\s*/i, 'R')}
            </Text>
            <Text style={styles.pipValue}>
              {round.points === null ? '–' : Math.round(round.points * 10) / 10}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** 1st, 2nd, 3rd, 4th … including the 11th–13th exceptions. */
function ordinal(rank: number) {
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return `${rank}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th';
  return `${rank}${suffix}`;
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },

  stageCard: { paddingBottom: 0, overflow: 'hidden' },

  mine: { gap: Space.md },
  mineTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  mineLabel: { color: Brand.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  mineValue: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2, marginTop: 2 },
  mineMax: { color: Brand.textFaint, fontSize: 15, fontWeight: '700', letterSpacing: 0 },
  mineHint: { fontSize: 11.5, lineHeight: 16 },

  rounds: { gap: Space.sm },
  roundRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  roundName: { color: Brand.textDim, fontSize: 13, flex: 1 },
  roundMeta: { color: Brand.textFaint, fontSize: 10.5 },
  roundPoints: { color: Brand.text, fontSize: 13.5, fontWeight: '800', minWidth: 74, textAlign: 'right' },
  roundMax: { color: Brand.textFaint, fontSize: 10.5, fontWeight: '700' },

  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: Brand.borderSubtle,
  },
  sumLabel: { color: Brand.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
  sumValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },

  breakdownLabel: { color: Brand.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  breakdown: { gap: Space.sm },
  criterion: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  criterionLabel: { color: Brand.textDim, fontSize: 12.5, width: 104 },
  criterionBar: { flex: 1 },
  criterionValue: {
    color: Brand.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
    width: 50,
    textAlign: 'right',
  },

  row: { gap: Space.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rank: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  rankText: { fontSize: 13.5, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  teamName: { color: Brand.text, fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  teamMeta: { color: Brand.textFaint, fontSize: 11, marginTop: 2 },
  scoreBox: { alignItems: 'flex-end' },
  score: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  scoreMax: { color: Brand.textFaint, fontSize: 10.5, fontWeight: '700', letterSpacing: 0 },
  scoreSub: { color: Brand.textFaint, fontSize: 10.5 },

  pips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pip: {
    flexGrow: 1,
    minWidth: 58,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: 1,
  },
  pipName: {
    color: Brand.textFaint,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pipValue: { color: Brand.text, fontSize: 12.5, fontWeight: '800' },

  footnote: {
    color: Brand.textFaint,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
}));
