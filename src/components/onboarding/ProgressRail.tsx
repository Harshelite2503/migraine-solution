// The onboarding progress rail: a 2 px hairline cut into four segments. Segments up to the current
// pane fill with the lamp, growing from the left on a critically damped spring (a transform, never a
// luminance ramp); under reduced motion they fade in place instead.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { colors } from '../../lib/theme';
import { ease, spring, timing, useReducedMotion } from '../../lib/motion';

export function ProgressRail({ step, total = 4 }: { step: number; total?: number }) {
  const reduced = useReducedMotion();
  return (
    <View style={styles.rail} accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of ${total}`}
      accessibilityValue={{ min: 0, max: total, now: step + 1 }}>
      {Array.from({ length: total }, (_, i) => <Segment key={i} on={i <= step} reduced={reduced} />)}
    </View>
  );
}

function Segment({ on, reduced }: { on: boolean; reduced: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    cancelAnimation(v);
    v.set(reduced ? withTiming(on ? 1 : 0, { duration: timing.reduced, easing: ease.enter }) : withSpring(on ? 1 : 0, spring.settle));
  }, [on, reduced, v]);
  const fill = useAnimatedStyle(() => (reduced
    ? { opacity: v.get(), transform: [{ scaleX: 1 }] }
    : { opacity: 1, transform: [{ scaleX: v.get() }] }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { flex: 1, maxWidth: 168, flexDirection: 'row', gap: 6, alignItems: 'center', marginHorizontal: 16 },
  track: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.lamp, transformOrigin: 'left' },
});
