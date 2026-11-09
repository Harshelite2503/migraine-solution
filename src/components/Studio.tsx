// The sound studio: pick a texture and turn a few dials while your sound plays. Used by the
// first-run setup and by the "My sound" tab. Every change saves at once and plays a moment later.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { recipeFor, type Intake, type Profile, type Tests } from '../lib/profile';
import * as player from '../lib/player';
import { colors, radius, sceneFor, space } from '../lib/theme';
import { ease, lum, timing } from '../lib/motion';
import { Control, Ionicons, Press, Tile, useMaterial, useTablet, type IconName } from '../lib/ui';
import { track } from '../lib/activity';
import { Dial } from './Dial';
import { RecipeArc } from './RecipeArc';

export type Texture = NonNullable<Intake['texture']>;
export const TEXTURES: { value: Texture; label: string; icon: IconName }[] = [
  { value: 'rain', label: 'Rain', icon: 'rainy-outline' },
  { value: 'ocean', label: 'Ocean', icon: 'water-outline' },
  { value: 'fan', label: 'Fan', icon: 'sync-outline' },
  { value: 'none', label: 'Hush', icon: 'remove-outline' },
];
export const textureName = (t: string | undefined) => TEXTURES.find(x => x.value === t)?.label ?? 'Rain';

type DialSpec = { key: 'tone' | 'hum' | 'motion' | 'space'; label: string; stops: string[]; tests: (i: number) => Tests; index: (r: any) => number };
const nearest = (list: number[], v: number) => list.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(list[best] - v) ? i : best), 0);
const TILT = [-9, -8, -7, -6, -5, -4, -3];
const CUTOFF = [600, 900, 1300, 1800, 2500, 3400, 4500];
const TONAL = [0, 0.2, 0.45, 0.7];
const SWELL = [0, 0.6, 1.3, 2.2];
const WIDTH = [0.1, 0.3, 0.55, 0.75, 0.95];
const set = (value: number) => ({ value, trials: 0, at: new Date().toISOString() });

export const DIALS: Record<DialSpec['key'], DialSpec> = {
  tone: { key: 'tone', label: 'Tone', stops: ['Deepest', 'Deep', 'Warm', 'Soft', 'Clear', 'Bright', 'Airy'],
    tests: i => ({ tilt: set(TILT[i]), cutoff: set(CUTOFF[i]) }), index: r => nearest(TILT, r.tiltDbPerOct) },
  hum: { key: 'hum', label: 'Hum', stops: ['None', 'A hint', 'Blend', 'Mostly'],
    tests: i => ({ tonal: set(TONAL[i]) }), index: r => nearest(TONAL, r.tonal) },
  motion: { key: 'motion', label: 'Motion', stops: ['Still', 'Drift', 'Tide', 'Breathe'],
    tests: i => ({ swellDb: set(SWELL[i]) }), index: r => nearest(SWELL, r.swellDb) },
  space: { key: 'space', label: 'Space', stops: ['Centred', 'Close', 'Natural', 'Open', 'Wide'],
    tests: i => ({ width: set(WIDTH[i]) }), index: r => nearest(WIDTH, r.width) },
};

/**
 * Apply a dial setting. A dial is the person's own choice, so it replaces anything learned
 * earlier that would otherwise override it (old A/B rounds and AI suggestions).
 */
export function withDial(profile: Profile, key: DialSpec['key'], index: number): Profile {
  return { ...profile, tests: { ...profile.tests, ...DIALS[key].tests(index) }, model: null, rounds: 0, aiReview: null };
}

/** The first-run question, as one tap: which sounds are hardest during a headache. */
export type Hardest = 'high' | 'low' | 'sudden' | 'unsure';
export function withHardest(profile: Profile, h: Hardest): Profile {
  const bother = { ...(profile.intake.bother || {}), high: h === 'high' ? 3 : 1, low: h === 'low' ? 3 : 1, sudden: h === 'sudden' ? 3 : 1 };
  return { ...profile, intake: { ...profile.intake, bother } };
}

/** The sound the studio plays: the person's own, at the gentle middle setting. */
const previewRecipe = (p: Profile) => recipeFor(p, 'warning').recipe;

/**
 * Live preview: start/stop the person's sound, and when the profile changes while it plays,
 * play the new version once the dial has settled for a moment.
 */
export function usePreview() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef<Profile | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0);
  const live = useRef(false);

  const render = useCallback(async () => {
    const p = latest.current; if (!p) return;
    const mine = ++run.current;
    setBusy(true);
    try {
      const r = previewRecipe(p);
      const uri = await player.recipeFile(r);
      if (mine !== run.current || !live.current) return;
      await player.play(uri, { levelDb: r.levelDb, fadeIn: 0.8, title: 'My sound' });
    } catch {} finally { if (mine === run.current) setBusy(false); }
  }, []);

  const start = useCallback((p: Profile) => { latest.current = p; live.current = true; setOn(true); render(); }, [render]);
  const stop = useCallback(() => { live.current = false; run.current++; setOn(false); setBusy(false); if (timer.current) clearTimeout(timer.current); player.stop(0.8); }, []);
  const update = useCallback((p: Profile) => {
    latest.current = p;
    if (!live.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(render, 350);
  }, [render]);
  useEffect(() => () => { live.current = false; if (timer.current) clearTimeout(timer.current); player.stop(0.3); }, []);
  return { on, busy, start, stop, update, toggle: (p: Profile) => (live.current ? stop() : start(p)) };
}

/** Four texture tiles, each a miniature of its room. Choosing one also starts it playing, so people choose by ear. */
export function TextureTiles({ value, onPick }: { value: Texture | undefined; onPick: (t: Texture) => void }) {
  const tablet = useTablet();
  return (
    <View style={s.tiles} accessibilityRole="radiogroup" accessibilityLabel="Texture">
      {TEXTURES.map(t => (
        <Tile key={t.value} scene={sceneFor(t.value)} icon={t.icon} label={t.label} on={(value ?? 'rain') === t.value}
          style={tablet ? s.tileQuarter : null}
          onPress={() => { track('texture_pick', { texture: t.value }); onPick(t.value); }} />
      ))}
    </View>
  );
}

/** A big tappable choice (square, or a wide row). The shared primitive; kept under this name for older imports. */
export { Tile };

/** One dial bound to the profile. */
export function ProfileDial({ which, profile, onChange, size, disabled }: { which: DialSpec['key']; profile: Profile; onChange: (p: Profile) => void; size?: number; disabled?: boolean }) {
  const spec = DIALS[which];
  const saved = spec.index(recipeFor(profile, 'normal').recipe);
  const [shown, setShown] = useState(saved);
  useEffect(() => setShown(saved), [saved]);
  return (
    <Dial label={spec.label} stops={spec.stops} value={shown} size={size} disabled={disabled}
      onChange={setShown}
      onRelease={i => { track('dial', { dial: which, stop: i }); onChange(withDial(profile, which, i)); }} />
  );
}

const DISC = 112;
const ARC = 150;
const RING_IDLE = 0.35;
const RING_ON = 0.9;
const PREVIEW_FADE_IN_MS = 800;   // usePreview plays with fadeIn 0.8 s; the ring brightens at the same rate

/**
 * Listen: a 112 pt lamp-style button, the studio's one primary. The ring brightens as the preview fades in
 * and settles back when it stops. Pass `arc` (the profile) to draw the Recipe Arc around it, as My sound does;
 * `compact` gives a 48 pt pill for tight layouts.
 */
export function PreviewButton({ on, busy, onPress, arc, compact }: { on: boolean; busy: boolean; onPress: () => void; arc?: Profile; compact?: boolean }) {
  const ring = useSharedValue(on ? RING_ON : RING_IDLE);
  useEffect(() => {
    cancelAnimation(ring);
    // Brightness: never a spring. Up at the gain's own fade-in, down at least as slowly as the darker rule.
    ring.set(on ? withTiming(RING_ON, { duration: PREVIEW_FADE_IN_MS, easing: ease.linear }) : withTiming(RING_IDLE, lum(timing.darker)));
  }, [on, ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));

  const material = useMaterial();
  const word = on ? (busy ? 'Tuning…' : 'Playing') : 'Listen';
  const glyph: IconName = on ? 'pause' : 'play';
  const a11y = { accessibilityRole: 'button' as const, accessibilityLabel: on ? 'Stop listening' : 'Listen', accessibilityState: { busy } };

  if (compact) {
    return (
      <Press {...a11y} onPress={onPress} style={[s.pill, material.fill, on && s.pillOn, on && material.selected]}>
        <Ionicons name={glyph} size={18} color={colors.lamp} />
        <Control color={on ? colors.lamp : colors.ink}>{word}</Control>
      </Press>
    );
  }

  const box = arc ? ARC : DISC;
  return (
    <View style={s.listen}>
      <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
        {arc ? <RecipeArc profile={arc} size={ARC} /> : null}
        {/* A large lit surface: no reduced-motion opacity pulse on touch. */}
        <Press {...a11y} onPress={onPress} largeSurface style={[s.disc, material.fill]}>
          <Animated.View pointerEvents="none" style={[s.ring, ringStyle]} />
          <Ionicons name={glyph} size={36} color={colors.lamp} style={on ? null : s.playNudge} />
        </Press>
      </View>
      <Control color={on ? colors.lamp : colors.ink} center importantForAccessibility="no" accessibilityElementsHidden>{word}</Control>
    </View>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  tileQuarter: { flexBasis: '22%' },
  listen: { alignSelf: 'center', alignItems: 'center', gap: space.s },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, backgroundColor: colors.smoke, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: DISC / 2, borderWidth: 2, borderColor: colors.lamp },
  playNudge: { marginLeft: 3 },   // the play triangle's optical centre sits right of its box
  pill: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: space.s, minHeight: 48, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.smoke },
  pillOn: { borderColor: colors.lampDeep, backgroundColor: colors.smokePressed },
});
