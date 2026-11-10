// First-run setup: three taps and one dial, about 30 seconds. A full-screen overlay over a live
// Scene (rain until a texture is chosen), so the room is already there when the overlay lifts.
// Every step can be skipped, and the sound plays while you choose, so people decide by ear.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Profile } from '../lib/profile';
import { colors, sceneFor, z, type SceneTexture } from '../lib/theme';
import { cross, ease, spring, timing, useReducedMotion } from '../lib/motion';
import { useAppFonts } from '../lib/fonts';
import { Control, Ionicons, Press, useGutter, ScrollLockScope } from '../lib/ui';
import { track } from '../lib/activity';
import { Scene } from './Scene';
import { usePreview, withHardest, type Hardest } from './Studio';
import { ProgressRail } from './onboarding/ProgressRail';
import { DialPane, HardestPane, TexturePane, WelcomePane } from './onboarding/Panes';

const PANES = 4;
const RISE = 12;          // the incoming pane settles up by this much
const ADVANCE_MS = 260;   // let the chosen tile show its check before pane 1 moves on
const LEAVE_MS = 500;     // the overlay lifts to reveal the lamp already in place

export function Onboarding({ profile, onChange, onSaved, onDone }: {
  profile: Profile; onChange: (p: Profile) => void;
  /** The moment setup ends (saved or skipped), before the fade: record it then, not after an animation that may never finish. */
  onSaved?: () => void;
  /** Once the overlay has faded away. */
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [hardest, setHardest] = useState<Hardest | null>(null);
  const [leaving, setLeaving] = useState(false);
  const preview = usePreview();
  const gutter = useGutter();
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const veil = useSharedValue(1);
  // Text stays invisible until the bundled fonts resolve, then crosses in; the Scene paints at once.
  const { ready } = useAppFonts();
  const ink = useSharedValue(ready ? 1 : 0);
  useEffect(() => { if (ready) ink.set(withTiming(1, cross(timing.crossfadeIn))); }, [ready, ink]);

  useEffect(() => () => { if (advance.current) clearTimeout(advance.current); }, []);

  const update = (p: Profile) => { onChange(p); preview.update(p); };
  const go = (n: number) => { track('onboarding_step', { step: n }); setStep(n); };
  const leave = useCallback(() => done.current(), []);
  // Stop the preview, then the haptic (nothing buzzes while sound plays), then lift the overlay.
  const finish = (how: 'done' | 'skipped') => {
    if (left.current) return;
    left.current = true;
    preview.stop();
    track('onboarding_done', { how, step });
    onSaved?.();
    if (how === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setLeaving(true);
    cancelAnimation(veil);
    veil.set(withTiming(0, { duration: LEAVE_MS, easing: ease.exit }, finished => { if (finished) scheduleOnRN(leave); }));
  };

  const pickHardest = (h: Hardest) => {
    setHardest(h);
    update(withHardest(profile, h));
    if (advance.current) clearTimeout(advance.current);
    advance.current = setTimeout(() => go(2), ADVANCE_MS);
  };
  const pickTexture = (t: NonNullable<Profile['intake']['texture']>) => {
    const next = { ...profile, intake: { ...profile.intake, texture: t } };
    onChange(next);
    if (preview.on) preview.update(next); else preview.start(next);
  };

  const renderPane = (n: number): ReactNode => {
    switch (n) {
      case 0: return <WelcomePane onStart={() => go(1)} onSkip={() => finish('skipped')} />;
      case 1: return <HardestPane value={hardest} onPick={pickHardest} onContinue={() => { if (!hardest) update(withHardest(profile, 'unsure')); go(2); }} />;
      case 2: return <TexturePane profile={profile} preview={preview} onPick={pickTexture} onContinue={() => { if (!preview.on) preview.start(profile); go(3); }} />;
      default: return <DialPane profile={profile} preview={preview} onChange={update} onSave={() => finish('done')} />;
    }
  };

  // The room shows rain until a texture is chosen; Scene cross-fades the change itself.
  const scene: SceneTexture = profile.intake.texture ? sceneFor(profile.intake.texture) : 'rain';
  const fade = useAnimatedStyle(() => ({ opacity: veil.get() }));
  const fontFade = useAnimatedStyle(() => ({ opacity: ink.get() }));

  return (
    // While it fades it still blocks the room beneath (a tap there would start the lamp mid-fade), but
    // its own controls are already done: box-only takes the touch and gives it to nothing.
    <Animated.View style={[styles.root, fade]} pointerEvents={leaving ? 'box-only' : 'auto'}>
      <Scene texture={scene} depth={1} />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <Animated.View style={[styles.column, { paddingHorizontal: gutter }, fontFade]}>
          <View style={styles.top}>
            {step > 0 ? (
              <Press accessibilityLabel="Back" hitSlop={12} onPress={() => go(step - 1)} style={styles.back}>
                <Ionicons name="chevron-back" size={24} color={colors.ink2} />
              </Press>
            ) : <View style={styles.back} />}
            <ProgressRail step={step} total={PANES} />
            <Press accessibilityLabel="Skip setup" hitSlop={12} onPress={() => finish('skipped')} style={styles.skip}>
              <Control color={colors.ink2}>Skip</Control>
            </Press>
          </View>
          <PaneStage step={step} render={renderPane} />
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------------------------
// PaneStage: cross-fades panes. The incoming pane mounts at opacity 0 and rises 12 pt into place;
// the outgoing one is kept as a non-interactive ghost over it for 160 ms. The swap happens in the
// same render the step changes, so no frame shows the new pane before its fade begins.

type Stage = { shown: number; ghost: number | null; gen: number };

function PaneStage({ step, render }: { step: number; render: (step: number) => ReactNode }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState<Stage>({ shown: step, ghost: null, gen: 0 });
  const current: Stage = stage.shown === step ? stage : { shown: step, ghost: stage.shown, gen: stage.gen + 1 };
  if (stage.shown !== step) setStage(current);
  const clearGhost = useCallback((gen: number) => setStage(s => (s.gen === gen && s.ghost != null ? { ...s, ghost: null } : s)), []);

  // Scrolling only engages when the pane outgrows the stage (large type), so the dial's drag is not fought.
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const [locked, setLocked] = useState(false);

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.stage} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      scrollEnabled={contentH > viewH + 1 && !locked} onLayout={e => setViewH(e.nativeEvent.layout.height)} onContentSizeChange={(_, h) => setContentH(h)}>
      <ScrollLockScope onLock={setLocked}>
      <PaneIn key={`in-${current.shown}`} reduced={reduced}>{render(current.shown)}</PaneIn>
      {/* Reduced motion: a plain cut, so the old pane is not kept to fade out. */}
      {current.ghost != null && !reduced ? (
        <PaneOut key={`out-${current.gen}`} onGone={() => clearGhost(current.gen)}>{render(current.ghost)}</PaneOut>
      ) : null}
      </ScrollLockScope>
    </ScrollView>
  );
}

function PaneIn({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const opacity = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 0 : RISE);
  useEffect(() => {
    if (reduced) { opacity.set(1); rise.set(0); return; }
    opacity.set(withTiming(1, cross(timing.crossfadeIn)));
    if (reduced) rise.set(0); else rise.set(withSpring(0, spring.settle));
  }, [opacity, rise, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: rise.get() }] }));
  return <Animated.View style={[styles.pane, style]}>{children}</Animated.View>;
}

function PaneOut({ children, onGone }: { children: ReactNode; onGone: () => void }) {
  const opacity = useSharedValue(1);
  const gone = useRef(onGone);
  gone.current = onGone;
  const fire = useCallback(() => gone.current(), []);
  useEffect(() => {
    opacity.set(withTiming(0, { duration: timing.crossfadeOut, easing: ease.exit }, finished => { if (finished) scheduleOnRN(fire); }));
  }, [opacity, fire]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden
      style={[StyleSheet.absoluteFill, styles.pane, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: z.setup, backgroundColor: colors.night },
  fill: { flex: 1, zIndex: z.content },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: 8, paddingBottom: 20 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  stage: { flexGrow: 1 },
  pane: { flex: 1 },
});
