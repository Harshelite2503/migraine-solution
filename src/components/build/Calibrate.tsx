// Calibration: a quiet reference level, then a per-band comfort contour (press and hold; the band
// rises slowly from very quiet and stops the moment you let go). Never measures discomfort.
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CONTOUR_BANDS, recipeFor, type Profile } from '../../lib/profile';
import * as player from '../../lib/player';
import { Button, Muted } from '../../lib/ui';
import { colors } from '../../lib/theme';

type Props = { profile: Profile; onChange: (p: Profile) => void };
const START_DB = -30, CAP_DB = 0, RATE_DB_S = 2.5;
const NAMES: Record<number, string> = { 125: 'Deep hum', 250: 'Low voice', 500: 'Warm middle', 1000: 'Middle', 2000: 'Presence', 4000: 'Hiss and edge', 8000: 'Air and sizzle' };

export function Reference({ profile, onChange }: Props) {
  const [on, setOn] = useState(false);
  const toggle = async () => {
    if (on) { player.stop(1); setOn(false); return; }
    setOn(true);
    const uri = await player.recipeFile(recipeFor(profile, 'normal').recipe);
    await player.play(uri, { levelDb: 0, fadeIn: 3, title: 'Reference' });
  };
  return (
    <View style={{ gap: 10 }}>
      <Muted><Text style={{ color: colors.ink, fontWeight: '600' }}>Before you press play, turn your phone volume down to about a quarter.</Text> Then play a soft, steady sound and adjust the phone volume until it is quiet but clear: easy to hear, nowhere near loud. Every later sound is set relative to this point, because a phone cannot know how loud it is at your ears.</Muted>
      <Button label={on ? '■  Stop' : '▶  Play reference sound'} onPress={toggle} />
      <Button kind="primary" label="This is quiet but clear ✓" onPress={() => { player.stop(1); setOn(false); onChange({ ...profile, calibration: { ...profile.calibration, referenceAt: new Date().toISOString() } }); }} />
      {profile.calibration.referenceAt ? <Muted small>Reference set. Keep your phone volume here when you use Still.</Muted> : null}
    </View>
  );
}

export function Contour({ profile, onChange }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const stopRef = useRef<null | (() => number)>(null);
  const pressed = useRef(false);

  const down = async (hz: number) => {
    pressed.current = true; setActive(hz);
    const uri = await player.bandFile(hz);
    const stopFn = await player.playRising(uri, START_DB, CAP_DB, RATE_DB_S);
    if (!pressed.current) { stopFn(); setActive(null); return; }
    stopRef.current = stopFn;
  };
  const up = (hz: number) => {
    pressed.current = false;
    const fn = stopRef.current; stopRef.current = null; setActive(null);
    if (!fn) return;
    const reached = Math.round(fn() * 10) / 10;
    const contour = [...profile.calibration.contour.filter(b => b.hz !== hz), { hz, ceilingDb: reached }].sort((a, b) => a.hz - b.hz);
    onChange({ ...profile, calibration: { ...profile.calibration, contour } });
  };

  return (
    <View style={{ gap: 8 }}>
      <Muted>For each band, press and <Text style={{ color: colors.ink, fontWeight: '600' }}>hold</Text>. The sound starts very quietly and rises slowly. Let go as soon as it stops feeling gentle. It stops the moment you let go and never goes above a fixed cap. Bands you mark lower are turned down in every sound Still makes for you.</Muted>
      {CONTOUR_BANDS.map(hz => {
        const mark = profile.calibration.contour.find(b => b.hz === hz);
        const frac = mark ? (mark.ceilingDb - START_DB) / (CAP_DB - START_DB) : 0;
        return (
          <Pressable key={hz} onPressIn={() => down(hz)} onPressOut={() => up(hz)} accessibilityRole="button"
            accessibilityLabel={`${NAMES[hz]}, ${hz} hertz. Press and hold, release when it stops feeling gentle.`}
            style={{ borderWidth: 1, borderColor: active === hz ? colors.ink : colors.line, borderRadius: 12, padding: 14, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.ink }}>{NAMES[hz]} · {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{active === hz ? 'Rising… let go when it stops feeling gentle' : mark ? `${mark.ceilingDb.toFixed(0)} dB` : 'Press and hold'}</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.raised }}>
              <View style={{ width: `${Math.max(2, frac * 100)}%`, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
            </View>
          </Pressable>
        );
      })}
      <Muted small>These are personal comparisons on your phone, not a hearing test.</Muted>
    </View>
  );
}
