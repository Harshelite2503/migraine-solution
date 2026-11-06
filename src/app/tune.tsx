// Build my sound: seven steps that turn your answers and listening choices into one exact,
// explained sound recipe. Each step saves as you go; you can stop and come back.
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { freshProfile, progress, type Profile } from '../lib/profile';
import { loadProfile, saveProfile } from '../lib/storage';
import * as player from '../lib/player';
import { AboutHeadaches, Likes, Sensitivities } from '../components/build/Intake';
import { Contour, Reference } from '../components/build/Calibrate';
import { Tests } from '../components/build/Tests';
import { Refine } from '../components/build/Refine';
import { RecipeCard } from '../components/build/RecipeCard';
import { Button, Eyebrow, H1, Ionicons, Muted, Screen, styles, tap, type IconName } from '../lib/ui';
import { colors } from '../lib/theme';

type StepKey = 'about' | 'sensitivities' | 'likes' | 'reference' | 'contour' | 'tests' | 'refine' | 'recipe';
const STEPS: { key: StepKey; title: string; time: string; sound: boolean; icon: IconName }[] = [
  { key: 'about', title: 'About your headaches', time: '1 min', sound: false, icon: 'help-circle-outline' },
  { key: 'sensitivities', title: 'Sounds that bother you', time: '1 min', sound: false, icon: 'ear-outline' },
  { key: 'likes', title: 'Likes, dislikes and how you listen', time: '1 min', sound: false, icon: 'heart-outline' },
  { key: 'reference', title: 'Set a quiet reference volume', time: '30 s', sound: true, icon: 'volume-low-outline' },
  { key: 'contour', title: 'Your comfort contour, 7 bands', time: '2 min', sound: true, icon: 'stats-chart-outline' },
  { key: 'tests', title: 'Six focused listening tests', time: '6–8 min', sound: true, icon: 'git-compare-outline' },
  { key: 'refine', title: 'Fine-tune with A/B choices', time: '3–5 min', sound: true, icon: 'options-outline' },
  { key: 'recipe', title: 'Your sound recipe', time: '', sound: false, icon: 'document-text-outline' },
];

export default function Build() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [open, setOpen] = useState<StepKey | null>(null);
  const scroll = useRef<any>(null);
  useFocusEffect(useCallback(() => { loadProfile().then(setProfile); return () => { player.stop(0.3); }; }, []));

  const update = async (next: Profile) => { setProfile(next); await saveProfile(next); };
  const prog = progress(profile);
  const done = (k: StepKey) => k === 'recipe' ? prog.done >= 3 : (prog.steps as Record<string, boolean>)[k];
  const nextStep = (k: StepKey) => { player.stop(0.4); const i = STEPS.findIndex(s => s.key === k); setOpen(STEPS[i + 1]?.key ?? null); scroll.current?.scrollTo({ y: 0, animated: false }); };

  const resetTests = () => Alert.alert('Redo the listening tests?', 'Your test results and A/B choices will be cleared. Your answers and calibration stay.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Redo', style: 'destructive', onPress: () => update({ ...profile, tests: {}, model: null, rounds: 0, vetoes: [] }) },
  ]);

  return (
    <Screen scrollRef={scroll}>
        <Eyebrow>Still · my sound</Eyebrow>
        <H1>Build my sound</H1>
        <Muted>Do this on a calmer day, with headphones and the volume low. Still asks about you, measures what feels gentle across seven frequency bands, then narrows in on darkness, top end, texture, hum pitch, movement and width. The quiet room then plays your exact sound, quieter, on hard days.</Muted>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.raised }}>
          <View style={{ width: `${(prog.done / prog.total) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
        </View>
        <Muted small>{prog.done} of {prog.total} steps done</Muted>

        {STEPS.map(s => (
          <View key={s.key} style={[styles.card, open === s.key && { borderColor: 'rgba(169,199,155,0.4)' }]}>
            <Pressable accessibilityRole="button" onPressIn={tap} onPress={() => { player.stop(0.3); setOpen(open === s.key ? null : s.key); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: done(s.key) ? 'rgba(169,199,155,0.16)' : colors.surfaceStrong }}>
                <Ionicons name={done(s.key) ? 'checkmark' : s.icon} size={19} color={done(s.key) ? colors.accent : colors.moon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontSize: 16 }}>{s.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{[s.time, s.sound ? 'with sound' : 'no sound'].filter(Boolean).join(' · ')}</Text>
              </View>
              <Ionicons name={open === s.key ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </Pressable>
            {open === s.key && (
              <View style={{ marginTop: 10, gap: 10 }}>
                {s.key === 'about' && <AboutHeadaches profile={profile} onChange={update} />}
                {s.key === 'sensitivities' && <Sensitivities profile={profile} onChange={update} />}
                {s.key === 'likes' && <Likes profile={profile} onChange={update} />}
                {s.key === 'reference' && <Reference profile={profile} onChange={update} />}
                {s.key === 'contour' && <Contour profile={profile} onChange={update} />}
                {s.key === 'tests' && <Tests profile={profile} onChange={update} />}
                {s.key === 'refine' && <Refine profile={profile} onChange={update} />}
                {s.key === 'recipe' && <RecipeCard profile={profile} onChange={update} />}
                {s.key === 'tests' && Object.keys(profile.tests).length > 0 && <Button kind="quiet" label="Redo the listening tests" onPress={resetTests} />}
                {s.key !== 'recipe' && <Button label="Next step →" onPress={() => nextStep(s.key)} />}
              </View>
            )}
          </View>
        ))}
        <Muted small>Preferring a sound is not the same as it reducing pain. Still is for comfort and does not diagnose, treat or prevent migraine.</Muted>
    </Screen>
  );
}
