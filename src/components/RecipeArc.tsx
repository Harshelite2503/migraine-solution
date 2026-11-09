// The Recipe Arc: a soft continuous arc around Listen on My sound, so the sound you shaped has a face.
// Space sets how far it reaches round the circle; Tone sets how quickly it fades from left to right;
// the top-end cutoff sets how far the bright end carries before it starts to fade. Hum shows nothing.
// It never exceeds 0.35 alpha, has no ticks, and is hidden from assistive tech: the dials carry the words.
// Shape changes cross-fade over 350 ms, the same beat as the preview's re-render, so sight and sound move together.
import { useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { recipeFor, type Profile } from '../lib/profile';
import { colors } from '../lib/theme';
import { lum, timing } from '../lib/motion';

const PEAK = 0.35;
const FLOOR = 0.08;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Shape = { d: string; x1: number; x2: number; reach: number; end: number };

function shapeOf(profile: Profile, size: number, stroke: number): Shape {
  const r = recipeFor(profile, 'normal').recipe as { width?: number; tiltDbPerOct?: number; cutoffHz?: number };
  const width = clamp(Number(r.width ?? 0.55), 0, 1);
  const tilt = clamp(Number(r.tiltDbPerOct ?? -6), -9, -3);
  const cutoff = clamp(Number(r.cutoffHz ?? 1800), 300, 6000);

  // Space: 90 degrees at the narrowest, 270 at the widest, centred on the top.
  const sweep = 90 + 180 * width;
  const R = (size - stroke) / 2 - 1;
  const c = size / 2;
  const at = (deg: number) => { const a = (deg * Math.PI) / 180; return [c + R * Math.sin(a), c - R * Math.cos(a)] as const; };
  const [ax, ay] = at(-sweep / 2);
  const [bx, by] = at(sweep / 2);
  const d = `M ${ax.toFixed(2)} ${ay.toFixed(2)} A ${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${bx.toFixed(2)} ${by.toFixed(2)}`;
  // The fade runs across the arc's own horizontal extent, so "left end to right end" holds at every sweep.
  const x1 = sweep >= 180 ? c - R : ax;
  const x2 = sweep >= 180 ? c + R : bx;

  // Tone: -9 dB/oct falls steeply to the floor, -3 is nearly flat.
  const steep = (-3 - tilt) / 6;
  const end = PEAK - (PEAK - FLOOR) * (0.1 + 0.9 * steep);
  // Cutoff, on a log scale: a brighter top end carries the peak further before it fades.
  const reach = 0.15 + 0.45 * clamp(Math.log(cutoff / 300) / Math.log(20), 0, 1);
  return { d, x1, x2, reach, end };
}

const same = (a: Shape, b: Shape) => a.d === b.d && a.reach === b.reach && a.end === b.end;

export function RecipeArc({ profile, size = 150, stroke = 3 }: { profile: Profile; size?: number; stroke?: number }) {
  const shape = useMemo(() => shapeOf(profile, size, stroke), [profile, size, stroke]);
  // Two layers: the new shape fades in over the old one as the old one fades out.
  const [slots, setSlots] = useState<[Shape, Shape]>([shape, shape]);
  const [front, setFront] = useState<0 | 1>(0);
  const op0 = useSharedValue(1);
  const op1 = useSharedValue(0);

  useEffect(() => {
    if (same(shape, slots[front])) return;
    const back = front === 0 ? 1 : 0;
    setSlots(prev => (back === 0 ? [shape, prev[1]] : [prev[0], shape]));
    setFront(back);
    // Keyed on the shape alone: the slots and the front are written only here.
  }, [shape]);

  useEffect(() => {
    cancelAnimation(op0); cancelAnimation(op1);
    op0.set(withTiming(front === 0 ? 1 : 0, lum(timing.arc)));
    op1.set(withTiming(front === 1 ? 1 : 0, lum(timing.arc)));
  }, [front, op0, op1]);

  const id = useId().replace(/[^A-Za-z0-9_-]/g, '');
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.center]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Layer shape={slots[0]} opacity={op0} size={size} stroke={stroke} id={`${id}a`} />
      <Layer shape={slots[1]} opacity={op1} size={size} stroke={stroke} id={`${id}b`} />
    </View>
  );
}

function Layer({ shape, opacity, size, stroke, id }: { shape: Shape; opacity: SharedValue<number>; size: number; stroke: number; id: string }) {
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={[s.layer, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={shape.x1} y1={0} x2={shape.x2} y2={0}>
            <Stop offset={0} stopColor={colors.lamp} stopOpacity={PEAK} />
            <Stop offset={shape.reach} stopColor={colors.lamp} stopOpacity={PEAK} />
            <Stop offset={1} stopColor={colors.lamp} stopOpacity={shape.end} />
          </LinearGradient>
        </Defs>
        <Path d={shape.d} stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute' },
});
