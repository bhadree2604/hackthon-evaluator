import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextStyle,
} from 'react-native';

import { withAlpha } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  autoCapitalize = 'sentences',
  hint,
  error,
  multiline,
  icon,
  accent: accentProp,
  editable = true,
  autoFocus,
  onSubmitEditing,
  returnKeyType,
  maxLength,
  style,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  hint?: string;
  error?: string | null;
  multiline?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  accent?: string;
  editable?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go' | 'send';
  maxLength?: number;
  style?: TextStyle;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? withAlpha(Brand.red, 0.55)
    : focused
      ? withAlpha(accent, 0.5)
      : Brand.borderSubtle;

  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrap,
          { borderColor, backgroundColor: focused ? Brand.inputBgFocused : Brand.inputBg },
          multiline && styles.inputWrapMultiline,
          !editable && styles.disabled,
        ]}>
        {!!icon && (
          <MaterialCommunityIcons
            name={icon}
            size={17}
            color={focused ? accent : Brand.textFaint}
            style={styles.leadingIcon}
          />
        )}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Brand.textFaint}
          secureTextEntry={secure && !revealed}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={!secure}
          editable={editable}
          autoFocus={autoFocus}
          multiline={multiline}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          selectionColor={accent}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((r) => !r)}
            hitSlop={10}
            style={styles.trailing}>
            <MaterialCommunityIcons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={Brand.textFaint}
            />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = 'Search',
  accent: accentProp,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accent?: string;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  return (
    <View style={styles.search}>
      <MaterialCommunityIcons name="magnify" size={18} color={Brand.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Brand.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.searchInput}
        selectionColor={accent}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          hitSlop={10}>
          <MaterialCommunityIcons name="close-circle" size={17} color={Brand.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

/** Horizontal option picker used everywhere a native <select> would be. */
export function OptionPicker<T extends string | null>({
  label,
  options,
  value,
  onChange,
  accent: accentProp,
  hint,
}: {
  label?: string;
  options: { value: T; label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  hint?: string;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionRow}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                active && {
                  backgroundColor: withAlpha(accent, 0.15),
                  borderColor: withAlpha(accent, 0.45),
                },
                pressed && { opacity: 0.7 },
              ]}>
              {!!option.icon && (
                <MaterialCommunityIcons
                  name={option.icon}
                  size={13}
                  color={active ? accent : Brand.textMuted}
                />
              )}
              <Text style={[styles.optionText, { color: active ? accent : Brand.textMuted }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

/** Numeric stepper for rubric scores; keeps entry fast on a phone. */
export function ScoreStepper({
  value,
  max,
  onChange,
  accent: accentProp,
  step = 1,
}: {
  value: number | null;
  max: number;
  onChange: (value: number) => void;
  accent?: string;
  step?: number;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const current = value ?? 0;
  const set = (next: number) => onChange(Math.max(0, Math.min(max, Math.round(next * 10) / 10)));

  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease score"
        onPress={() => set(current - step)}
        disabled={value === null || current <= 0}
        style={({ pressed }) => [
          styles.stepperButton,
          (value === null || current <= 0) && styles.disabled,
          pressed && { opacity: 0.6 },
        ]}>
        <MaterialCommunityIcons name="minus" size={18} color={Brand.textDim} />
      </Pressable>

      <View style={styles.stepperValue}>
        <Text style={[styles.stepperNumber, { color: value === null ? Brand.textFaint : accent }]}>
          {value === null ? '-' : value}
        </Text>
        <Text style={styles.stepperMax}>/ {max}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase score"
        onPress={() => set(current + step)}
        disabled={current >= max}
        style={({ pressed }) => [
          styles.stepperButton,
          current >= max && styles.disabled,
          pressed && { opacity: 0.6 },
        ]}>
        <MaterialCommunityIcons name="plus" size={18} color={Brand.textDim} />
      </Pressable>
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  accent: accentProp,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  accent?: string;
  description?: string;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.75 }]}>
      <View style={styles.flex}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {!!description && <Text style={styles.hint}>{description}</Text>}
      </View>
      <View
        style={[
          styles.toggleTrack,
          {
            backgroundColor: value ? withAlpha(accent, 0.3) : Brand.track,
            borderColor: value ? withAlpha(accent, 0.5) : Brand.borderSubtle,
          },
        ]}>
        <View
          style={[
            styles.toggleThumb,
            {
              backgroundColor: value ? accent : Brand.textFaint,
              alignSelf: value ? 'flex-end' : 'flex-start',
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  field: { gap: 7 },
  label: {
    color: Brand.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingVertical: 10, minHeight: 96 },
  leadingIcon: { marginRight: 9 },
  trailing: { marginLeft: 8 },
  input: {
    flex: 1,
    color: Brand.text,
    fontSize: 15,
    paddingVertical: 10,
  },
  inputMultiline: { textAlignVertical: 'top', minHeight: 76 },
  disabled: { opacity: 0.5 },
  hint: { color: Brand.textFaint, fontSize: 11.5, lineHeight: 16 },
  error: { color: Brand.red, fontSize: 12, fontWeight: '600' },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.surfaceStrong,
  },
  searchInput: { flex: 1, color: Brand.text, fontSize: 14.5, paddingVertical: 0 },

  optionRow: { flexDirection: 'row', gap: Space.sm, paddingRight: Space.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.inputBg,
  },
  optionText: { fontSize: 12.5, fontWeight: '700' },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  stepperButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.borderSubtle,
    backgroundColor: Brand.surfaceStrong,
  },
  stepperValue: {
    minWidth: 74,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  stepperNumber: { fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  stepperMax: { color: Brand.textFaint, fontSize: 12, fontWeight: '600' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, paddingVertical: 4 },
  toggleLabel: { color: Brand.text, fontSize: 14.5, fontWeight: '600' },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth * 2,
    justifyContent: 'center',
  },
  toggleThumb: { width: 20, height: 20, borderRadius: 10 },
}));
