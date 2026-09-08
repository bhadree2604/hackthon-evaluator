import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/inputs';
import { withAlpha } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { sanitizeForCode128 } from '@/lib/code128';
import { makeStyles, useColors } from '@/lib/theme';

/**
 * Badge scanner.
 *
 * Reads the QR and the Code 128 barcode a team badge carries, both of which
 * hold the plain team code. Everything the camera cannot do — no permission,
 * a cracked lens, a badge left at the hotel — falls back to typing the code,
 * so the desk is never blocked by hardware.
 */

/** Formats the app prints. `ean13` is deliberately absent: it is not ours. */
const BARCODE_TYPES = ['qr', 'code128', 'code39'] as const;

/** How long the same code is ignored for after a hit, in milliseconds. */
const RESCAN_DELAY = 2200;

type ScannerProps = {
  visible: boolean;
  onClose: () => void;
  onCode: (code: string) => void;
  title?: string;
  subtitle?: string;
  accent?: string;
  /** Shows a working state while the caller looks the code up. */
  busy?: boolean;
};

/**
 * The body is mounted only while the sheet is open, so the torch, the typed
 * code and the rescan cooldown all start fresh on every scan rather than
 * needing to be reset.
 */
export function ScannerModal(props: ScannerProps) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={props.onClose}
      /* The viewfinder is always dark, whatever the app theme is doing. */
      presentationStyle="fullScreen">
      {props.visible && <ScannerBody {...props} />}
    </Modal>
  );
}

function ScannerBody({
  onClose,
  onCode,
  title = 'Scan a team badge',
  subtitle = 'Point the camera at the QR or the barcode.',
  accent: accentProp,
  busy,
}: ScannerProps) {
  const Brand = useColors();
  const accent = accentProp ?? Brand.cyan;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState('');
  const [typing, setTyping] = useState(false);

  const lastHit = useRef<{ code: string; at: number } | null>(null);
  const [sweep] = useState(() => new Animated.Value(0));

  const windowSize = Math.min(Math.min(width, height) * 0.72, 300);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [sweep]);

  const handle = useCallback(
    (raw: string) => {
      const code = sanitizeForCode128(raw);
      if (!code) return;

      // The camera fires continuously; one badge should only count once.
      const now = Date.now();
      const previous = lastHit.current;
      if (previous && previous.code === code && now - previous.at < RESCAN_DELAY) return;
      lastHit.current = { code, at: now };

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      onCode(code);
    },
    [onCode],
  );

  const granted = permission?.granted === true;
  const live = granted && !typing;

  return (
    <View style={styles.root}>
      {live && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={busy ? undefined : ({ data }) => handle(data)}
        />
      )}

      {/* Dimmed surround, cut out around the viewfinder. */}
      {live && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.shade, { height: (height - windowSize) / 2 }]} />
          <View style={styles.shadeRow}>
            <View style={[styles.shade, styles.flex]} />
            <View style={{ width: windowSize, height: windowSize }}>
              <Corner accent={accent} position="tl" />
              <Corner accent={accent} position="tr" />
              <Corner accent={accent} position="bl" />
              <Corner accent={accent} position="br" />
              <Animated.View
                style={[
                  styles.sweep,
                  {
                    backgroundColor: accent,
                    shadowColor: accent,
                    transform: [
                      {
                        translateY: sweep.interpolate({
                          inputRange: [0, 1],
                          outputRange: [6, windowSize - 6],
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
            <View style={[styles.shade, styles.flex]} />
          </View>
          <View style={[styles.shade, styles.flex]} />
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Space.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close scanner"
          onPress={onClose}
          hitSlop={12}
          style={styles.headerButton}>
          <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        {live ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}
            onPress={() => setTorch((on) => !on)}
            hitSlop={12}
            style={[styles.headerButton, torch && { backgroundColor: withAlpha(accent, 0.28) }]}>
            <MaterialCommunityIcons
              name={torch ? 'flashlight' : 'flashlight-off'}
              size={20}
              color={torch ? accent : '#ffffff'}
            />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {!granted && !typing && (
        <View style={styles.centre}>
          <View style={[styles.bigIcon, { borderColor: withAlpha(accent, 0.4) }]}>
            <MaterialCommunityIcons name="camera-outline" size={30} color={accent} />
          </View>
          <Text style={styles.stateTitle}>Camera access needed</Text>
          <Text style={styles.stateBody}>
            {permission?.canAskAgain === false
              ? 'Camera permission was turned off for this app. Turn it back on in Settings, or type the code instead.'
              : 'The scanner needs the camera to read a team badge.'}
          </Text>
          {permission?.canAskAgain !== false && (
            <Button
              label="Allow camera"
              icon="camera"
              accent={accent}
              onPress={() => {
                requestPermission().catch(() => {});
              }}
            />
          )}
        </View>
      )}

      {typing && (
        <View style={styles.centre}>
          <View style={[styles.bigIcon, { borderColor: withAlpha(accent, 0.4) }]}>
            <MaterialCommunityIcons name="keyboard-outline" size={30} color={accent} />
          </View>
          <Text style={styles.stateTitle}>Type the team code</Text>
          <Text style={styles.stateBody}>It is printed under the barcode on the badge.</Text>

          <View style={styles.manualField}>
            <TextField
              value={manual}
              onChangeText={(text) => setManual(text.toUpperCase())}
              placeholder="HF3-CATA-4383"
              autoCapitalize="characters"
              autoFocus
              accent={accent}
              returnKeyType="go"
              onSubmitEditing={() => handle(manual)}
            />
          </View>

          <View style={styles.manualActions}>
            <Button
              label="Back to camera"
              variant="ghost"
              icon="camera-outline"
              onPress={() => setTyping(false)}
              style={styles.flex}
            />
            <Button
              label="Look up"
              icon="magnify"
              accent={accent}
              loading={busy}
              disabled={manual.trim().length < 3}
              onPress={() => handle(manual)}
              style={styles.flex}
            />
          </View>
        </View>
      )}

      {!typing && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.lg }]}>
          {busy ? (
            <View style={styles.busyRow}>
              <MaterialCommunityIcons name="progress-clock" size={16} color={accent} />
              <Text style={styles.busyText}>Looking that team up</Text>
            </View>
          ) : (
            <Text style={styles.hint}>
              Hold the badge about 15 cm away and keep it inside the frame.
            </Text>
          )}
          <Button
            label="Enter the code by hand"
            variant="secondary"
            icon="keyboard-outline"
            accent={accent}
            onPress={() => setTyping(true)}
            full
          />
        </View>
      )}
    </View>
  );
}

/** One bracket of the viewfinder frame. */
function Corner({ accent, position }: { accent: string; position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const styles = useStyles();
  const top = position === 'tl' || position === 'tr';
  const left = position === 'tl' || position === 'bl';

  return (
    <View
      style={[
        styles.corner,
        {
          borderColor: accent,
          top: top ? 0 : undefined,
          bottom: top ? undefined : 0,
          left: left ? 0 : undefined,
          right: left ? undefined : 0,
          borderTopWidth: top ? 3 : 0,
          borderBottomWidth: top ? 0 : 3,
          borderLeftWidth: left ? 3 : 0,
          borderRightWidth: left ? 0 : 3,
          borderTopLeftRadius: position === 'tl' ? Radius.md : 0,
          borderTopRightRadius: position === 'tr' ? Radius.md : 0,
          borderBottomLeftRadius: position === 'bl' ? Radius.md : 0,
          borderBottomRightRadius: position === 'br' ? Radius.md : 0,
        },
      ]}
    />
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: '#05070d' },

  shade: { backgroundColor: 'rgba(3,5,10,0.72)' },
  shadeRow: { flexDirection: 'row' },
  corner: { position: 'absolute', width: 34, height: 34 },
  sweep: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 2,
    opacity: 0.9,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerText: { flex: 1, alignItems: 'center', gap: 3 },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
  },

  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
  },
  bigIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 3,
  },
  stateTitle: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  stateBody: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  manualField: { alignSelf: 'stretch', marginTop: Space.md },
  manualActions: { flexDirection: 'row', gap: Space.sm, alignSelf: 'stretch' },

  footer: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    gap: Space.md,
    backgroundColor: 'rgba(3,5,10,0.82)',
  },
  hint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  busyText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
}));
