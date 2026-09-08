import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from 'convex/react';
import { Text, View } from 'react-native';

import { TeamBadge } from '@/components/team-code';
import { Card, Pill, ProgressBar, Section, withAlpha } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { api } from '@/convex/_generated/api';
import { makeStyles, useColors } from '@/lib/theme';

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
 * Results, but only the rounds an organiser has published. Nothing is shown
 * at all until the first round is released, so a team never sees a half
 * finished round or guesses at its position.
 */
export function TeamResults({ accent }: { accent: string }) {
  const Brand = useColors();
  const styles = useStyles();
  const results = useQuery(api.scores.myTeamResults, {});

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
              Your marks appear here as soon as the organisers publish a round.
            </Text>
          </View>
        </Card>
      </Section>
    );
  }

  return (
    <Section
      title="Evaluation"
      hint={`${results.rounds.length} published round${results.rounds.length === 1 ? '' : 's'}`}>
      {results.cumulativePercent !== null && (
        <Card style={styles.cumulative}>
          <Text style={styles.cumulativeLabel}>CUMULATIVE</Text>
          <Text style={[styles.cumulativeValue, { color: accent }]}>
            {Math.round(results.cumulativePercent)}
            <Text style={styles.cumulativeUnit}>%</Text>
          </Text>
          <ProgressBar value={results.cumulativePercent} color={accent} />
          <Text style={styles.cumulativeHint}>
            Every published round combined by its weight. Rankings are not shared with teams.
          </Text>
        </Card>
      )}

      {results.rounds.map((round) => (
        <Card key={round.roundId} style={styles.round}>
          <View style={styles.roundHead}>
            <View style={styles.flex}>
              <Text style={styles.roundName}>{round.name}</Text>
              <Text style={styles.roundMeta}>
                {round.evaluatorCount === 0
                  ? 'Not scored'
                  : `${round.evaluatorCount} evaluator${
                      round.evaluatorCount === 1 ? '' : 's'
                    }`}
                {round.weight !== 1 ? ` · weight ×${round.weight}` : ''}
              </Text>
            </View>
            <View style={styles.roundScore}>
              <Text style={[styles.roundValue, { color: accent }]}>
                {round.total === null ? '-' : Math.round(round.total * 10) / 10}
              </Text>
              <Text style={styles.roundMax}>/ {round.maxTotal}</Text>
            </View>
          </View>

          {round.percent !== null && <ProgressBar value={round.percent} color={accent} />}

          <View style={styles.breakdown}>
            {round.breakdown.map((criterion) => (
              <View key={criterion.key} style={styles.criterion}>
                <Text style={styles.criterionLabel} numberOfLines={1}>
                  {criterion.label}
                </Text>
                <Pill
                  label={
                    criterion.average === null
                      ? '-'
                      : `${Math.round(criterion.average * 10) / 10}/${criterion.maxScore}`
                  }
                  color={criterion.average === null ? Brand.textFaint : Brand.textDim}
                  compact
                />
              </View>
            ))}
          </View>
        </Card>
      ))}
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

  cumulative: { gap: Space.sm },
  cumulativeLabel: {
    color: Brand.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cumulativeValue: { fontSize: 40, fontWeight: '800', letterSpacing: -1.5 },
  cumulativeUnit: { fontSize: 20, fontWeight: '700' },
  cumulativeHint: { color: Brand.textFaint, fontSize: 11.5, lineHeight: 16 },

  round: { gap: Space.md },
  roundHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  roundName: { color: Brand.text, fontSize: 15, fontWeight: '700' },
  roundMeta: { color: Brand.textFaint, fontSize: 11.5, marginTop: 2 },
  roundScore: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  roundValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  roundMax: { color: Brand.textFaint, fontSize: 12, fontWeight: '700' },

  breakdown: { gap: Space.sm },
  criterion: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  criterionLabel: { color: Brand.textDim, fontSize: 12.5, flex: 1 },
}));
