// A rotary knob with click-stops, like the ones on a synth. Drag up or right to turn it up, down or
// left to turn it down; the indicator follows the finger 1:1 and clicks at each stop. A tap steps to
// the next setting. On release it springs onto the stop with the finger's own momentum. Screen readers
// adjust it with increment/decrement, and arrow keys do the same on the web.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors } from '../lib/theme';
import { ease, rubberband, spring, timing, useReducedMotion } from '../lib/motion';
import { Control, Eyebrow, Label, tick, useMaterial } from '../lib/ui';

const SWEEP = 270;           // degrees from the first stop to the last
const PX_PER_STOP = 26;      // how far to drag for one click
const MAX_SPIN = 1440;       // deg/s; a wild flick still lands calmly
const SNAP_REDUCED = 150;    // under reduced motion the knob still turns 1:1, then eases onto the stop

const web = Platform.OS === 'web';

export function Dial({ label, stops, value, onChange, onRelease, size = 112, disabled }: {
  label: string;
  stops: string[];                       // a short word for each click-stop, low to high
  value: number;                         // index into stops
  onChange: (index: number) => void;     // every click while turning
  onRelease?: (index: number) => void;   // once, when the knob is let go (or tapped)
  size?: number;
  disabled?: boolean;
}) {
  const n = stops.length;
  const per = n > 1 ? SWEEP / (n - 1) : 0;
  const angleOf = useCallback((i: number) => { 'worklet'; return -SWEEP / 2 + i * per; }, [per]);
  const reduced = useReducedMotion();

  const angle = useSharedValue(angleOf(value));   // where the indicator points, degrees
  const current = useSharedValue(value);          // the stop the knob is on (or heading to)
  const start = useSharedValue(value);
  const dragging = useSharedValue(false);
  const squeeze = useSharedValue(1);

  // The latest handlers, read on the JS side so the gesture never holds a stale closure.
  const handlers = useRef({ onChange, onRelease });
  handlers.current = { onChange, onRelease };
  const crossed = useCallback((i: number) => { tick(); handlers.current.onChange(i); }, []);
  const released = useCallback((i: number) => { handlers.current.onRelease?.(i); }, []);
  const tapped = useCallback((i: number) => { tick(); handlers.current.onChange(i); handlers.current.onRelease?.(i); }, []);

  // A value from outside (a reload, a screen reader step) turns the knob. A value the gesture just set is already there.
  const lastN = useRef(n);
  useEffect(() => {
    const resized = lastN.current !== n;
    lastN.current = n;
    if (dragging.get()) return;
    if (!resized && current.get() === value) return;
    current.set(value);
    cancelAnimation(angle);
    angle.set(reduced ? withTiming(angleOf(value), { duration: SNAP_REDUCED, easing: ease.enter }) : withSpring(angleOf(value), spring.dial));
  }, [value, n, reduced, angleOf, angle, current, dragging]);

  const gesture = useMemo(() => {
    const lo = -SWEEP / 2;
    const hi = SWEEP / 2;
    const give = Math.max(12, Math.min(per, 40));   // how far past an end stop the knob will stretch

    const pan = Gesture.Pan()
      .enabled(!disabled && n > 1)
      .minDistance(6)
      .onBegin(() => {
        cancelAnimation(squeeze);
        squeeze.set(reduced ? withTiming(0.85, { duration: timing.reduced, easing: ease.enter }) : withSpring(0.95, spring.press));
      })
      .onStart(() => {
        cancelAnimation(angle);
        dragging.set(true);
        start.set(current.get());
      })
      .onUpdate(e => {
        const travel = -e.translationY + e.translationX;
        const raw = angleOf(start.get()) + (travel / PX_PER_STOP) * per;
        angle.set(raw < lo ? lo + rubberband(raw - lo, give) : raw > hi ? hi + rubberband(raw - hi, give) : raw);
        const stop = Math.max(0, Math.min(n - 1, start.get() + Math.round(travel / PX_PER_STOP)));
        if (stop !== current.get()) { current.set(stop); scheduleOnRN(crossed, stop); }
      })
      .onEnd(e => {
        const spin = ((-e.velocityY + e.velocityX) / PX_PER_STOP) * per;
        const velocity = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, spin));
        const to = angleOf(current.get());
        angle.set(reduced ? withTiming(to, { duration: SNAP_REDUCED, easing: ease.enter }) : withSpring(to, { ...spring.dial, velocity }));
        dragging.set(false);
        scheduleOnRN(released, current.get());
      })
      .onFinalize(() => {
        cancelAnimation(squeeze);
        squeeze.set(reduced ? withTiming(1, { duration: timing.reduced, easing: ease.enter }) : withSpring(1, spring.press));
      });

    // A tap without movement steps one stop, wrapping round at the end, as it always has.
    const tap = Gesture.Tap()
      .enabled(!disabled && n > 0)
      .maxDistance(6)
      .maxDuration(2000)
      .onEnd((_e, success) => {
        if (!success) return;
        const next = (current.get() + 1) % n;
        current.set(next);
        cancelAnimation(angle);
        angle.set(reduced ? withTiming(angleOf(next), { duration: SNAP_REDUCED, easing: ease.enter }) : withSpring(angleOf(next), spring.dial));
        scheduleOnRN(tapped, next);
      });

    return Gesture.Exclusive(pan, tap);
  }, [disabled, n, per, reduced, angleOf, angle, current, start, dragging, squeeze, crossed, released, tapped]);

  // Screen-reader actions and arrow keys: one stop at a time, clamped at the ends (no wrap). Returns
  // whether the knob moved. A screen-reader step is a whole gesture, so it releases at once.
  const step = (to: number, release = true) => {
    if (disabled) return false;
    const next = Math.max(0, Math.min(n - 1, to));
    const moved = next !== value;
    if (moved) {
      current.set(next);
      cancelAnimation(angle);
      angle.set(reduced ? withTiming(angleOf(next), { duration: SNAP_REDUCED, easing: ease.enter }) : withSpring(angleOf(next), spring.dial));
      tick();
      handlers.current.onChange(next);
    }
    if (release) handlers.current.onRelease?.(next);
    return moved;
  };

  // A held arrow key auto-repeats; it turns the knob stop by stop but releases once, on keyup, and only
  // if it moved, as a drag does. Otherwise every repeat would save the profile, even at the end stop.
  const keyMoved = useRef(false);
  const [ring, setRing] = useState(false);
  const keys = web ? {
    focusable: !disabled,
    tabIndex: disabled ? -1 : 0,
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      const to = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? value + 1
        : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? value - 1
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
      if (to == null) return;
      e.preventDefault();
      if (step(to, false)) keyMoved.current = true;
    },
    onKeyUp: () => {
      if (!keyMoved.current) return;
      keyMoved.current = false;
      handlers.current.onRelease?.(current.get());
    },
    // The ring is for keyboards only: a click focuses the knob too, and should not draw it.
    onFocus: (e: { target?: unknown }) => {
      const el = e.target as { matches?: (q: string) => boolean } | undefined;
      try { setRing(!!el?.matches?.(':focus-visible')); } catch { setRing(true); }
    },
    onBlur: () => setRing(false),
  } : null;

  const material = useMaterial();
  const indicator = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
  const press = useAnimatedStyle(() => (reduced ? { opacity: squeeze.get() } : { transform: [{ scale: squeeze.get() }] }));

  const orbit = size / 2 + 10;
  const box = size + 34;
  const inner = size - 18;
  const Word = size > 150 ? Control : Label;

  return (
    <View style={[s.wrap, disabled && s.disabled]}>
      <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
        {/* The ring of lights, lit up to the current setting. Decoration: the value is read out as text. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          {stops.map((_, i) => {
            const a = (angleOf(i) * Math.PI) / 180;
            const lit = i <= value;
            const dot = i === value ? 7 : 5;
            return (
              <View key={i} style={{
                position: 'absolute', width: dot, height: dot, borderRadius: dot / 2,
                left: box / 2 + orbit * Math.sin(a) - dot / 2, top: box / 2 - orbit * Math.cos(a) - dot / 2,
                backgroundColor: lit ? colors.lamp : colors.hairlineLit,
                opacity: lit && i !== value ? 0.55 : 1,
              }} />
            );
          })}
        </View>
        <GestureDetector gesture={gesture}>
          <Animated.View
            accessible accessibilityRole="adjustable" accessibilityLabel={label}
            accessibilityValue={{ text: stops[value] }}
            accessibilityState={{ disabled: !!disabled }}
            // react-native-web reads the aria-* forms (it ignores the accessibilityValue object); native reads both.
            aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={value} aria-valuetext={stops[value]} aria-disabled={!!disabled}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={e => step(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
            {...(keys as object)}
            style={[
              s.knob, material.fill, { width: size, height: size, borderRadius: size / 2 },
              web ? (knobWeb(disabled) as ViewStyle) : null,
              ring ? (focusRing as ViewStyle) : null,
              press,
            ]}>
            <View pointerEvents="none" style={[s.inner, { width: inner, height: inner, borderRadius: inner / 2 }]} />
            <Animated.View pointerEvents="none" style={[s.spinner, { width: size, height: size }, indicator]}>
              <View style={[s.indicator, { left: size / 2 - 2, height: size * 0.2 }]} />
            </Animated.View>
            <Word color={colors.ink} center numberOfLines={1} maxFontSizeMultiplier={1.4} style={s.word}>{stops[value]}</Word>
          </Animated.View>
        </GestureDetector>
      </View>
      {/* The knob already carries this name; read once, not twice. */}
      <Eyebrow accessibilityElementsHidden importantForAccessibility="no" aria-hidden>{label}</Eyebrow>
    </View>
  );
}

// Web only: the knob owns its touches (no page scroll while turning) and never selects text.
const knobWeb = (disabled?: boolean) => ({ touchAction: 'none', cursor: disabled ? 'default' : 'grab', userSelect: 'none', outlineStyle: 'none' });
const focusRing = { outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.focusRing, outlineOffset: 3 };

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  disabled: { opacity: 0.38 },
  knob: { backgroundColor: colors.smoke, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  inner: { position: 'absolute', borderWidth: 1, borderColor: colors.hairline },
  spinner: { position: 'absolute' },
  indicator: { position: 'absolute', top: 10, width: 4, borderRadius: 2, backgroundColor: colors.lamp },
  word: { paddingHorizontal: 12 },
});
