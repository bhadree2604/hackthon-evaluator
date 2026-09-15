import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { TeamBadge } from '@/components/team-code';
import { Card, Pill, ProgressBar, Section, withAlpha } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { makeStyles } from '@/lib/theme';

/**
 * The two parts of a participant's home screen that belong to the badge and
 * the scoreboard. Kept out of the screen file so the team details, which
 * change rarely, stay readable on their own.
 */

/** The scannable badge. This is what evaluators and coordinators read. */
export function TeamIdentity({ code, teamName }: { code: string; teamName: string }) {
  return (
    <Section title="Your team badge" hint="Have this ready whenever someone asks to scan.">
      <TeamBadge
        code={code}
        teamName={teamName}
        caption="Evaluators scan this to open your score sheet. Coordinators scan it to mark attendance."
      />
    </Section>
  );
}

/**
 * A short result summary for the home screen. Nothing is shown until the
 * organisers publish the final standings, and the detail — every round, every
 * criterion, the whole leaderboard — lives on the Results tab rather than
 * being repeated here.
 */
export function TeamResults({ accent }: { accent: string }) {
  const styles = useStyles();
  const router = useRouter();
  const results = useQuery(api.results.myResults, {});

  if (results === undefined) return null;

  if (!results.published) {
    return (
      <Section title="Evaluation">
        <Card style={styles.pending}>
          <View style={[styles.pendingIcon, { backgroundColor: withAlpha(accent, 0.12) }]}>
            <MaterialCommunityIcons name="clipboard-clock-outline" size={20} color={accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.pendingTitle}>Results are not out yet</Text>
            <Text style={styles.pendingBody}>
              Every round is marked first. Your total appears here, and on the Results tab, the
              moment the organisers release them.
            </Text>
          </View>
        </Card>
      </Section>
    );
  }

  return (
    <Section title="Evaluation" hint="Final">
      {/* `as never`: the generated route map only refreshes from the dev server. */}
      <Card style={styles.cumulative} onPress={() => router.push('/participant/results' as never)}>
        <View style={styles.cumulativeTop}>
          <View style={styles.flex}>
            <Text style={styles.cumulativeLabel}>CUMULATIVE</Text>
            <Text style={[styles.cumulativeValue, { color: accent }]}>
              {Math.round(results.cumulativePoints * 10) / 10}
              <Text style={styles.cumulativeUnit}> / {results.maxPoints}</Text>
            </Text>
          </View>
          {results.rank !== null && (
            <Pill
              label={`${results.rank} of ${results.teamCount}`}
              color={accent}
              icon="podium"
            />
          )}
        </View>

        <ProgressBar value={results.cumulativePercent ?? 0} color={accent} />

        {/* The rounds that add up to it, in one line each. */}
        <View style={styles.rounds}>
          {results.rounds.map((round) => (
            <View key={round.roundId} style={styles.roundRow}>
              <Text style={styles.roundName} numberOfLines={1}>
                {round.name}
              </Text>
              <Text style={styles.roundValue}>
                {round.points === null ? '–' : Math.round(round.points * 10) / 10}
                <Text style={styles.roundMax}> / {round.maxTotal}</Text>
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.more}>
          <Text style={[styles.moreText, { color: accent }]}>
            See the leaderboard and your full breakdown
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={accent} />
        </View>
      </Card>
    </Section>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },

  pending: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  pendingIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: { color: Brand.text, fontSize: 14.5, fontWeight: '700' },
  pendingBody: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  cumulative: { gap: Space.md },
  cumulativeTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  cumulativeLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cumulativeValue: { fontSize: 34, fontWeight: '800', letterSpacing: -1.2, marginTop: 2 },
  cumulativeUnit: { color: Brand.textFaint, fontSize: 15, fontWeight: '700', letterSpacing: 0 },

  rounds: { gap: 5 },
  roundRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  roundName: { color: Brand.textDim, fontSize: 12.5, flex: 1 },
  roundValue: { color: Brand.text, fontSize: 13, fontWeight: '800' },
  roundMax: { color: Brand.textFaint, fontSize: 10.5, fontWeight: '700' },

  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: Brand.borderSubtle,
  },
  moreText: { fontSize: 12.5, fontWeight: '700', flex: 1 },
}));
