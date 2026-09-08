import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { withAlpha } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

function tap() {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync().catch(() => {});
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  accent: accentProp,
  full,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  iconRight?: keyof typeof MaterialCommunityIcons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  accent?: string;
  full?: boolean;
  style?: ViewStyle;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const isDisabled = disabled || loading;
  const height = size === 'sm' ? 34 : size === 'lg' ? 52 : 44;
  const fontSize = size === 'sm' ? 12.5 : size === 'lg' ? 15.5 : 14;
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 19 : 16;

  const danger = variant === 'danger';
  const tone = danger ? Brand.red : accent;

  const background =
    variant === 'primary'
      ? tone
      : variant === 'secondary'
        ? withAlpha(tone, 0.13)
        : 'transparent';

  const borderColor =
    variant === 'ghost'
      ? Brand.border
      : variant === 'secondary'
        ? withAlpha(tone, 0.34)
        : 'transparent';

  const textColor =
    variant === 'primary' ? Brand.onAccent : variant === 'ghost' ? Brand.textDim : tone;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: background,
          borderColor,
          paddingHorizontal: size === 'sm' ? 12 : 18,
        },
        full && styles.full,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {!!icon && <MaterialCommunityIcons name={icon} size={iconSize} color={textColor} />}
          <Text style={[styles.label, { color: textColor, fontSize }]} numberOfLines={1}>
            {label}
          </Text>
          {!!iconRight && (
            <MaterialCommunityIcons name={iconRight} size={iconSize} color={textColor} />
          )}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color: colorProp,
  size = 20,
  background: backgroundProp,
  accessibilityLabel,
  disabled,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress?: () => void;
  color?: string;
  size?: number;
  background?: string;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const Brand = useColors();
  const color = colorProp ?? Brand.textDim;
  const background = backgroundProp ?? Brand.surfaceStrong;
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size + 18,
          height: size + 18,
          backgroundColor: background,
          opacity: disabled ? 0.4 : 1,
        },
        pressed && styles.pressed,
      ]}>
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  count?: number;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accent: accentProp,
  scrollable,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  scrollable?: boolean;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const items = options.map((option) => {
    const active = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => {
          tap();
          onChange(option.value);
        }}
        style={({ pressed }) => [
          styles.segment,
          active && { backgroundColor: withAlpha(accent, 0.16), borderColor: withAlpha(accent, 0.4) },
          pressed && styles.pressed,
        ]}>
        {!!option.icon && (
          <MaterialCommunityIcons
            name={option.icon}
            size={13}
            color={active ? accent : Brand.textMuted}
          />
        )}
        <Text
          style={[styles.segmentLabel, { color: active ? accent : Brand.textMuted }]}
          numberOfLines={1}>
          {option.label}
        </Text>
        {option.count !== undefined && (
          <View
            style={[
              styles.segmentCount,
              { backgroundColor: active ? withAlpha(accent, 0.22) : Brand.track },
            ]}>
            <Text style={[styles.segmentCountText, { color: active ? accent : Brand.textFaint }]}>
              {option.count}
            </Text>
          </View>
        )}
      </Pressable>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segmentScroll}>
        {items}
      </ScrollView>
    );
  }
  return <View style={styles.segmentRow}>{items}</View>;
}

const useStyles = makeStyles((Brand) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  full: { alignSelf: 'stretch' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.42 },
  label: { fontWeight: '700', letterSpacing: 0.2 },

  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
  },

  segmentRow: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  segmentScroll: { flexDirection: 'row', gap: Space.sm, paddingRight: Space.lg },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.inputBg,
  },
  segmentLabel: { fontSize: 12.5, fontWeight: '700' },
  segmentCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  segmentCountText: { fontSize: 10.5, fontWeight: '800' },
}));
