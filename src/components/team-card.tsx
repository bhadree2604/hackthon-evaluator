import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';

import { Card, Pill, ProgressBar, withAlpha } from '@/components/ui/primitives';
import { Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

export type TeamCardData = {
  _id: string;
  code: string;
  name: string;
  projectTitle?: string | null;
  problemStatementId?: string | null;
  domain?: string | null;
  track?: 'software' | 'hardware' | 'open' | null;
  labName?: string | null;
  tableNo?: string | null;
  coordinatorName?: string | null;
  memberCount: number;
  leader?: string | null;
  evaluationCount: number;
  avgPercent?: number | null;
  status: 'active' | 'disqualified' | 'withdrawn';
};

function trackColor(Brand: ReturnType<typeof useColors>, track: string) {
  if (track === 'software') return Brand.cyan;
  if (track === 'hardware') return Brand.orange;
  return Brand.lilac;
}

export function TeamCard({
  team,
  accent: accentProp,
  onPress,
  showScore = false,
  showCoordinator = false,
  trailing,
}: {
  team: TeamCardData;
  accent?: string;
  onPress?: () => void;
  showScore?: boolean;
  showCoordinator?: boolean;
  trailing?: React.ReactNode;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const inactive = team.status !== 'active';

  return (
    <Card accent={inactive ? Brand.textFaint : accent} onPress={onPress}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <View style={styles.codeRow}>
            <Text style={[styles.code, { color: accent }]}>{team.code}</Text>
            {!!team.track && (
              <Pill
                label={team.track}
                color={trackColor(Brand, team.track)}
                compact
              />
            )}
            {inactive && <Pill label={team.status} color={Brand.red} compact />}
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {team.name}
          </Text>
          {!!team.projectTitle && (
            <Text style={styles.project} numberOfLines={2}>
              {team.projectTitle}
            </Text>
          )}
        </View>
        {trailing ?? <MaterialCommunityIcons name="chevron-right" size={20} color={Brand.textFaint} />}
      </View>

      <View style={styles.metaRow}>
        <Meta icon="account-multiple-outline" text={`${team.memberCount} members`} />
        {!!team.labName && <Meta icon="door-open" text={team.labName} />}
        {!!team.tableNo && <Meta icon="table-furniture" text={`Table ${team.tableNo}`} />}
        {!!team.problemStatementId && (
          <Meta icon="lightbulb-outline" text={team.problemStatementId} />
        )}
        {showCoordinator && !!team.coordinatorName && (
          <Meta icon="account-tie-outline" text={team.coordinatorName} />
        )}
      </View>

      {showScore && (
        <View style={styles.scoreBlock}>
          <View style={styles.scoreHead}>
            <Text style={styles.scoreLabel}>
              {team.evaluationCount === 0
                ? 'Not evaluated yet'
                : `${team.evaluationCount} evaluation${team.evaluationCount === 1 ? '' : 's'}`}
            </Text>
            <Text
              style={[
                styles.scoreValue,
                { color: team.avgPercent == null ? Brand.textFaint : accent },
              ]}>
              {team.avgPercent == null ? '—' : `${team.avgPercent.toFixed(1)}%`}
            </Text>
          </View>
          <ProgressBar
            value={team.avgPercent ?? 0}
            max={100}
            color={team.avgPercent == null ? withAlpha(Brand.textFaint, 0.4) : accent}
            height={5}
          />
        </View>
      )}
    </Card>
  );
}

function Meta({
  icon,
  text,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
}) {
  const Brand = useColors();
  const styles = useStyles();
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons name={icon} size={12} color={Brand.textFaint} />
      <Text style={styles.metaText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, flexWrap: 'wrap' },
  code: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1 },
  name: { color: Brand.text, fontSize: 16, fontWeight: '700', marginTop: 5, letterSpacing: -0.2 },
  project: { color: Brand.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    marginTop: Space.md,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' },
  metaText: { color: Brand.textFaint, fontSize: 11.5, fontWeight: '600' },

  scoreBlock: { marginTop: Space.lg, gap: 7 },
  scoreHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  scoreLabel: { color: Brand.textFaint, fontSize: 11.5, fontWeight: '600' },
  scoreValue: { fontSize: 14.5, fontWeight: '800' },
}));
