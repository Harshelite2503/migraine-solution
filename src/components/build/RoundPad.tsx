// One round pad of the A/B ritual. Its rim fills in lamp, linearly, across the clip while that version
// plays, then rests full. Once both have been heard the pad becomes the answer ("A felt calmer"), and the
// one chosen glows once. The rim and glow are decoration; the label and state carry the meaning.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { colors, space } from '../../lib/theme';
import { cross, ease, lum, timing, useReducedMotion } from '../../lib/motion';
import { Label, Press, Title, useMaterial } from '../../lib/ui';

export type PadState = 'idle' | 'playing' | 'played';

const PAD = 128;
const RIM = 3;
const R = (PAD - RIM) / 2;
const C = 2 * Math.PI * R;
const GLOW_IN = 400;
const GLOW_OUT = 700;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RoundPad({ letter, state, clipMs, answer, onPress, glow }: {
  letter: 'A' | 'B';
  state: PadState;
  /** How long this version plays, so the rim fills in step with it. */
  clipMs: number;
  /** Both versions heard: the pad is now the answer button. */
  answer: boolean;
  onPress: () => void;
  /** Bump to make the pad glow once (it was the one chosen). */
  glow: number;
}) {
  const reduced = useReducedMotion();
  const material = useMaterial();
  const fill = useSharedValue(state === 'idle' ? 0 : 1);    // how much of the rim is lit, 0..1
  const shown = useSharedValue(state === 'idle' ? 0 : 1);   // the lit rim's opacity, so a reset fades rather than unwinds
  const lit = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(fill); cancelAnimation(shown);
    if (state === 'idle') {
      shown.set(withTiming(0, cross(timing.crossfadeOut), done => { if (done) fill.set(0); }));
      return;
    }
    if (state === 'playing') {
      // A progress fill, not a move: under reduced motion it simply shows lit for the length of the clip.
      shown.set(withTiming(1, cross(timing.crossfadeIn)));
      if (reduced) { fill.set(1); return; }
      fill.set(0);
      fill.set(withTiming(1, { duration: clipMs, easing: ease.linear }));
      return;
    }
    shown.set(withTiming(1, cross(timing.crossfadeIn)));
    fill.set(withTiming(1, cross(timing.crossfadeIn)));
  }, [state, clipMs, reduced, fill, shown]);

  useEffect(() => {
    if (!glow) return;
    cancelAnimation(lit);
    lit.set(withSequence(withTiming(1, { duration: GLOW_IN, easing: ease.enter }), withTiming(0, lum(GLOW_OUT))));
  }, [glow, lit]);

  const rimProps = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - fill.get()) }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: lit.get() }));

  // A blank line rather than no line, so the pads never shift when the words arrive.
  const word = answer ? `${letter} felt calmer` : state === 'playing' ? 'Playing' : ' ';
  return (
    <View style={s.wrap}>
      <Press
        accessibilityRole="button" accessibilityLabel={answer ? `${letter} felt calmer` : `Sound ${letter}`}
        accessibilityHint={answer ? undefined : 'Becomes an answer once both have played'}
        accessibilityState={{ disabled: !answer, busy: state === 'playing' }}
        disabled={!answer} onPress={onPress}
        style={[s.pad, material.fill, answer && s.padAnswer, answer && material.selected]}>
        <Animated.View pointerEvents="none" style={[s.glow, glowStyle]} />
        <View pointerEvents="none" style={s.rim} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Svg width={PAD} height={PAD} viewBox={`0 0 ${PAD} ${PAD}`}>
            <Circle cx={PAD / 2} cy={PAD / 2} r={R} stroke={colors.hairlineLit} strokeWidth={RIM} fill="none" />
          </Svg>
        </View>
        <Animated.View pointerEvents="none" style={[s.rim, s.fromTop, rimStyle]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          <Svg width={PAD} height={PAD} viewBox={`0 0 ${PAD} ${PAD}`}>
            <AnimatedCircle cx={PAD / 2} cy={PAD / 2} r={R} stroke={colors.lamp} strokeWidth={RIM} fill="none"
              strokeLinecap="round" strokeDasharray={`${C} ${C}`} animatedProps={rimProps} />
          </Svg>
        </Animated.View>
        {/* Title type, not a heading: the pad's label already names it. */}
        <Title accessibilityRole="none" color={state === 'playing' ? colors.lamp : colors.ink}>{letter}</Title>
      </Press>
      <Label center color={answer ? colors.ink : colors.ink2} importantForAccessibility="no" accessibilityElementsHidden>{word}</Label>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.s, flexShrink: 1 },
  pad: { width: PAD, height: PAD, borderRadius: PAD / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.smoke },
  padAnswer: { backgroundColor: colors.smokePressed },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: PAD / 2, backgroundColor: colors.lampGlow },
  rim: { position: 'absolute', top: 0, left: 0, width: PAD, height: PAD },
  // The fill starts at twelve o'clock and runs clockwise.
  fromTop: { transform: [{ rotate: '-90deg' }] },
});
