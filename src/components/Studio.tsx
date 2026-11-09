// The sound studio: pick a texture and turn a few dials while your sound plays. Used by the
// first-run setup and by the "My sound" tab. Every change saves at once and plays a moment later.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { recipeFor, type Intake, type Profile, type Tests } from '../lib/profile';
import * as player from '../lib/player';
import { colors } from '../lib/theme';
import { Ionicons, tap, type IconName } from '../lib/ui';
import { track } from '../lib/activity';
import { Dial } from './Dial';

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

/** Four texture tiles. Choosing one also starts it playing, so people choose by ear. */
export function TextureTiles({ value, onPick }: { value: Texture | undefined; onPick: (t: Texture) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup">
      {TEXTURES.map(t => <Tile key={t.value} icon={t.icon} label={t.label} on={(value ?? 'rain') === t.value}
        onPress={() => { track('texture_pick', { texture: t.value }); onPick(t.value); }} />)}
    </View>
  );
}

/** A big, square, tappable choice with an icon. Springs a little when chosen. */
export function Tile({ icon, label, sub, on, onPress, wide }: { icon: IconName; label: string; sub?: string; on: boolean; onPress: () => void; wide?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const bounce = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: on }}
      onPressIn={() => { tap(); bounce(0.95); }} onPressOut={() => bounce(1)} onPress={onPress}
      style={{ flexBasis: wide ? '100%' : '46%', flexGrow: 1 }}>
      <Animated.View style={{
        transform: [{ scale }], borderRadius: 22, borderWidth: 1, padding: 16, gap: 10, minHeight: wide ? 0 : 104,
        flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', justifyContent: wide ? 'flex-start' : 'space-between',
        borderColor: on ? 'rgba(169,199,155,0.65)' : colors.line, backgroundColor: on ? 'rgba(169,199,155,0.13)' : colors.surface,
      }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? 'rgba(169,199,155,0.2)' : colors.surfaceStrong }}>
          <Ionicons name={icon} size={20} color={on ? colors.accent : colors.moon} />
        </View>
        <View style={{ flex: wide ? 1 : 0, gap: 2 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '600' }}>{label}</Text>
          {sub ? <Text style={{ color: colors.muted, fontSize: 12.5 }}>{sub}</Text> : null}
        </View>
        {on ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={wide ? undefined : { position: 'absolute', top: 14, right: 14 }} /> : null}
      </Animated.View>
    </Pressable>
  );
}

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

/** The round play/stop button for the studio. */
export function PreviewButton({ on, busy, onPress }: { on: boolean; busy: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={on ? 'Stop listening' : 'Listen'} onPressIn={tap} onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999,
        backgroundColor: on ? colors.surfaceStrong : colors.accent, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <Ionicons name={on ? 'pause' : 'play'} size={18} color={on ? colors.ink : colors.bgTop} />
      <Text style={{ color: on ? colors.ink : colors.bgTop, fontSize: 15.5, fontWeight: '600' }}>{on ? (busy ? 'Tuning…' : 'Playing') : 'Listen'}</Text>
    </Pressable>
  );
}
