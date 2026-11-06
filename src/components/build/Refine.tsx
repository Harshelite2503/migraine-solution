// Fine-tuning: "which felt calmer?" rounds across four qualities at once, learned by a
// Gaussian-process preference model starting from your measured recipe.
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { settingsFromX, xFromSettings } from '../../recipe/recipe.js';
import { champion, isVetoed, modelOf, recipeFor, type Point, type Profile } from '../../lib/profile';
import * as player from '../../lib/player';
import { Button, Muted } from '../../lib/ui';
import { colors } from '../../lib/theme';

type Props = { profile: Profile; onChange: (p: Profile) => void };
type Pair = { a: Point; b: Point; heard: boolean };

export function Refine({ profile, onChange }: Props) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [now, setNow] = useState<'a' | 'b' | null>(null);
  const [status, setStatus] = useState('');
  const run = useRef(0);
  useEffect(() => () => { run.current++; player.stop(0.3); }, []);

  const start = (): Point => (champion(profile) ?? (xFromSettings(recipeFor(profile, 'normal').recipe) as Point));
  const nextPair = (): Pair => {
    const champ = start();
    const challenger = (modelOf(profile) as any).nextChallenger({ seed: profile.rounds * 17 + 3, exclude: (x: number[]) => isVetoed(profile, x), start: champ }) as Point;
    return Math.random() < 0.5 ? { a: champ, b: challenger, heard: false } : { a: challenger, b: champ, heard: false };
  };
  const variant = (x: Point) => ({ ...recipeFor(profile, 'normal').recipe, ...settingsFromX(x) });

  const playPair = async () => {
    const mine = ++run.current;
    const p = pair ?? nextPair();
    setPair(p); setStatus('Preparing two sounds…');
    const uris = [await player.recipeFile(variant(p.a), true), await player.recipeFile(variant(p.b), true)];
    for (const [i, w] of (['a', 'b'] as const).entries()) {
      if (mine !== run.current) return;
      setNow(w); setStatus(`Playing ${w.toUpperCase()}…`);
      await player.play(uris[i], { levelDb: Math.min(0, profile.baseLevelDb), fadeIn: 0.05, loop: false, title: `Sound ${w.toUpperCase()}` });
      await new Promise(r => setTimeout(r, 6200));
    }
    if (mine !== run.current) return;
    player.stop(0.2); setNow(null); setPair({ ...p, heard: true }); setStatus('Which felt calmer?');
  };

  const choose = (c: 'a' | 'b' | 'same' | 'neither') => {
    if (!pair) return;
    run.current++; player.stop(0.3); setNow(null);
    const model = modelOf(profile);
    if (c === 'a') model.addComparison(pair.a, pair.b);
    if (c === 'b') model.addComparison(pair.b, pair.a);
    onChange({ ...profile, model: model.toJSON(), rounds: profile.rounds + 1, vetoes: c === 'neither' ? [...profile.vetoes, pair.a, pair.b].slice(-50) : profile.vetoes });
    setPair(null);
    setStatus(c === 'neither' ? 'Both noted as unpleasant. Still will not offer sounds close to either again.' : 'Noted. Play the next pair when you are ready.');
  };

  return (
    <View style={{ gap: 10 }}>
      <Muted>Now everything changes a little at once, around your measured sound. About 8–12 rounds is enough; after 4, your choices start shaping your recipe. Round {profile.rounds + 1}.</Muted>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['a', 'b'] as const).map(w => (
          <View key={w} style={{ flex: 1, borderWidth: 1, borderColor: now === w ? colors.ink : colors.line, borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.ink, fontSize: 26 }}>{w.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      <Button kind="primary" label={now ? 'Playing…' : pair?.heard ? '▶  Play again' : '▶  Play A then B'} onPress={playPair} disabled={!!now} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label="A felt calmer" onPress={() => choose('a')} disabled={!pair?.heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
        <Button label="B felt calmer" onPress={() => choose('b')} disabled={!pair?.heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
        <Button label="About the same" onPress={() => choose('same')} disabled={!pair?.heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
        <Button label="Both unpleasant" onPress={() => choose('neither')} disabled={!pair} style={{ flexBasis: '48%', flexGrow: 1 }} />
      </View>
      <Button kind="quiet" label="■  Stop" onPress={() => { run.current++; player.stop(0.4); setNow(null); setStatus('Stopped.'); }} />
      {status ? <Muted>{status}</Muted> : null}
    </View>
  );
}
