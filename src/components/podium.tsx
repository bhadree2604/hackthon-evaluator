import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { withAlpha } from '@/components/ui/primitives';
import { medalColours, PLACES, Radius, Space } from '@/constants/brand';
import { makeStyles, useColors, useThemeMode } from '@/lib/theme';

export type PodiumEntry = {
  teamId: string;
  rank: number;
  code: string;
  name: string;
  points: number;
  percent: number | null;
  isMine?: boolean;
};

/** Plinth heights by rank, so first place stands above the other two. */
const HEIGHTS = [116, 86, 68];
const ICONS = ['trophy', 'medal', 'medal-outline'] as const;

/**
 * The winners' stage: second on the left, first raised in the middle, third on
 * the right, each on a plinth sized by its place. Fewer than three teams still
 * renders — a two-team stage simply has no third column.
 */
export function Podium({ top, maxPoints }: { top: PodiumEntry[]; maxPoints: number }) {
  const Brand = useColors();
  const { isDark } = useThemeMode();
  const styles = useStyles();
  const medals = medalColours(isDark);

  const byRank = (rank: number) => top.find((entry) => entry.rank === rank) ?? null;
  // Left to right, so the tallest column lands in the middle.
  const order = [byRank(2), byRank(1), byRank(3)];

  if (!byRank(1)) return null;

  return (
    <View style={styles.stage}>
      <View style={styles.columns}>
        {order.map((entry, index) => {
          if (!entry) return <View key={`empty-${index}`} style={styles.column} />;

          const medal = medals[entry.rank - 1];
          const height = HEIGHTS[entry.rank - 1];
          const isWinner = entry.rank === 1;

          return (
            <View key={entry.teamId} style={styles.column}>
              <View
                style={[
                  styles.medal,
                  isWinner && styles.medalWinner,
                  {
                    backgroundColor: withAlpha(medal, 0.16),
                    borderColor: withAlpha(medal, 0.5),
                  },
                ]}>
                <MaterialCommunityIcons
                  name={ICONS[entry.rank - 1]}
                  size={isWinner ? 26 : 20}
                  color={medal}
                />
              </View>

              <Text
                style={[styles.name, isWinner && styles.nameWinner]}
                numberOfLines={2}>
                {entry.name}
              </Text>
              <Text style={styles.code} numberOfLines={1}>
                {entry.code}
              </Text>
              <Text style={[styles.points, { color: medal }]}>
                {Math.round(entry.points * 10) / 10}
                <Text style={styles.pointsMax}> / {maxPoints}</Text>
              </Text>

              <View
                style={[
                  styles.plinth,
                  {
                    height,
                    backgroundColor: withAlpha(medal, isDark ? 0.14 : 0.1),
                    borderColor: withAlpha(medal, 0.42),
                  },
                  entry.isMine && { borderColor: medal, borderWidth: 2 },
                ]}>
                <Text style={[styles.place, { color: medal }]}>{PLACES[entry.rank - 1]}</Text>
                {entry.percent !== null && (
                  <Text style={styles.percent}>{Math.round(entry.percent)}%</Text>
                )}
                {entry.isMine && (
                  <View style={[styles.youTag, { backgroundColor: withAlpha(medal, 0.22) }]}>
                    <Text style={[styles.youText, { color: medal }]}>YOUR TEAM</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* The floor the plinths stand on. */}
      <View style={[styles.floor, { backgroundColor: Brand.borderSubtle }]} />
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  stage: { gap: 0 },
  columns: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm },
  column: { flex: 1, alignItems: 'center', gap: 3 },

  medal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 3,
    marginBottom: 2,
  },
  medalWinner: { width: 50, height: 50, borderRadius: 25 },

  name: {
    color: Brand.text,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  nameWinner: { fontSize: 14.5 },
  code: { color: Brand.textFaint, fontSize: 9.5, letterSpacing: 0.3 },
  points: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, marginTop: 1 },
  pointsMax: { color: Brand.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 0 },

  plinth: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: Space.sm,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: 0,
    paddingHorizontal: 4,
  },
  place: { fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  percent: { color: Brand.textMuted, fontSize: 11.5, fontWeight: '700' },
  youTag: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  youText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },

  floor: { height: 3, borderRadius: 2 },
}));
