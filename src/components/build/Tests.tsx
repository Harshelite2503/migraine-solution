// Six focused listening tests. Each one changes a single quality while everything else stays at
// your current best recipe, plays the two versions at matched loudness, and narrows in on what
// feels calmest (an adaptive two-choice search). Results feed straight into your recipe.
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { TESTS, startStaircase, pairFor, answer, result } from '../../recipe/staircase.js';
import { recipeFor, type Profile, type Tests as TestsT } from '../../lib/profile';
import * as player from '../../lib/player';
import { Button, Muted } from '../../lib/ui';
import { colors } from '../../lib/theme';

type Props = { profile: Profile; onChange: (p: Profile) => void };
type Stair = ReturnType<typeof startStaircase>;
const CLIP_MS = 6000;

const fmt = (key: string, v: number) =>
  key === 'tilt' ? `${v.toFixed(1)} dB/octave` : key === 'cutoff' || key === 'humHz' ? `${v.toFixed(key === 'humHz' ? 1 : 0)} Hz`
    : key === 'swellDb' ? `${v.toFixed(1)} dB` : `${Math.round(v * 100)}%`;

export function Tests({ profile, onChange }: Props) {
  const pending = TESTS.filter(t => !(profile.tests as any)[t.key] && !t.skipIf?.(profile.tests, profile.intake));
  const test = pending[0];
  const [stair, setStair] = useState<Stair | null>(test ? startStaircase(test) : null);
  const [flip, setFlip] = useState(false);       // whether A is the higher value this round
  const [heard, setHeard] = useState(false);
  const [now, setNow] = useState<'a' | 'b' | null>(null);
  const [status, setStatus] = useState('');
  const run = useRef(0);
  useEffect(() => () => { run.current++; player.stop(0.3); }, []);
  useEffect(() => { if (test && (!stair || stair.key !== test.key)) { setStair(startStaircase(test)); setHeard(false); } }, [test?.key]);

  // Prepare this round's pair in the background, so "Play A then B" starts at once.
  useEffect(() => {
    if (!test || !stair || stair.done) return;
    const long = test.key === 'swellDb';
    const [lo, hi] = pairFor(test, stair);
    player.prewarm([{ recipe: variant(lo), clip: true, long }, { recipe: variant(hi), clip: true, long }], 400);
  }, [test?.key, stair?.trials]);

  if (!test || !stair) {
    return <Muted>All listening tests are done. Your results are in your recipe below. You can redo any test by resetting it there.</Muted>;
  }

  const variant = (value: number) => {
    const base = recipeFor(profile, 'normal').recipe;
    const r: any = { ...base };
    if (test.key === 'tilt') r.tiltDbPerOct = value;
    if (test.key === 'cutoff') r.cutoffHz = value;
    if (test.key === 'tonal') r.tonal = value;
    if (test.key === 'humHz') { r.humHz = value; r.tonal = Math.max(0.6, base.tonal); }
    if (test.key === 'swellDb') { r.swellDb = value; r.swellPeriodS = 6; }
    if (test.key === 'width') r.width = value;
    return r;
  };

  const playRound = async () => {
    const mine = ++run.current;
    const [lo, hi] = pairFor(test, stair);
    const order = flip ? [hi, lo] : [lo, hi];
    setStatus('Preparing two sounds…');
    const long = test.key === 'swellDb';
    const uris = [await player.recipeFile(variant(order[0]), true, long), await player.recipeFile(variant(order[1]), true, long)];
    for (const [i, which] of (['a', 'b'] as const).entries()) {
      if (mine !== run.current) return;
      setNow(which); setStatus(`Playing ${which.toUpperCase()}…`);
      await player.play(uris[i], { levelDb: Math.min(0, profile.baseLevelDb), fadeIn: 0.05, loop: false, title: `Sound ${which.toUpperCase()}` });
      await new Promise(r => setTimeout(r, long ? 12000 : CLIP_MS));
    }
    if (mine !== run.current) return;
    player.stop(0.2); setNow(null); setHeard(true); setStatus(test.question);
  };

  const choose = (c: 'a' | 'b' | 'same' | 'neither') => {
    run.current++; player.stop(0.3); setNow(null);
    const mapped = c === 'same' || c === 'neither' ? c : (c === 'a') !== flip ? 'lower' : 'higher';
    const next = answer(test, stair, mapped as any);
    setHeard(false); setFlip(Math.random() < 0.5);
    if (next.done) {
      const res = result(next);
      onChange({ ...profile, tests: { ...profile.tests, [test.key]: res } as TestsT });
      setStatus(`${test.title}: ${test.describe(res.value)} (${fmt(test.key, res.value)}). Saved.`);
    } else {
      setStair(next);
      setStatus('Noted. Play the next pair when you are ready.');
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Muted small>Test {TESTS.indexOf(test) + 1} of {TESTS.length} · round {stair.trials + 1} of {test.rounds}. Use headphones if you can.</Muted>
      <Text style={{ color: colors.ink, fontSize: 18 }}>{test.title}</Text>
      <Muted>Two versions play, A then B. Only one quality changes. Pick the one that feels calmer.</Muted>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['a', 'b'] as const).map(w => (
          <View key={w} style={{ flex: 1, borderWidth: 1, borderColor: now === w ? colors.ink : colors.line, borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.ink, fontSize: 26 }}>{w.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      <Button kind="primary" label={now ? 'Playing…' : heard ? '▶  Play again' : '▶  Play A then B'} onPress={playRound} disabled={!!now} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="A felt calmer" onPress={() => choose('a')} disabled={!heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
        <Button label="B felt calmer" onPress={() => choose('b')} disabled={!heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
        <Button label="About the same" onPress={() => choose('same')} disabled={!heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
        <Button label="Both unpleasant" onPress={() => choose('neither')} disabled={!heard && !now} style={{ flexBasis: '48%', flexGrow: 1 }} />
      </View>
      <Button kind="quiet" label="■  Stop" onPress={() => { run.current++; player.stop(0.4); setNow(null); setStatus('Stopped. Quiet is a valid choice.'); }} />
      {status ? <Muted>{status}</Muted> : null}
    </View>
  );
}
