// Tune my sound: four questions pick a gentle first sound, then "which felt calmer?" rounds teach
// the preference model (the same Gaussian-process learner as the web comfort profile).
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { describeX } from '../engine/comfort-engine.js';
import { champion, firstSound, freshProfile, isVetoed, modelOf, type Answers, type Point, type Profile } from '../lib/profile';
import { loadProfile, saveProfile } from '../lib/storage';
import * as player from '../lib/player';
import { Button, H1, H2, Muted, styles } from '../lib/ui';
import { colors } from '../lib/theme';

const QUESTIONS: { key: keyof Answers; text: string }[] = [
  { key: 'sudden', text: 'Sudden sounds, like a door or a notification' },
  { key: 'high', text: 'High, hissy sounds, like a kettle or static' },
  { key: 'low', text: 'Low rumbling, like traffic or a fridge' },
  { key: 'pulse', text: 'Pulsing or throbbing sounds' },
];
const SCALE = ['Not at all', 'A little', 'Some', 'A lot', 'Severely'];
const CLIP_MS = 6200;

type Pair = { a: Point; b: Point; heard: boolean };

export default function Tune() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [pair, setPair] = useState<Pair | null>(null);
  const [now, setNow] = useState<'a' | 'b' | null>(null);
  const [status, setStatus] = useState('');
  const run = useRef(0);
  useFocusEffect(useCallback(() => { loadProfile().then(setProfile); return () => { run.current++; player.stop(0.3); }; }, []));

  const update = async (next: Profile) => { setProfile(next); await saveProfile(next); };

  const nextPair = (): Pair => {
    const model = modelOf(profile);
    const vetoed = (x: number[]) => isVetoed(profile, x);
    const champ = (champion(profile) ?? firstSound(profile)) as Point;
    // JSDoc-free JS: its inferred option types are too narrow, so call it untyped.
    const challenger = (model as any).nextChallenger({ seed: profile.rounds * 17 + 3, exclude: vetoed, start: champ }) as Point;
    return Math.random() < 0.5 ? { a: champ, b: challenger, heard: false } : { a: challenger, b: champ, heard: false };
  };

  const playPair = async () => {
    const mine = ++run.current;
    const p = pair ?? nextPair();
    setPair(p);
    setStatus('Preparing two sounds…');
    const [ua, ub] = [await player.soundFile(p.a, 'normal', true), await player.soundFile(p.b, 'normal', true)];
    for (const [which, uri] of [['a', ua], ['b', ub]] as const) {
      if (mine !== run.current) return;
      setNow(which); setStatus(`Playing ${which.toUpperCase()}…`);
      await player.play(uri, { levelDb: profile.baseLevelDb, fadeIn: 0.05, loop: false, title: `Sound ${which.toUpperCase()}` });
      await new Promise(r => setTimeout(r, CLIP_MS));
    }
    if (mine !== run.current) return;
    player.stop(0.2); setNow(null);
    setPair({ ...p, heard: true });
    setStatus('Which felt calmer?');
  };

  const choose = async (choice: 'a' | 'b' | 'same' | 'neither') => {
    if (!pair) return;
    run.current++; player.stop(0.3); setNow(null);
    const model = modelOf(profile);
    if (choice === 'a') model.addComparison(pair.a, pair.b);
    if (choice === 'b') model.addComparison(pair.b, pair.a);
    const next: Profile = {
      ...profile, model: model.toJSON(), rounds: profile.rounds + 1,
      vetoes: choice === 'neither' ? [...profile.vetoes, pair.a, pair.b].slice(-50) : profile.vetoes,
    };
    await update(next);
    setPair(null);
    setStatus(choice === 'neither' ? 'Both noted as unpleasant. Still will not offer sounds close to either again.' : 'Noted. Play the next pair when you are ready.');
  };

  const fav = champion(profile);
  const d = fav ? describeX(fav) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.screen}>
        <H1>Tune my sound</H1>
        <Muted>Do this on a calmer day, with headphones and the volume low. Your choices teach Still which sound feels gentlest to you. The quiet room then plays it, quieter, on hard days.</Muted>

        <View style={styles.card}>
          <H2>What tends to bother you?</H2>
          <Muted small>This picks a gentle first sound. It is not a test or a diagnosis.</Muted>
          {QUESTIONS.map(q => (
            <View key={q.key} style={{ gap: 6, marginTop: 8 }}>
              <Text style={{ color: colors.ink }}>{q.text}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {SCALE.map((label, i) => (
                  <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: profile.answers[q.key] === i }}
                    onPress={() => update({ ...profile, answers: { ...profile.answers, [q.key]: i } })}
                    style={{ borderWidth: 1, borderColor: profile.answers[q.key] === i ? colors.ink : colors.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
                    <Text style={{ color: profile.answers[q.key] === i ? colors.ink : colors.muted, fontSize: 12 }}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <H2>Which felt calmer?</H2>
          <Muted small>Each round plays two six-second sounds, A then B, at the same loudness. About 10–16 rounds is usually enough. Round {profile.rounds + 1}.</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
            {(['a', 'b'] as const).map(w => (
              <View key={w} style={{ flex: 1, borderWidth: 1, borderColor: now === w ? colors.ink : colors.line, borderRadius: 12, padding: 16, alignItems: 'center' }}>
                <Text style={{ color: colors.ink, fontSize: 28 }}>{w.toUpperCase()}</Text>
              </View>
            ))}
          </View>
          <Button kind="primary" label={now ? 'Playing…' : pair?.heard ? '▶  Play again' : '▶  Play A then B'} onPress={playPair} disabled={!!now} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            <Button label="A felt calmer" onPress={() => choose('a')} disabled={!pair?.heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
            <Button label="B felt calmer" onPress={() => choose('b')} disabled={!pair?.heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
            <Button label="About the same" onPress={() => choose('same')} disabled={!pair?.heard} style={{ flexBasis: '48%', flexGrow: 1 }} />
            <Button label="Both unpleasant" onPress={() => choose('neither')} disabled={!pair} style={{ flexBasis: '48%', flexGrow: 1 }} />
          </View>
          <Button kind="quiet" label="■  Stop" onPress={() => { run.current++; player.stop(0.4); setNow(null); setStatus('Stopped. Quiet is a valid choice.'); }} />
          {status ? <Muted>{status}</Muted> : null}
        </View>

        <View style={styles.card}>
          <H2>Your sound so far</H2>
          {d ? (
            <>
              <Muted>Tone: {d.tilt}.</Muted>
              <Muted>Texture: {d.texture}.</Muted>
              <Muted>Movement: {d.motion}.</Muted>
              <Muted>Top end: {d.top}.</Muted>
              <Muted small>Based on {profile.rounds} choices. Preferring a sound is not the same as it reducing pain.</Muted>
            </>
          ) : <Muted>Answer a few rounds to see it described here.</Muted>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
