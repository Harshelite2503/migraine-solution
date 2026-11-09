// The lamp: the one bright thing in the room, and the one decision on the screen. A disc in the
// scene's floor colour with a 2 pt lamp ring whose opacity is the sound's own loudness curve: it
// brightens over exactly the recipe's fade-in, falls over the 3 s stop, and breathes in between.
// The ring value is owned by `useLampRing` so the veil and the dark screen can draw it too.
import { useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { colors, type SceneTexture } from '../../lib/theme';
import { breath, lum, timing, useReducedMotion } from '../../lib/motion';
import { Control, Ionicons, Press } from '../../lib/ui';
import { svgHidden } from '../Mark';

export const RING_IDLE = 0.35;
export const RING_LIT = 0.9;
/** Reduced motion: no breath, the ring rests at the breath's midpoint. */
export const RING_HELD = 0.32;
/** The ring's visible peak through the auto-dim veil. */
export const RING_DIM_PEAK = 0.28;
/** How long the ring takes to leave on the dark screen: after the black, so the lamp goes last. */
export const RING_LEAVE_MS = 1200;
const RING_WIDTH = 2;
const GLYPH = 40;
/** The inside of the lamp (glyph over caption), shared with the veil so its faint caption lands in the same spot. */
export const lampFace: ViewStyle = { alignItems: 'center', gap: 10, paddingHorizontal: 24 };
export const LAMP_GLYPH = GLYPH;
/** A ref to a native View (RN 0.88's View is a function component, so `View` itself is not the instance type). */
export type ViewRef = ComponentRef<typeof View>;

/**
 * The ring's opacity. Mount: 0 -> 0.35 over 900 ms (arrival). `sounding` (the gain ramp has started):
 * cancel, then 0.35 -> 0.9 linearly over the recipe's fade-in; once there, settle to the breath
 * (0.42 <-> 0.22, 10 s) or, under reduced motion, hold at 0.32. Off: back to 0.35 over 3000 ms, the
 * same length as `player.stop(3)`.
 */
export function useLampRing({ sounding, fadeInMs }: { sounding: boolean; fadeInMs: number }): SharedValue<number> {
  const reduced = useReducedMotion();
  const ring = useSharedValue(0);
  const arrived = useRef(false);
  useEffect(() => {
    cancelAnimation(ring);
    if (sounding) {
      const settle = reduced
        ? withTiming(RING_HELD, lum(timing.luminance))
        : withSequence(
            withTiming(breath.hi, lum(timing.luminance)),
            withRepeat(withSequence(
              withTiming(breath.lo, { duration: breath.outMs, easing: breath.easing }),
              withTiming(breath.hi, { duration: breath.inMs, easing: breath.easing }),
            ), -1, false),
          );
      ring.set(withSequence(withTiming(RING_LIT, { duration: fadeInMs, easing: Easing.linear }), settle));
      arrived.current = true;
      return;
    }
    // First render is the arrival (brightening, 900 ms); every later return is the glow falling with the sound.
    ring.set(withTiming(RING_IDLE, lum(arrived.current ? timing.glowFall : timing.darker)));
    arrived.current = true;
  }, [sounding, fadeInMs, reduced, ring]);
  return ring;
}

/** Just the ring, driven by a shared opacity. The veil and the dark screen draw this above themselves. */
export function LampRing({ size, opacity, style }: { size: number; opacity: SharedValue<number>; style?: StyleProp<ViewStyle> }) {
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style, animated]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} {...svgHidden}>
        <Circle cx={size / 2} cy={size / 2} r={size / 2 - RING_WIDTH / 2} stroke={colors.lamp} strokeWidth={RING_WIDTH} fill="none" />
      </Svg>
    </Animated.View>
  );
}

/**
 * For a full-screen cover (the dim veil, Dark screen): once it is up, move keyboard focus (web) or
 * screen-reader focus (native) onto it, so nothing beneath keeps focus while it is covered.
 */
export function useCoverFocus(show: boolean, mounted: boolean) {
  const ref = useRef<unknown>(null);
  useEffect(() => {
    if (!show || !mounted) return;
    const id = setTimeout(() => {
      const node = ref.current as { focus?: (o?: { preventScroll?: boolean }) => void } | null;
      if (!node) return;
      try {
        if (Platform.OS === 'web') node.focus?.({ preventScroll: true });
        else { const tag = findNodeHandle(node as never); if (tag) AccessibilityInfo.setAccessibilityFocus(tag); }
      } catch { /* focus is a courtesy */ }
    }, 50);
    return () => clearTimeout(id);
  }, [show, mounted]);
  return ref;
}
/** Marks a cover on web, so the content beneath may take focus back from it when it lifts. */
export const coverData = Platform.OS === 'web' ? { dataSet: { stillCover: '1' } } : {};
/** No focus ring on a cover: a lamp-coloured outline round the whole viewport would flash as it dims. Inline, so it beats the shell's rule. */
export const coverNoRing = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as ViewStyle | null;

export function Lamp({ size, scene, ring, playing, preparing, onPress, anchorRef, focusRef, onLayout }: {
  size: number;
  /** The room's scene; the disc takes its floor-bottom colour so it reads as part of the floor. */
  scene: SceneTexture;
  ring: SharedValue<number>;
  playing: boolean;
  preparing: boolean;
  onPress: () => void;
  /** Attached to the outer view so the room can measure where the lamp sits (for the veil's ghost ring). */
  anchorRef?: RefObject<ViewRef | null>;
  /** The pressable itself, so focus can return to it (the check-in sheet closing). */
  focusRef?: RefObject<unknown>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const label = preparing ? 'Getting ready' : playing ? 'Fade to silence' : 'Play my sound';
  const caption = preparing ? 'Getting ready…' : playing ? 'Tap to fade out' : 'Play my sound';
  const disc = colors.scene[scene].floor[1];
  return (
    <View ref={anchorRef} onLayout={onLayout} style={{ width: size, height: size, alignSelf: 'center' }}>
      {/* Play or stop: the stop still buzzes while sound plays. A large lit surface: no reduced-motion dim. */}
      <Press ref={focusRef} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: preparing }} onPress={onPress}
        haptic="always" largeSurface
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill} {...svgHidden}>
          <Circle cx={size / 2} cy={size / 2} r={size / 2 - RING_WIDTH} fill={disc} />
        </Svg>
        <LampRing size={size} opacity={ring} style={StyleSheet.absoluteFill} />
        <View style={lampFace}>
          <Ionicons name={playing ? 'pause' : 'play'} size={GLYPH} color={colors.lamp} style={{ marginLeft: playing ? 0 : 3 }} />
          <Control center>{caption}</Control>
        </View>
      </Press>
    </View>
  );
}

/** Where the lamp sits on screen, in window coordinates, so an overlay can draw its ring in the same place. */
export type LampAnchor = { x: number; y: number; size: number };

/**
 * For a full-screen overlay: a ref for its root and the absolute position of the lamp inside it.
 * Falls back to the centre of the window until both measurements exist.
 */
export function useGhostPlacement(anchor: LampAnchor | null, size: number) {
  const ref = useRef<ViewRef>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const window = useWindowDimensions();
  const onLayout = useCallback(() => {
    ref.current?.measureInWindow((x: number, y: number) => setOrigin({ x, y }));
  }, []);
  const place: ViewStyle = anchor && origin
    ? { position: 'absolute', left: anchor.x - origin.x, top: anchor.y - origin.y, width: anchor.size }
    : { position: 'absolute', left: (window.width - size) / 2, top: (window.height - size) / 2 - 40, width: size };
  return { ref, onLayout, place, size: anchor?.size ?? size };
}
