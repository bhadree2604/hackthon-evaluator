import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Rect } from 'react-native-svg';

import { useToast } from '@/components/ui/overlays';
import { Card } from '@/components/ui/primitives';
import { Radius, Space } from '@/constants/brand';
import { encodeCode128 } from '@/lib/code128';
import { makeStyles, useColors } from '@/lib/theme';

/**
 * A team's badge: the same team code as a QR and as a Code 128 barcode.
 *
 * Both are drawn black on white whatever the app theme is. A scanner reads
 * reflected contrast, and an inverted code is a coin flip across handheld
 * readers, so the panel stays white even in dark mode.
 */

const QUIET_ZONE = 10;

export function TeamQr({ code, size = 190 }: { code: string; size?: number }) {
  const styles = useStyles();
  const value = code.trim().toUpperCase();

  return (
    <View style={[styles.paper, { padding: Space.md }]}>
      <QRCode
        value={value || 'HF3'}
        size={size}
        color="#000000"
        backgroundColor="#ffffff"
        quietZone={QUIET_ZONE}
        /**
         * Quartile: a badge picks up fingerprints and lanyard creases, and
         * this still scans with a quarter of the symbol damaged.
         */
        ecl="Q"
      />
    </View>
  );
}

export function TeamBarcode({ code, height = 64 }: { code: string; height?: number }) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const { widths, modules, text } = encodeCode128(code);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (Math.abs(next - width) > 1) setWidth(next);
  };

  // A quiet zone of 10 modules each side is what the spec asks for.
  const totalModules = modules + QUIET_ZONE * 2;
  const moduleWidth = width > 0 && totalModules > 0 ? width / totalModules : 0;

  let x = QUIET_ZONE * moduleWidth;
  const bars: { x: number; width: number }[] = [];
  widths.forEach((moduleCount, index) => {
    const barWidth = moduleCount * moduleWidth;
    // Even indexes are bars, odd are spaces.
    if (index % 2 === 0) bars.push({ x, width: barWidth });
    x += barWidth;
  });

  return (
    <View style={styles.paper} onLayout={onLayout}>
      {moduleWidth > 0 && (
        <Svg width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
          {bars.map((bar, index) => (
            <Rect
              key={index}
              x={bar.x}
              y={0}
              width={bar.width}
              height={height}
              fill="#000000"
            />
          ))}
        </Svg>
      )}
      <Text style={styles.barcodeText}>{text}</Text>
    </View>
  );
}

/**
 * The full badge. `compact` drops the barcode, which is what the team cards
 * and the participant home screen use.
 */
export function TeamBadge({
  code,
  teamName,
  caption,
  compact,
  qrSize = 190,
}: {
  code: string;
  teamName?: string;
  caption?: string;
  compact?: boolean;
  qrSize?: number;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const toast = useToast();

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    toast.show(`${code} copied`, 'success');
  };

  return (
    <Card style={styles.badge}>
      <TeamQr code={code} size={qrSize} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy team code ${code}`}
        onPress={copy}
        style={({ pressed }) => [styles.codeRow, pressed && styles.pressed]}>
        <Text style={styles.code}>{code}</Text>
        <MaterialCommunityIcons name="content-copy" size={15} color={Brand.textFaint} />
      </Pressable>

      {!!teamName && <Text style={styles.teamName}>{teamName}</Text>}

      {!compact && <TeamBarcode code={code} />}

      <Text style={styles.caption}>
        {caption ?? 'Show this to an evaluator or coordinator to be scanned.'}
      </Text>
    </Card>
  );
}

const useStyles = makeStyles((Brand) => ({
  badge: { alignItems: 'center', gap: Space.md },
  paper: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.md,
    padding: Space.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  barcodeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 4,
  },

  codeRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  code: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  pressed: { opacity: 0.6 },
  teamName: { color: Brand.textDim, fontSize: 14.5, fontWeight: '600', marginTop: -4 },
  caption: {
    color: Brand.textFaint,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: 260,
  },
}));
