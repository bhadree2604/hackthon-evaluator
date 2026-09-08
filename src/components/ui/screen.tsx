import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, Text, View, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Space } from '@/constants/brand';
import { makeStyles, useColors, useNeutralGradient } from '@/lib/theme';

type ScreenProps = {
  children: ReactNode;
  /** Three-stop backdrop; defaults to the neutral app gradient. */
  gradient?: [string, string, string];
  scroll?: boolean;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Extra bottom padding so content clears a tab bar. */
  bottomInset?: number;
  keyboardAware?: boolean;
};

export function Screen({
  children,
  gradient,
  scroll = true,
  contentStyle,
  refreshing,
  onRefresh,
  bottomInset = 0,
  keyboardAware = true,
}: ScreenProps) {
  const Brand = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const neutral = useNeutralGradient();
  const colors = gradient ?? neutral;

  const padding = {
    paddingTop: insets.top + Space.md,
    paddingBottom: insets.bottom + bottomInset + Space.xxl,
  };

  const body = scroll ? (
    <KeyboardAwareScrollView
      /* Lifts whatever is focused clear of the keyboard, both platforms. */
      bottomOffset={Space.xxl}
      style={styles.flex}
      contentContainerStyle={[styles.content, padding, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={Brand.cyan}
            colors={[Brand.cyan]}
            progressBackgroundColor={Brand.bgElevated}
          />
        ) : undefined
      }>
      {children}
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.flex, styles.content, padding, contentStyle]}>{children}</View>
  );

  return (
    <LinearGradient colors={colors} style={styles.flex} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}>
      {body}
    </LinearGradient>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function ScreenLoading({ label = 'Loading' }: { label?: string }) {
  const Brand = useColors();
  const styles = useStyles();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={Brand.cyan} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: Space.lg,
    gap: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  eyebrow: {
    color: Brand.cyan,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    color: Brand.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Brand.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  loading: {
    paddingVertical: Space.xxl * 2,
    alignItems: 'center',
    gap: Space.md,
  },
  loadingText: {
    color: Brand.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: Radius.lg,
  },
}));
