// Six focused listening tests. Each one changes a single quality while everything else stays at
// your current best recipe, plays the two versions at matched loudness, and narrows in on what
// feels calmest (an adaptive two-choice search). Results feed straight into your recipe.
// Shown as a small ritual: two round pads whose rims fill as each version plays, then become the answers.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TESTS, startStaircase, pairFor, answer, result } from '../../recipe/staircase.js';
import { recipeFor, type Profile, type Tests as TestsT } from '../../lib/profile';
import * as player from '../../lib/player';
import { Body, Button, Caption, Chip, Eyebrow, Heading, Status } from '../../lib/ui';
import { colors, space } from '../../lib/theme';
import { track } from '../../lib/activity';
import { RoundPad, type PadState } from './RoundPad';

type Props = { profile: Profile; onChange: (p: Profile) => void; keys?: string[] };
type Stair = ReturnType<typeof startStaircase>;
const CLIP_MS = 6000;
const LONG_CLIP_MS = 12000;

export function Tests({ profile, onChange, keys }: Props) {
  const set = keys ? TESTS.filter(t => keys.includes(t.key)) : TESTS;
  // A setting turned on a dial (trials: 0) has not been compared by ear yet, so it still counts as to do.
  const pending = set.filter(t => !((profile.tests as any)[t.key]?.trials > 0) && !t.skipIf?.(profile.tests, profile.intake));
  const test = pending[0];
  const [stair, setStair] = useState<Stair | null>(test ? startStaircase(test) : null);
  const [flip, setFlip] = useState(false);       // whether A is the higher value this round
  const [heard, setHeard] = useState(false);
  const [now, setNow] = useState<'a' | 'b' | null>(null);
  const [rim, setRim] = useState<'a' | 'b' | null>(null);   // whose clip is audibly playing, for the rim fill
  const [glow, setGlow] = useState({ a: 0, b: 0 });
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
    return <Body color={colors.ink2}>Done. Your sound now uses what you chose. You can redo these any time.</Body>;
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

  const long = test.key === 'swellDb';
  const clipMs = long ? LONG_CLIP_MS : CLIP_MS;

  const playRound = async () => {
    const mine = ++run.current;
    const [lo, hi] = pairFor(test, stair);
    const order = flip ? [hi, lo] : [lo, hi];
    setRim(null);
    setStatus('Preparing two sounds…');
    const long = test.key === 'swellDb';
    const uris = [await player.recipeFile(variant(order[0]), true, long), await player.recipeFile(variant(order[1]), true, long)];
    for (const [i, which] of (['a', 'b'] as const).entries()) {
      if (mine !== run.current) return;
      setNow(which); setStatus(`Playing ${which.toUpperCase()}…`);
      await player.play(uris[i], { levelDb: Math.min(0, profile.baseLevelDb), fadeIn: 0.05, loop: false, title: `Sound ${which.toUpperCase()}` });
      // The rim starts filling once the clip is actually sounding.
      if (mine === run.current) setRim(which);
      await new Promise(r => setTimeout(r, long ? LONG_CLIP_MS : CLIP_MS));
    }
    if (mine !== run.current) return;
    player.stop(0.2); setNow(null); setRim(null); setHeard(true); setStatus(test.question);
  };

  const choose = (c: 'a' | 'b' | 'same' | 'neither') => {
    run.current++; player.stop(0.3); setNow(null); setRim(null);
    if (c === 'a' || c === 'b') setGlow(g => ({ ...g, [c]: g[c] + 1 }));
    const mapped = c === 'same' || c === 'neither' ? c : (c === 'a') !== flip ? 'lower' : 'higher';
    const next = answer(test, stair, mapped as any);
    track('test_answer', { test: test.key, choice: String(mapped), round: stair.trials + 1 });
    setHeard(false); setFlip(Math.random() < 0.5);
    if (next.done) {
      const res = result(next);
      onChange({ ...profile, tests: { ...profile.tests, [test.key]: res } as TestsT });
      setStatus(`${test.title}: ${test.describe(res.value)}. Saved.`);
    } else {
      setStair(next);
      setStatus('Noted. Play the next pair when you are ready.');
    }
  };

  const stop = () => { run.current++; player.stop(0.4); setNow(null); setRim(null); setStatus('Stopped. Quiet is a valid choice.'); };

  // The pad sounding fills; a pad already heard (this pass or the last) rests full; otherwise empty.
  const padState = (w: 'a' | 'b'): PadState =>
    rim === w ? 'playing' : heard || (w === 'a' && rim === 'b') ? 'played' : 'idle';

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Eyebrow>Test {set.indexOf(test) + 1} of {set.length} · round {stair.trials + 1} of {test.rounds}</Eyebrow>
        {/* Round ticks: done rounds lit. Decoration; the Eyebrow says the same in words. */}
        <View style={s.ticks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
          {Array.from({ length: test.rounds }, (_, i) => (
            <View key={i} style={[s.tick, { backgroundColor: i < stair.trials ? colors.lamp : colors.lampDeep }]} />
          ))}
        </View>
      </View>
      <Heading>{test.title}</Heading>
      <Body color={colors.ink2}>Two versions play, A then B. Pick the calmer one.</Body>
      <Caption>Use headphones if you can.</Caption>

      <View style={s.pads}>
        {(['a', 'b'] as const).map(w => (
          <RoundPad key={w} letter={w === 'a' ? 'A' : 'B'} state={padState(w)} clipMs={clipMs}
            answer={heard} onPress={() => choose(w)} glow={glow[w]} />
        ))}
      </View>

      <Status>{status}</Status>

      <Button kind="primary" icon="play" label={now ? 'Playing…' : heard ? 'Play again' : 'Play A then B'} onPress={playRound} disabled={!!now} />
      <View style={s.chips}>
        <Chip label="About the same" onPress={() => choose('same')} disabled={!heard} style={s.chip} />
        <Chip label="Both unpleasant" onPress={() => choose('neither')} disabled={!heard && !now} style={s.chip} />
      </View>
      <Button kind="quiet" icon="stop" label="Stop" onPress={stop} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.m },
  head: { gap: space.s },
  ticks: { flexDirection: 'row', gap: 6 },
  tick: { width: 6, height: 6, borderRadius: 3 },
  pads: { flexDirection: 'row', justifyContent: 'center', gap: space.xl, paddingVertical: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { flexBasis: '45%', flexGrow: 1 },
});
