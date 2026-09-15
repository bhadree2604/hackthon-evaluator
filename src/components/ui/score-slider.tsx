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

/** Diameter of the draggable knob. The usable track is inset by half of it. */
const THUMB = 28;

/**
 * Whole marks from 0 to `max`, set by dragging the track or tapping a tick.
 *
 * `value` is null until the criterion has been touched, which is how the sheet
 * tells "not scored yet" apart from a deliberate 0. A mark can never go below
 * 0 or above `max`, so a negative score is not representable here, and
 * `scores.save` rejects anything outside that range on the server as well.
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
  /** True once the finger has actually moved, which is what claims the gesture. */
  const [sliding, setSliding] = useState(false);

  /**
   * The thumb's centre travels between THUMB/2 and width - THUMB/2, so it can
   * never hang outside the card at either end, and the two extremes land
   * exactly on 0 and `max`.
   */
  const usable = Math.max(1, width - THUMB);

  const apply = (event: GestureResponderEvent) => {
    if (disabled || width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.nativeEvent.locationX - THUMB / 2) / usable));
    const next = Math.round(ratio * max);
    /**
     * A drag fires dozens of events a second, and every one of them would
     * otherwise re-render all ten sliders on the sheet. There are only 11
     * possible marks, so publish a change only when the mark actually changes.
     */
    if (next !== value) onChange(next);
  };

  const filled = value ?? 0;
  const ratio = max > 0 ? filled / max : 0;
  const thumbCentre = THUMB / 2 + ratio * usable;

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
        onResponderGrant={apply}
        onResponderMove={(event) => {
          if (!sliding) setSliding(true);
          apply(event);
        }}
        onResponderRelease={() => setSliding(false)}
        onResponderTerminate={() => setSliding(false)}
        /**
         * Before the finger has moved, let the scroll view take the gesture so
         * the sheet still scrolls from anywhere. Once a slide has started,
         * refuse: having the list steal it mid-drag is what makes a slider
         * feel like it is fighting you.
         */
        onResponderTerminationRequest={() => !sliding}
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
        {/*
          Every child is pointer-transparent on purpose. A touchable child
          becomes the target of the touch, and `locationX` is then measured
          from that child's left edge instead of the track's: dragging the
          thumb would report ~14px however far along it was, so the mark
          collapsed to 0 and snapped back on the next event that happened to
          hit the track. Leave `pointerEvents="none"` alone.
        */}
        <View pointerEvents="none" style={[styles.track, { backgroundColor: Brand.track }]}>
          <View style={[styles.fill, { width: thumbCentre, backgroundColor: accent }]} />
        </View>

        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: thumbCentre - THUMB / 2,
              backgroundColor: value === null ? Brand.surfaceStrong : accent,
              borderColor: Brand.bg,
              transform: [{ scale: sliding ? 1.15 : 1 }],
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

const useStyles = makeStyles((Brand) => ({
  root: { gap: Space.sm },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  max: { color: Brand.textFaint, fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  hint: { color: Brand.textFaint, fontSize: 11.5 },

  // Tall enough to grab with a thumb without hunting for the track.
  touch: { height: 48, justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, marginHorizontal: 0, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
  },

  ticks: { flexDirection: 'row', justifyContent: 'space-between' },
  tick: { alignItems: 'center', gap: 3, minWidth: 14 },
  tickDot: { width: 4, height: 4, borderRadius: 2 },
  tickLabel: { color: Brand.textFaint, fontSize: 9.5, fontWeight: '700' },
}));
