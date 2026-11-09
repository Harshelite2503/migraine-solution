// My sound: two short steps make the sound personal (30 s of taps, then about 3 minutes of
// listening). Everything else is optional, under "Go deeper". Each answer saves as you go.
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { freshProfile, progress, type Profile } from '../lib/profile';
import { loadProfile, saveProfile } from '../lib/storage';
import * as player from '../lib/player';
import { QuickStart, quickDone } from '../components/build/QuickStart';
import { AboutHeadaches, Likes, Sensitivities } from '../components/build/Intake';
import { Contour, Reference } from '../components/build/Calibrate';
import { Tests } from '../components/build/Tests';
import { Refine } from '../components/build/Refine';
import { RecipeCard } from '../components/build/RecipeCard';
import { SupportCard } from '../components/SupportCard';
import { Button, Columns, confirmAction, Eyebrow, H1, H2, Ionicons, Muted, Screen, styles, tap, useWide, type IconName } from '../lib/ui';
import { colors } from '../lib/theme';
import { track } from '../lib/activity';

const CORE_TESTS = ['tilt', 'cutoff', 'tonal'];
const MORE_TESTS = ['humHz', 'swellDb', 'width'];
type StepKey = 'quick' | 'ears' | 'recipe' | 'about' | 'sensitivities' | 'likes' | 'reference' | 'contour' | 'more' | 'refine';
type Step = { key: StepKey; title: string; sub: string; icon: IconName };
const MAIN: Step[] = [
  { key: 'quick', title: 'Quick start', sub: '5 taps · about a minute', icon: 'flash-outline' },
  { key: 'ears', title: 'Tune it by ear', sub: 'About 3 minutes · headphones', icon: 'headset-outline' },
  { key: 'recipe', title: 'Your sound', sub: 'Exact settings, and why', icon: 'document-text-outline' },
];
const DEEPER: Step[] = [
  { key: 'about', title: 'About your headaches', sub: '1 min · no sound', icon: 'help-circle-outline' },
  { key: 'sensitivities', title: 'Sounds that bother you', sub: '1 min · no sound', icon: 'ear-outline' },
  { key: 'likes', title: 'Likes and dislikes', sub: '1 min · no sound', icon: 'heart-outline' },
  { key: 'reference', title: 'Quiet reference volume', sub: '30 s · with sound', icon: 'volume-low-outline' },
  { key: 'contour', title: 'Comfort across 7 bands', sub: '2 min · with sound', icon: 'stats-chart-outline' },
  { key: 'more', title: 'Hum pitch, movement, width', sub: '3 min · with sound', icon: 'git-compare-outline' },
  { key: 'refine', title: 'Fine-tune with A/B choices', sub: '3–5 min · with sound', icon: 'options-outline' },
];

export default function MySound() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [open, setOpen] = useState<StepKey | null>(null);
  const [deeper, setDeeper] = useState(false);
  const wide = useWide();
  const scroll = useRef<any>(null);
  useFocusEffect(useCallback(() => {
    loadProfile().then(p => { setProfile(p); setOpen(o => o ?? (quickDone(p) ? null : 'quick')); });
    return () => { player.stop(0.3); };
  }, []));

  const update = async (next: Profile) => { setProfile(next); await saveProfile(next); };
  const prog = progress(profile);
  const testsDone = (keys: string[]) => keys.every(k => (profile.tests as any)[k]);
  const done: Record<StepKey, boolean> = {
    quick: quickDone(profile), ears: testsDone(CORE_TESTS), recipe: false,
    about: prog.steps.about, sensitivities: prog.steps.sensitivities, likes: prog.steps.likes,
    reference: prog.steps.reference, contour: prog.steps.contour, more: testsDone(MORE_TESTS), refine: prog.steps.refine,
  };

  const resetTests = () => confirmAction('Redo the listening tests?', 'Your test results and A/B choices will be cleared. Your answers stay.', 'Redo',
    () => update({ ...profile, tests: {}, model: null, rounds: 0, vetoes: [] }));

  const body = (k: StepKey) => (
    <View style={{ marginTop: 10, gap: 10 }}>
      {k === 'quick' && <QuickStart profile={profile} onChange={update} />}
      {k === 'ears' && <Tests profile={profile} onChange={update} keys={CORE_TESTS} />}
      {k === 'recipe' && <RecipeCard profile={profile} onChange={update} />}
      {k === 'about' && <AboutHeadaches profile={profile} onChange={update} />}
      {k === 'sensitivities' && <Sensitivities profile={profile} onChange={update} />}
      {k === 'likes' && <Likes profile={profile} onChange={update} />}
      {k === 'reference' && <Reference profile={profile} onChange={update} />}
      {k === 'contour' && <Contour profile={profile} onChange={update} />}
      {k === 'more' && <Tests profile={profile} onChange={update} keys={MORE_TESTS} />}
      {k === 'refine' && <Refine profile={profile} onChange={update} />}
      {k === 'quick' && done.quick && <Button kind="primary" label="Done" onPress={() => { setOpen('ears'); scroll.current?.scrollTo({ y: 0, animated: false }); }} />}
      {(k === 'ears' || k === 'more') && Object.keys(profile.tests).length > 0 && <Button kind="quiet" label="Redo the listening tests" onPress={resetTests} />}
    </View>
  );

  const row = (s: Step) => (
    <View key={s.key} style={[styles.card, open === s.key && { borderColor: 'rgba(169,199,155,0.35)' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={s.title} accessibilityState={{ expanded: open === s.key }} onPressIn={tap}
        onPress={() => { player.stop(0.3); if (open !== s.key) track('step_open', { step: s.key }); setOpen(open === s.key ? null : s.key); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: done[s.key] ? 'rgba(169,199,155,0.14)' : colors.surfaceStrong }}>
          <Ionicons name={done[s.key] ? 'checkmark' : s.icon} size={19} color={done[s.key] ? colors.accent : colors.moon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 16 }}>{s.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{s.sub}</Text>
        </View>
        <Ionicons name={open === s.key ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open === s.key && body(s.key)}
    </View>
  );

  return (
    <Screen scrollRef={scroll}>
      <Columns left={<>
      <Eyebrow>Still · my sound</Eyebrow>
      <H1>Make it yours</H1>
      <Muted>Two short steps, best on a calmer day. Everything stays on this device.</Muted>
      {MAIN.map(row)}
      <Pressable accessibilityRole="button" accessibilityLabel="Go deeper (optional)" accessibilityState={{ expanded: deeper }} onPressIn={tap} onPress={() => setDeeper(!deeper)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Go deeper (optional)</Text>
        <Ionicons name={deeper ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {deeper && DEEPER.map(row)}
      </>} right={<>
      {wide && <HowItWorks />}
      <SupportCard />
      <Muted small>Preferring a sound is not the same as it reducing pain. Still is for comfort and does not diagnose, treat or prevent migraine.</Muted>
      </>} />
    </Screen>
  );
}

/** Desktop-only side panel: what the setup does, in three steps. */
function HowItWorks() {
  const steps: [IconName, string, string][] = [
    ['flash-outline', 'Tell it what hurts', 'Five taps about the sounds that bother you during a headache.'],
    ['headset-outline', 'Choose by ear', 'Short "which feels calmer?" choices tune how dark, soft and steady your sound is.'],
    ['moon-outline', 'Press play in the dark', 'One button, a sound made for you, and a screen that dims itself.'],
  ];
  return (
    <View style={[styles.card, { gap: 16 }]}>
      <H2>How it works</H2>
      {steps.map(([icon, title, body]) => (
        <View key={title} style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }}>
            <Ionicons name={icon} size={18} color={colors.moon} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 15 }}>{title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{body}</Text>
          </View>
        </View>
      ))}
      <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 18 }}>Your answers and your sound stay on this device.</Text>
    </View>
  );
}
