// Three horizontal bars for "how it felt afterwards". The fills grow from the left once, over 500 ms,
// the first time the screen is focused with data in hand; under reduced motion they sit at their final
// width. Colour is never the only signal: every bar carries its word and its count.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '../../lib/theme';
import { ease, useReducedMotion } from '../../lib/motion';
import { Label } from '../../lib/ui';

export type BarRow = {
  key: string;
  /** The word on the left, e.g. "A bit easier". */
  label: string;
  count: number;
  /** Fill colour: `colors.moss` for easier, `colors.ink3` for the same, `colors.rose` for worse. */
  color: string;
};

export type BarsProps = {
  rows: BarRow[];
  /** False while the journal is still loading, so the reveal waits for real numbers instead of growing zeros. */
  ready?: boolean;
};

const REVEAL_MS = 500;

export function Bars({ rows, ready = true }: BarsProps) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...rows.map(r => r.count));

  // Reveal once: on the first focus that also has data. A later visit shows the bars already full.
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); }, []));
  const revealed = useRef(false);
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (revealed.current || !focused || !ready) return;
    revealed.current = true;
    cancelAnimation(progress);
    progress.set(reduced ? 1 : withTiming(1, { duration: REVEAL_MS, easing: ease.enter }));
  }, [focused, ready, reduced, progress]);
  // If reduced motion is switched on mid-reveal the bars simply finish where they belong.
  useEffect(() => { if (reduced) { cancelAnimation(progress); progress.set(1); } }, [reduced, progress]);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));

  return (
    <View style={styles.list}>
      {rows.map(r => (
        <View key={r.key} style={styles.row} accessible accessibilityRole="text" accessibilityLabel={`${r.label}: ${r.count}`}>
          <Label color={colors.ink} style={styles.word}>{r.label}</Label>
          <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {r.count > 0 ? (
              <Animated.View style={[styles.fill, { width: `${(r.count / max) * 100}%`, backgroundColor: r.color }, grow]} />
            ) : null}
          </View>
          <Label color={colors.ink} style={styles.count}>{r.count}</Label>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { width: 130 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.lampTrack, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, transformOrigin: 'left' },
  count: { minWidth: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
