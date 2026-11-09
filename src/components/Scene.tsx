// The room behind every screen: a static sky, a floor that darkens and rises with depth, one horizon
// hairline for the ocean. No grain, no drift, no detail layers. Colours never interpolate at runtime
// (Reanimated on web cannot animate gradient colours), so every change is the opacity of a stacked layer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, makeMutable, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, depthTint, horizonStep, tintMax, tintStep, z, type Depth, type SceneTexture } from '../lib/theme';
import { cross, ease, lum, timing, useReducedMotion } from '../lib/motion';

export type SceneProps = {
  /** Which room. `none` and unknown values read as `hush`. */
  texture?: SceneTexture | 'none' | string | null;
  /** Loudness: Full 0, Gentle 1, Hushed 2. Tints the floor and moves the horizon 24 pt per step. */
  depth?: Depth;
  /** While sound fades in the floor brightens 0.94 -> 1 and the horizon rises 24 pt over `fadeInMs`. */
  playing?: boolean;
  /** Softer adds one depth step. */
  softer?: boolean;
  /** "Making it worse" adds a permanent 0.10 tint for the visit. */
  worse?: boolean;
  /** The recipe's fade-in, `recipe.fadeInS * 1000`, so the room brightens at the rate the gain ramps. */
  fadeInMs?: number;
};

const FLOOR_TOP = 0.55;      // the horizon rests at 55% of the height
const FLOOR_OVERHANG = 96;   // the floor runs past the bottom edge so it can rise without showing a seam
const FLOOR_IDLE_OPACITY = 0.94;
const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

const asTexture = (t: SceneProps['texture']): SceneTexture => (t === 'rain' || t === 'ocean' || t === 'fan' ? t : 'hush');

/** A scene fading in over the ones beneath it. Its opacity starts at 0, so its first frame shows nothing. */
type Layer = { id: number; texture: SceneTexture; opacity: SharedValue<number> };
type Stack = { base: SceneTexture; layers: Layer[] };

export function Scene({ texture, depth = 1, playing = false, softer = false, worse = false, fadeInMs = timing.luminance }: SceneProps) {
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  const [height, setHeight] = useState(window.height);
  const onLayout = (e: LayoutChangeEvent) => { const h = e.nativeEvent.layout.height; if (h > 0 && h !== height) setHeight(h); };

  // Texture cross-fade: each new scene is a layer that mounts at opacity 0 and fades in over whatever is
  // showing. A second change mid-fade stacks another layer on top, so the half-faded blend beneath stays
  // exactly as it was: nothing jumps. When a layer is fully in, everything under it is dropped.
  const next = asTexture(texture);
  const [stack, setStack] = useState<Stack>({ base: next, layers: [] });
  const seq = useRef(0);
  const top = stack.layers.length ? stack.layers[stack.layers.length - 1].texture : stack.base;
  useEffect(() => {
    if (next === top) return;
    const layer: Layer = { id: ++seq.current, texture: next, opacity: makeMutable(0) };
    setStack(s => ({ ...s, layers: [...s.layers, layer] }));
  }, [next, top]);
  const settle = useCallback((id: number) => setStack(s => {
    const i = s.layers.findIndex(l => l.id === id);
    return i < 0 ? s : { base: s.layers[i].texture, layers: s.layers.slice(i + 1) };
  }), []);
  const started = useRef(new Set<number>());
  useEffect(() => {
    for (const l of stack.layers) {
      if (started.current.has(l.id)) continue;
      started.current.add(l.id);
      l.opacity.set(withTiming(1, cross(timing.crossfadeIn), finished => { if (finished) scheduleOnRN(settle, l.id); }));
    }
  }, [stack.layers, settle]);

  // Luminance: the tint, the floor's fade-in brightening. Both are kept under reduced motion.
  const tint = useSharedValue(Math.min(depthTint[depth] + (softer ? tintStep : 0) + (worse ? tintStep : 0), tintMax));
  const floorOpacity = useSharedValue(playing ? 1 : FLOOR_IDLE_OPACITY);
  useEffect(() => {
    cancelAnimation(tint);
    tint.set(withTiming(Math.min(depthTint[depth] + (softer ? tintStep : 0) + (worse ? tintStep : 0), tintMax), lum(timing.luminance)));
  }, [depth, softer, worse, tint]);
  useEffect(() => {
    cancelAnimation(floorOpacity);
    floorOpacity.set(playing ? withTiming(1, { duration: fadeInMs, easing: ease.linear }) : withTiming(FLOOR_IDLE_OPACITY, lum(timing.luminance)));
  }, [playing, fadeInMs, floorOpacity]);

  // Position: depth steps and the fade-in rise. Under reduced motion the floor never moves.
  const shift = useSharedValue(reduced ? 0 : -horizonStep * (depth + (softer ? 1 : 0)));
  const rise = useSharedValue(reduced || !playing ? 0 : -horizonStep);
  useEffect(() => {
    cancelAnimation(shift);
    shift.set(withTiming(reduced ? 0 : -horizonStep * (depth + (softer ? 1 : 0)), lum(timing.luminance)));
  }, [depth, softer, reduced, shift]);
  useEffect(() => {
    cancelAnimation(rise);
    if (reduced) { rise.set(withTiming(0, lum(timing.luminance))); return; }
    rise.set(playing ? withTiming(-horizonStep, { duration: fadeInMs, easing: ease.linear }) : withTiming(0, lum(timing.luminance)));
  }, [playing, fadeInMs, reduced, rise]);

  const floorStyle = useAnimatedStyle(() => ({ opacity: floorOpacity.get(), transform: [{ translateY: shift.get() + rise.get() }] }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: tint.get() }));

  const base = colors.scene[stack.base];
  // The horizon belongs to the ocean; it fades with the texture it belongs to, layer over layer.
  const horizonBase = base.horizon ? 1 : 0;
  const horizons = stack.layers.map(l => ({ on: colors.scene[l.texture].horizon ? 1 : 0, opacity: l.opacity }));
  const horizonStyle = useAnimatedStyle(() => {
    let h = horizonBase;
    for (const l of horizons) h += (l.on - h) * l.opacity.get();
    return { opacity: h };
  }, [horizonBase, horizons]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} onLayout={onLayout} pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <LinearGradient colors={[base.sky[0], base.sky[1]]} style={StyleSheet.absoluteFill} />
      {stack.layers.map(l => <FadeGradient key={l.id} opacity={l.opacity} colors={colors.scene[l.texture].sky} />)}
      <Animated.View style={[styles.floor, { top: height * FLOOR_TOP, height: height * (1 - FLOOR_TOP) + FLOOR_OVERHANG }, floorStyle]}>
        <LinearGradient colors={[base.floor[0], base.floor[1]]} style={StyleSheet.absoluteFill} />
        {stack.layers.map(l => <FadeGradient key={l.id} opacity={l.opacity} colors={colors.scene[l.texture].floor} />)}
        <AnimatedGradient colors={[colors.night, colors.black]} style={[StyleSheet.absoluteFill, tintStyle]} />
        <Animated.View style={[styles.horizon, horizonStyle]} />
      </Animated.View>
    </View>
  );
}

/** One gradient of a fading layer: sky or floor, both driven by the layer's one opacity. */
function FadeGradient({ opacity, colors: pair }: { opacity: SharedValue<number>; colors: readonly string[] }) {
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <AnimatedGradient colors={[pair[0], pair[1]]} style={[StyleSheet.absoluteFill, animated]} />;
}

const styles = StyleSheet.create({
  root: { zIndex: z.scene, overflow: 'hidden', backgroundColor: colors.night },
  floor: { position: 'absolute', left: 0, right: 0 },
  horizon: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: colors.hairlineLit },
});
