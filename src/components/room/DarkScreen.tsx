// Dark screen: black, silent, one tap comes back. The black eases in over 900 ms and the lamp's
// ring leaves last (1200 ms), so the brightest thing is the last to go; the way back is 700 ms.
// A faint "Tap to come back" shows for three seconds the first time only.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, z } from '../../lib/theme';
import { lum, timing } from '../../lib/motion';
import { Caption, Fade } from '../../lib/ui';
import { coverData, coverNoRing, LampRing, RING_LEAVE_MS, useCoverFocus, useGhostPlacement, type LampAnchor } from './Lamp';

// Written here directly: storage.ts is part of the untouchable data layer.
const HINT_KEY = 'still.darkHintShown';
const HINT_MS = 3000;

export function DarkScreen({ show, onLeave, ring, anchor, lampSize }: {
  show: boolean;
  onLeave: () => void;
  ring: SharedValue<number>;
  anchor: LampAnchor | null;
  lampSize: number;
}) {
  const [mounted, setMounted] = useState(show);
  const [hint, setHint] = useState(false);
  const black = useSharedValue(0);
  const leave = useSharedValue(1);   // the ghost ring's own fade, 1 -> 0 after the black is in
  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    cancelAnimation(black); cancelAnimation(leave);
    if (show) {
      setMounted(true);
      black.set(withTiming(1, lum(timing.dark)));
      leave.set(1); leave.set(withTiming(0, lum(RING_LEAVE_MS)));
      return;
    }
    black.set(withTiming(0, lum(timing.undark), finished => { if (finished) scheduleOnRN(unmount); }));
  }, [show, black, leave, unmount]);

  // First time only: a 4.3:1 hint for three seconds, then never again.
  useEffect(() => {
    if (!show) { setHint(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    AsyncStorage.getItem(HINT_KEY).then(seen => {
      if (cancelled || seen === '1') return;
      setHint(true);
      AsyncStorage.setItem(HINT_KEY, '1').catch(() => {});
      timer = setTimeout(() => setHint(false), HINT_MS);
    }).catch(() => {});
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [show]);

  // The ghost ring only matters once the black hides the real one; weighting by the black keeps one ring visible, never two.
  const ghost = useDerivedValue(() => ring.get() * leave.get() * black.get());
  const blackStyle = useAnimatedStyle(() => ({ opacity: black.get() }));
  const { ref, onLayout, place, size } = useGhostPlacement(anchor, lampSize);
  // The room beneath is hidden from screen readers and keys; focus moves onto the black, the one button.
  const blackRef = useCoverFocus(show, mounted);

  if (!mounted) return null;
  return (
    <View ref={ref} onLayout={onLayout} style={[StyleSheet.absoluteFill, styles.root]} pointerEvents={show ? 'auto' : 'none'}
      accessibilityViewIsModal={show} {...coverData}>
      {show ? <StatusBar hidden /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, styles.black, blackStyle]}>
        <Pressable ref={blackRef as never} accessibilityRole="button" accessibilityLabel="Dark screen. Tap to come back." onPress={onLeave} style={[StyleSheet.absoluteFill, coverNoRing]} />
      </Animated.View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <LampRing size={size} opacity={ghost} style={place} />
        <Fade show={hint} style={styles.hint}><Caption color={colors.ink3} center>Tap to come back</Caption></Fade>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: z.dark },
  black: { backgroundColor: colors.black },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 48, alignItems: 'center' },
});
