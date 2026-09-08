import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { withAlpha } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

/* -------------------------------------------------------------------------- */
/* Bottom sheet                                                                */
/* -------------------------------------------------------------------------- */

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  accent: accentProp,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  accent?: string;
}) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.lg }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHead}>
              <View style={styles.flex}>
                <Text style={styles.sheetTitle}>{title}</Text>
                {!!subtitle && <Text style={styles.sheetSubtitle}>{subtitle}</Text>}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                hitSlop={10}
                style={styles.sheetClose}>
                <MaterialCommunityIcons name="close" size={19} color={Brand.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>

            {!!footer && <View style={[styles.sheetFooter, { borderTopColor: withAlpha(accent, 0.16) }]}>{footer}</View>}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirm dialog                                                              */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel,
  loading,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const styles = useStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.dialogRoot}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {!!message && <Text style={styles.dialogMessage}>{message}</Text>}
          <View style={styles.dialogActions}>
            <Button label="Cancel" variant="ghost" onPress={onCancel} style={styles.flex} />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={styles.flex}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Toast                                                                       */
/* -------------------------------------------------------------------------- */

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<{
  show: (message: string, tone?: ToastTone) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const Brand = useColors();
  const styles = useStyles();
  const [toast, setToast] = useState<ToastItem | null>(null);
  // Lazy useState, not useRef: the animated values are read while rendering.
  const [opacity] = useState(() => new Animated.Value(0));
  const [translate] = useState(() => new Animated.Value(24));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 24, duration: 160, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translate]);

  const show = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      counter.current += 1;
      setToast({ id: counter.current, message, tone });

      opacity.setValue(0);
      translate.setValue(24);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translate, { toValue: 0, useNativeDriver: true, friction: 9 }),
      ]).start();

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, tone === 'error' ? 4200 : 2600);
    },
    [hide, opacity, translate],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  const tone = toast?.tone ?? 'info';
  const color = tone === 'success' ? Brand.green : tone === 'error' ? Brand.red : Brand.blue;
  const icon =
    tone === 'success' ? 'check-circle' : tone === 'error' ? 'alert-circle' : 'information';

  return (
    <ToastContext.Provider value={value}>
      {children}
      {!!toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastWrap,
            { bottom: insets.bottom + 84, opacity, transform: [{ translateY: translate }] },
          ]}>
          <Pressable
            onPress={hide}
            style={[styles.toast, { borderColor: withAlpha(color, 0.4) }]}
            accessibilityRole="alert">
            <MaterialCommunityIcons name={icon} size={17} color={color} />
            <Text style={styles.toastText} numberOfLines={3}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const useStyles = makeStyles((Brand) => ({
  flex: { flex: 1 },

  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Brand.overlay,
  },
  sheetWrap: { maxHeight: '92%' },
  sheet: {
    backgroundColor: Brand.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.border,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.borderStrong,
    alignSelf: 'center',
    marginBottom: Space.md,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  sheetTitle: { color: Brand.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  sheetSubtitle: { color: Brand.textMuted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceStrong,
  },
  sheetScroll: { marginTop: Space.lg },
  // Enough room that the last field clears the footer and the nav bar.
  sheetContent: { gap: Space.lg, paddingBottom: Space.xxl * 2 },
  sheetFooter: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },

  dialogRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Brand.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: Brand.border,
    padding: Space.xl,
    gap: Space.md,
  },
  dialogTitle: { color: Brand.text, fontSize: 17, fontWeight: '700' },
  dialogMessage: { color: Brand.textMuted, fontSize: 13.5, lineHeight: 20 },
  dialogActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.sm },

  toastWrap: { position: 'absolute', left: Space.lg, right: Space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    backgroundColor: Brand.bgElevated,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    maxWidth: 460,
  },
  toastText: { color: Brand.text, fontSize: 13.5, flexShrink: 1, lineHeight: 18 },
}));
