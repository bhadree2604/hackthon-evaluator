import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  /** An array is accepted, so a card can layer a conditional highlight on top. */
  style?: StyleProp<ViewStyle>;
  /**
   * Accepted so call sites stay unchanged, but deliberately not rendered:
   * every card uses the same neutral outline. Status is carried by pills and
   * text, not by tinting the container.
   */
  accent?: string;
  onPress?: () => void;
  padded?: boolean;
}) {
  const styles = useStyles();

  const body = (
    <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {body}
    </Pressable>
  );
}

export function Section({
  title,
  action,
  children,
  hint,
}: {
  title: string;
  action?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Pill                                                                        */
/* -------------------------------------------------------------------------- */

export function Pill({
  label,
  color,
  dim,
  icon,
  compact,
}: {
  label: string;
  color?: string;
  dim?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  compact?: boolean;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const tone = color ?? Brand.cyan;

  return (
    <View
      style={[
        styles.pill,
        compact && styles.pillCompact,
        { backgroundColor: dim ?? withAlpha(tone, 0.13), borderColor: withAlpha(tone, 0.35) },
      ]}>
      {!!icon && <MaterialCommunityIcons name={icon} size={compact ? 11 : 13} color={tone} />}
      <Text style={[styles.pillText, compact && styles.pillTextCompact, { color: tone }]}>
        {label}
      </Text>
    </View>
  );
}

/** Hex -> rgba. Falls back to the input when it is already rgba(). */
export function withAlpha(color: string, alpha: number) {
  if (!color.startsWith('#')) return color;
  const hex = color.slice(1);
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

export function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  onPress,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  onPress?: () => void;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const tone = color ?? Brand.cyan;

  return (
    <Card style={styles.stat} onPress={onPress}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        {!!icon && (
          <View style={[styles.statIcon, { backgroundColor: withAlpha(tone, 0.13) }]}>
            <MaterialCommunityIcons name={icon} size={14} color={tone} />
          </View>
        )}
      </View>
      <Text style={[styles.statValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
      {!!sub && (
        <Text style={styles.statSub} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.statGrid}>{children}</View>;
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  max = 100,
  color,
  height = 6,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          borderRadius: height,
          backgroundColor: color ?? Brand.cyan,
        }}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows and misc                                                               */
/* -------------------------------------------------------------------------- */

export function KeyValue({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number | null | undefined;
  color?: string;
}) {
  const Brand = useColors();
  const styles = useStyles();

  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, { color: color ?? Brand.text }]} numberOfLines={2}>
        {value === null || value === undefined || value === '' ? 'Not set' : String(value)}
      </Text>
    </View>
  );
}

export function Avatar({
  name,
  size = 40,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const tone = color ?? Brand.cyan;

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(tone, 0.15),
          borderColor: withAlpha(tone, 0.35),
        },
      ]}>
      <Text style={{ color: tone, fontSize: size * 0.36, fontWeight: '700' }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon = 'inbox-outline',
  title,
  message,
  action,
}: {
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const Brand = useColors();
  const styles = useStyles();

  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name={icon} size={26} color={Brand.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!message && <Text style={styles.emptyMessage}>{message}</Text>}
      {action}
    </Card>
  );
}

export function Divider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

export function Banner({
  tone = 'info',
  title,
  message,
  action,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const Brand = useColors();
  const styles = useStyles();

  const color =
    tone === 'warn'
      ? Brand.amber
      : tone === 'danger'
        ? Brand.red
        : tone === 'success'
          ? Brand.green
          : Brand.blue;
  const icon =
    tone === 'warn'
      ? 'alert-outline'
      : tone === 'danger'
        ? 'alert-circle-outline'
        : tone === 'success'
          ? 'check-circle-outline'
          : 'information-outline';

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: withAlpha(color, 0.1), borderColor: withAlpha(color, 0.3) },
      ]}>
      <MaterialCommunityIcons name={icon} size={18} color={color} style={styles.bannerIcon} />
      <View style={styles.flex}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        {!!message && <Text style={styles.bannerMessage}>{message}</Text>}
        {!!action && <View style={styles.bannerAction}>{action}</View>}
      </View>
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  card: {
    backgroundColor: Brand.cardBg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.cardBorder,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  cardPadded: { padding: Space.lg },
  pressed: { opacity: 0.65, transform: [{ scale: 0.995 }] },

  section: { gap: Space.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.md,
  },
  sectionTitle: {
    color: Brand.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionHint: {
    color: Brand.textFaint,
    fontSize: 12,
    marginTop: 2,
  },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignSelf: 'flex-start',
  },
  pillCompact: { paddingHorizontal: 7, paddingVertical: 3, gap: 4 },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  pillTextCompact: { fontSize: 10.5 },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 140,
    padding: Space.lg,
    gap: 2,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  statLabel: {
    color: Brand.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 4,
  },
  statSub: { color: Brand.textFaint, fontSize: 11.5 },

  track: {
    backgroundColor: Brand.track,
    overflow: 'hidden',
    width: '100%',
  },

  kv: { gap: 3, flexGrow: 1, flexBasis: '46%', minWidth: 130 },
  kvLabel: {
    color: Brand.textFaint,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  kvValue: { fontSize: 14, fontWeight: '600', lineHeight: 19 },

  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },

  empty: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xxl },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceStrong,
  },
  emptyTitle: { color: Brand.textDim, fontSize: 15, fontWeight: '700' },
  emptyMessage: {
    color: Brand.textFaint,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Brand.borderSubtle,
    marginVertical: Space.sm,
  },

  banner: {
    flexDirection: 'row',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  bannerIcon: { marginTop: 1 },
  bannerTitle: { fontSize: 13.5, fontWeight: '700' },
  bannerMessage: { color: Brand.textDim, fontSize: 13, lineHeight: 19, marginTop: 3 },
  bannerAction: { marginTop: Space.md, alignItems: 'flex-start' },
}));
