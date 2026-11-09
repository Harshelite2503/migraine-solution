// Springs are only for things a finger moves. Every luminance change is `withTiming` with
// `Easing.inOut(Easing.cubic)`, never a spring, because an overshoot in brightness is a flash.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { Easing, type WithTimingConfig } from 'react-native-reanimated';

export const spring = {           // Reanimated 4.7: withSpring(to, { duration, dampingRatio, velocity })
  settle: { duration: 400, dampingRatio: 1.0 },   // any UI retarget: tab pill, selected tile, segment
  press:  { duration: 180, dampingRatio: 1.0 },   // scale 1 -> 0.97 on touch-down, back on release
  sheet:  { duration: 450, dampingRatio: 1.0 },   // check-in sheet; velocity from the gesture, no bounce
  dial:   { duration: 320, dampingRatio: 0.82 },  // click-stop snap; the ONLY overshoot, because the finger carried momentum
} as const;

export const timing = {           // all withTiming + Easing.inOut(Easing.cubic) unless noted
  darker: 900,       // minimum for anything getting darker
  brighter: 700,     // minimum for anything getting brighter
  luminance: 1800,   // depth tint, Softer tint, 'worse' tint
  dim: 1600,         // auto-dim veil in
  wake: 700,         // veil out
  dark: 900,         // Dark screen to #000
  undark: 700,
  glowFall: 3000,    // matches player.stop(3)
  fadeMirror: null as null,  // = recipe.fadeInS * 1000, read at play time, linear easing to match the gain ramp
  crossfadeIn: 240,  // Easing.out(cubic)
  crossfadeOut: 160, // exits are ~70% of entrances
  status: 220,
  arc: 350,          // Recipe Arc retarget, same debounce as usePreview
  reduced: 200,      // what a translate or scale becomes under reduced motion
} as const;

export const breath = { lo: 0.22, hi: 0.42, inMs: 4500, outMs: 5500, easing: Easing.inOut(Easing.sin) }; // opacity ONLY, 6/min

export const ease = {
  luminance: Easing.inOut(Easing.cubic),  // every brightness change
  enter: Easing.out(Easing.cubic),        // cross-fades in
  exit: Easing.out(Easing.cubic),         // cross-fades out (shorter, same shape)
  linear: Easing.linear,                  // the fade mirror, matching the gain ramp
};

/** `withTiming` config for a brightness change: `withTiming(0.94, lum(timing.dim))`. */
export const lum = (duration: number): WithTimingConfig => ({ duration, easing: ease.luminance });
/** `withTiming` config for a small cross-fade: `withTiming(1, cross(timing.crossfadeIn))`. */
export const cross = (duration: number): WithTimingConfig => ({ duration, easing: ease.enter });

/**
 * Apple's momentum projection: where a flick would come to rest, in the same units as the velocity
 * (px/s in, px out). Add it to the current position, then snap to the nearest detent from there.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Rubber-band past a bound: the further over, the less the element follows. `dim` is the travel range. */
export function rubberband(over: number, dim: number, constant = 0.55): number {
  'worklet';
  return (over * constant * dim) / (dim + constant * Math.abs(over));
}

const webMedia = (query: string) => (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);

/** Subscribe to a media query on web, with the old `addListener` API as a fallback. */
function watchMedia(mq: MediaQueryList, onChange: (matches: boolean) => void): () => void {
  const fn = (e: MediaQueryListEvent) => onChange(e.matches);
  if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', fn); return () => mq.removeEventListener('change', fn); }
  mq.addListener(fn); return () => mq.removeListener(fn);
}

// Remembered across mounts so a screen that opens later starts with the right answer, not a flicker.
let reducedMotionCache: boolean | null = null;
let reducedTransparencyCache: boolean | null = null;

/**
 * True when the person asked for less motion. Native: AccessibilityInfo; web: prefers-reduced-motion.
 * Under it every translate and scale becomes a 200 ms opacity cross-fade. Brightness eases are kept.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => reducedMotionCache ?? webMedia('(prefers-reduced-motion: reduce)')?.matches ?? false);
  useEffect(() => {
    const update = (v: boolean) => { reducedMotionCache = v; setReduced(v); };
    const mq = webMedia('(prefers-reduced-motion: reduce)');
    if (mq) { update(mq.matches); return watchMedia(mq, update); }
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * True when materials should be solid: iOS reduce transparency, web prefers-reduced-transparency,
 * and always on Android, where blur is costly and uneven.
 */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => Platform.OS === 'android' || (reducedTransparencyCache ?? webMedia('(prefers-reduced-transparency: reduce)')?.matches ?? false));
  useEffect(() => {
    if (Platform.OS === 'android') return;
    const update = (v: boolean) => { reducedTransparencyCache = v; setReduced(v); };
    const mq = webMedia('(prefers-reduced-transparency: reduce)');
    if (mq) { update(mq.matches); return watchMedia(mq, update); }
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(update).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', update);
    return () => sub.remove();
  }, []);
  return reduced;
}
