import { useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';

import { withAlpha } from '@/components/ui/primitives';
import { Space } from '@/constants/brand';
import { makeStyles, useColors } from '@/lib/theme';

/**
 * Whole marks from 0 to `max`, set by dragging the track or tapping a tick.
 *
 * `value` is null until the criterion has been touched, which is how the sheet
 * tells "not scored yet" apart from a deliberate 0. A mark can never go below
 * 0 or above `max`, so a negative score is not representable here, and
 * `scores.save` rejects anything outside that range on the server as well.
 *
 * Built on the touch responder props rather than PanResponder so there is no
 * mutable state between renders at all: the track measures itself once, and
 * every touch is turned straight into a mark.
 */
export function ScoreSlider({
  value,
  max,
  onChange,
  accent,
  disabled = false,
}: {
  value: number | null;
  max: number;
  onChange: (value: number) => void;
  accent: string;
  disabled?: boolean;
}) {
  const Brand = useColors();
  const styles = useStyles();
  const [width, setWidth] = useState(0);

  /**
   * `locationX` is relative to the view holding the responder. The track has
   * no touchable children, so it is always the target and the reading stays
   * correct for the whole drag.
   */
  const handleTouch = (event: GestureResponderEvent) => {
    if (disabled || width <= 0) return;
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / width));
    onChange(Math.round(ratio * max));
  };

  const filled = value ?? 0;
  const ratio = max > 0 ? filled / max : 0;

  return (
    <View style={styles.root}>
      <View style={styles.readout}>
        <Text style={[styles.value, { color: value === null ? Brand.textFaint : accent }]}>
          {value === null ? '–' : value}
          <Text style={styles.max}> / {max}</Text>
        </Text>
        {value === null && <Text style={styles.hint}>Drag to score</Text>}
      </View>

      <View
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        /**
         * Let the scroll view take over on a vertical drag, so a thumb landing
         * on a slider can still scroll the sheet. A sideways drag stays here,
         * because a vertical scroll view never asks for those.
         */
        onResponderTerminationRequest={() => true}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        // Screen readers get the same control as a native slider.
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max, now: filled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (disabled) return;
          const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          onChange(Math.min(max, Math.max(0, filled + step)));
        }}
        style={styles.touch}>
        <View style={[styles.track, { backgroundColor: Brand.track }]}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: accent }]} />
        </View>

        <View
          style={[
            styles.thumb,
            {
              left: `${ratio * 100}%`,
              backgroundColor: value === null ? Brand.surfaceStrong : accent,
              borderColor: Brand.bg,
            },
          ]}
        />
      </View>

      {/* Whole-number ticks, so the scale reads without having to drag it. */}
      <View style={styles.ticks}>
        {Array.from({ length: max + 1 }, (_, mark) => (
          <Pressable
            key={mark}
            accessibilityRole="button"
            accessibilityLabel={`Score ${mark}`}
            disabled={disabled}
            onPress={() => onChange(mark)}
            hitSlop={8}
            style={styles.tick}>
            <View
              style={[
                styles.tickDot,
                {
                  backgroundColor:
                    value !== null && mark <= value
                      ? withAlpha(accent, 0.55)
                      : Brand.borderSubtle,
                },
              ]}
            />
            {mark % 5 === 0 && <Text style={styles.tickLabel}>{mark}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const THUMB = 26;

const useStyles = makeStyles((Brand) => ({
  root: { gap: Space.sm },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  max: { color: Brand.textFaint, fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  hint: { color: Brand.textFaint, fontSize: 11.5 },

  // Tall enough to grab with a thumb without hunting for the track.
  touch: { height: 44, justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    marginLeft: -THUMB / 2,
  },

  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { alignItems: 'center', gap: 3, minWidth: 14 },
  tickDot: { width: 4, height: 4, borderRadius: 2 },
  tickLabel: { color: Brand.textFaint, fontSize: 9.5, fontWeight: '700' },
}));
