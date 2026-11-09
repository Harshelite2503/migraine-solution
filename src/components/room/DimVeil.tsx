// Auto-dim: 15 s after the last touch while sound plays, a night veil eases over everything at
// 0.94 in 1600 ms. The breathing ring and two faint landmarks (the lamp caption, the worse bar)
// stay visible through it so the person knows where they are, but nothing under the veil can be
// touched: the first touch anywhere only wakes the screen over 700 ms. The sound never stops here.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, z } from '../../lib/theme';
import { breath, lum, timing } from '../../lib/motion';
import { Control } from '../../lib/ui';
import { coverData, coverNoRing, LAMP_GLYPH, LampRing, lampFace, RING_DIM_PEAK, useCoverFocus, useGhostPlacement, type LampAnchor } from './Lamp';
import { WorseBar } from './WorseBar';

const VEIL = 0.94;
const LANDMARK = 0.28;
const noop = () => {};

export function DimVeil({ show, onWake, ring, anchor, lampSize, caption, worseBar = true }: {
  show: boolean;
  /** Any touch: brighten, and nothing else. */
  onWake: () => void;
  /** The lamp's ring opacity; drawn above the veil, capped at a 0.28 peak. */
  ring: SharedValue<number>;
  anchor: LampAnchor | null;
  lampSize: number;
  /** The lamp's caption while playing, repeated faintly in the same place. */
  caption: string;
  /** Repeat the pinned worse bar faintly (phone). On desktop the worse button is inline, under the veil. */
  worseBar?: boolean;
}) {
  const [mounted, setMounted] = useState(show);
  const veil = useSharedValue(0);
  const unmount = useCallback(() => setMounted(false), []);
  // Brightness eases, kept under reduced motion: they protect the eye.
  useEffect(() => {
    cancelAnimation(veil);
    if (show) { setMounted(true); veil.set(withTiming(VEIL, lum(timing.dim))); return; }
    veil.set(withTiming(0, lum(timing.wake), finished => { if (finished) scheduleOnRN(unmount); }));
  }, [show, veil, unmount]);

  const progress = useDerivedValue(() => veil.get() / VEIL);
  const ghost = useDerivedValue(() => Math.min(ring.get(), breath.hi) * (RING_DIM_PEAK / breath.hi) * progress.get());
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const landmarkStyle = useAnimatedStyle(() => ({ opacity: LANDMARK * progress.get() }));
  const { ref, onLayout, place, size } = useGhostPlacement(anchor, lampSize);
  // The room beneath is hidden from screen readers and keys while dimmed; focus lands on the veil itself.
  const veilRef = useCoverFocus(show, mounted);

  if (!mounted) return null;
  return (
    <View ref={ref} onLayout={onLayout} style={[StyleSheet.absoluteFill, styles.root]} pointerEvents={show ? 'auto' : 'none'}
      accessibilityViewIsModal={show} {...coverData}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.veil, veilStyle]}>
        <Pressable ref={veilRef as never} accessibilityRole="button" accessibilityLabel="Screen dimmed. Tap to brighten." onPress={onWake} style={[StyleSheet.absoluteFill, coverNoRing]} />
      </Animated.View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <View style={[place, { height: size }]}>
          <LampRing size={size} opacity={ghost} style={StyleSheet.absoluteFill} />
          {/* Same layout as the lamp's face, with the glyph left out, so the caption sits where it always is. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.face, landmarkStyle]}>
            <View style={styles.glyph} />
            <Control center>{caption}</Control>
          </Animated.View>
        </View>
        {worseBar ? (
          <Animated.View style={[StyleSheet.absoluteFill, landmarkStyle]}>
            <WorseBar show ghost onPress={noop} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: z.veil },
  veil: { backgroundColor: colors.night },
  face: { ...lampFace, justifyContent: 'center' },
  glyph: { width: LAMP_GLYPH, height: LAMP_GLYPH },
});
