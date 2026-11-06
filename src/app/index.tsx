// Quiet room: the screen the app opens on. One large control plays the person's own sound; a dark
// screen and a softer version sit beside it. No questions while anything plays; one optional
// check-in afterwards. Sounds are prepared in the background, so pressing play is instant.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StatusBar, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { applyAdjustments, describeRecipe } from '../recipe/recipe.js';
import { clampRecipe } from '../recipe/bounds.js';
import { pendingFollowUp } from '../engine/journal-store.js';
import { freshProfile, lowerState, progress, recipeFor, SOFTER_DB, type Profile, type State } from '../lib/profile';
import { loadJournal, loadProfile, saveJournal, saveProfile, type Session } from '../lib/storage';
import * as player from '../lib/player';
import { Button, Card, Eyebrow, H1, Ionicons, Muted, Screen, Segmented, tap, type IconName } from '../lib/ui';
import { colors } from '../lib/theme';

type Choice = Session['choice'];
type Live = { id: string; at: string; state: State; choice: Choice; startMs: number; levelDb: number | null; worse: boolean };
const STATES: { value: State; label: string; icon: IconName }[] = [
  { value: 'attack', label: 'Headache', icon: 'thunderstorm-outline' },
  { value: 'warning', label: 'Warning', icon: 'cloudy-outline' },
  { value: 'recovering', label: 'Recovering', icon: 'leaf-outline' },
];
const TIMERS = [{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '1 hr' }, { value: '0', label: 'Off' }];

export default function QuietRoom() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [state, setState] = useState<State>('attack');
  const [timer, setTimer] = useState('30');
  const [playing, setPlaying] = useState<Choice | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dark, setDark] = useState(false);
  const [checkFor, setCheckFor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const live = useRef<Live | null>(null);
  const sleep = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    loadProfile().then(setProfile);
    loadJournal().then(j => { const p = pendingFollowUp(j); if (p && !live.current) setCheckFor(p.id); });
  }, []));
  useEffect(() => () => { player.stop(0.5); }, []);

  /** Your recipe for this state, or a softer, darker version of it (never louder, never brighter). */
  const recipes = useMemo(() => {
    const comfort = recipeFor(profile, state).recipe;
    const softer = clampRecipe(applyAdjustments(comfort, { tiltDbPerOct: comfort.tiltDbPerOct - 1.5, cutoffHz: comfort.cutoffHz * 0.6, swellDb: 0, levelOffsetDb: SOFTER_DB }), state, comfort.levelDb);
    return { comfort, softer };
  }, [profile, state]);

  // Prepare both sounds for this state while the screen is idle.
  useEffect(() => { player.prewarm([recipes.comfort, recipes.softer]); }, [recipes]);

  const begin = (choice: Choice, levelDb: number | null) => {
    const at = new Date();
    live.current = { id: `${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: at.toISOString(), state, choice, startMs: Date.now(), levelDb, worse: false };
  };

  const end = async ({ ask = true } = {}) => {
    const s = live.current; live.current = null;
    if (sleep.current) { clearTimeout(sleep.current); sleep.current = null; }
    if (!s) return;
    const durationS = Math.round((Date.now() - s.startMs) / 1000);
    if (durationS < 3 && !s.worse) return;
    const journal = await loadJournal();
    journal.sessions.push({ id: s.id, at: s.at, state: s.state, choice: s.choice, durationS, levelDb: s.levelDb, worse: s.worse, followUp: s.worse ? 'worse' : null });
    if (!(await saveJournal(journal))) setStatus('The phone is not letting Still save the journal.');
    if (ask && !s.worse) setCheckFor(s.id);
  };

  const playSound = async (choice: 'comfort' | 'softer') => {
    const r = recipes[choice];
    // Update the screen first; finish the bookkeeping and loading after.
    setPlaying(choice); setCheckFor(null); setPreparing(true); setStatus('');
    const previous = live.current; live.current = null;
    if (previous) { live.current = previous; end({ ask: false }); }
    begin(choice, r.levelDb);
    try {
      const uri = await player.recipeFile(r);
      if (live.current?.choice !== choice) return;
      await player.play(uri, { levelDb: r.levelDb, fadeIn: r.fadeInS, title: choice === 'softer' ? 'Softer and darker' : 'My sound' });
    } catch {
      setStatus('Could not start the sound on this phone.'); setPlaying(null); live.current = null; setPreparing(false); return;
    }
    setPreparing(false);
    const minutes = Number(timer);
    if (minutes) sleep.current = setTimeout(() => { player.stop(60); setTimeout(() => { end({ ask: false }); setPlaying(null); setStatus('Faded to silence. Rest well.'); }, 61000); }, Math.max(0, minutes - 1) * 60000);
    setStatus(`Fading in over ${r.fadeInS.toFixed(0)} seconds${minutes ? ` · fades out after ${minutes} min` : ''}. Keeps playing with the phone locked.`);
  };

  const stopSound = () => { player.stop(3); setPlaying(null); setPreparing(false); setStatus('Fading to silence.'); end(); };
  const darkOnly = () => { player.stop(2); setPlaying(null); end({ ask: false }); setCheckFor(null); begin('silence', null); setDark(true); };
  const leaveDark = () => { setDark(false); if (live.current?.choice === 'silence') end(); };

  const worse = async () => {
    player.stop(1.5); setPlaying(null); setPreparing(false);
    const s = live.current?.state ?? state;
    if (live.current) live.current.worse = true;
    await end({ ask: false });
    const { profile: next, loweredDb } = lowerState(await loadProfile(), s);
    await saveProfile(next); setProfile(next);
    setStatus(`Stopped. Silence may be best right now.${loweredDb ? ` Next time this state starts ${loweredDb} dB quieter.` : ''} If this headache is new or different, get medical advice.`);
  };

  const answer = async (follow: 'better' | 'same' | 'worse' | 'skipped') => {
    const id = checkFor; setCheckFor(null);
    setStatus(follow === 'skipped' ? 'Okay. Rest well.' : 'Noted. Rest well.');
    const journal = await loadJournal();
    const s = journal.sessions.find(x => x.id === id);
    if (s) { s.followUp = follow; await saveJournal(journal); }
  };

  const changeState = (next: State) => {
    if (playing || live.current) { player.stop(2); setPlaying(null); end({ ask: false }); setStatus('State changed. Press play again to hear it adjusted.'); }
    setState(next);
  };

  const built = progress(profile).done >= 3;
  const d = describeRecipe(recipes.comfort);
  const orbOn = playing === 'comfort' || playing === 'softer';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Still · quiet room</Eyebrow>
        <Ionicons name="moon-outline" size={18} color={colors.moon} />
      </View>
      <H1>How is your head?</H1>
      <Segmented options={STATES} value={state} onChange={changeState} />

      {/* The one big control */}
      <View style={{ alignItems: 'center', paddingVertical: 14, gap: 14 }}>
        <Pressable
          accessibilityRole="button" accessibilityLabel={preparing ? 'Getting ready' : orbOn ? 'Fade to silence' : 'Play my sound'}
          onPressIn={tap} onPress={() => (orbOn ? stopSound() : playSound('comfort'))}
          style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <View style={{ width: 236, height: 236, borderRadius: 118, borderWidth: 1, borderColor: orbOn ? 'rgba(169,199,155,0.55)' : colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(169,199,155,0.05)' }}>
            <View style={{ width: 184, height: 184, borderRadius: 92, alignItems: 'center', justifyContent: 'center', backgroundColor: orbOn ? 'rgba(169,199,155,0.16)' : 'rgba(169,199,155,0.09)', borderWidth: 1, borderColor: 'rgba(169,199,155,0.25)' }}>
              <Ionicons name={orbOn ? 'stop' : 'play'} size={46} color={colors.accent} style={{ marginLeft: orbOn ? 0 : 6 }} />
              <Text style={{ color: colors.ink, fontSize: 15, marginTop: 8 }}>{preparing ? 'Getting ready…' : orbOn ? (playing === 'softer' ? 'Softer · playing' : 'Playing') : 'My sound'}</Text>
            </View>
          </View>
        </Pressable>
        <Text style={{ color: colors.muted, fontSize: 13.5, textAlign: 'center', lineHeight: 20, maxWidth: 320 }}>
          {built
            ? `${d.tilt[0].toUpperCase() + d.tilt.slice(1)}, ${d.texture}. Softened above ${Math.round(recipes.comfort.cutoffHz)} Hz, ${Math.abs(recipes.comfort.levelDb).toFixed(0)} dB below your usual level.`
            : 'A gentle, dark starting sound. Build your own sound on a calmer day.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <RoundAction icon="moon" label="Dark screen" sub="No sound" onPress={darkOnly} />
        <RoundAction icon="water-outline" label="Softer" sub="Darker, 6 dB quieter" active={playing === 'softer'} onPress={() => (playing === 'softer' ? stopSound() : playSound('softer'))} />
      </View>

      {playing && (
        <View style={{ gap: 10 }}>
          <Button label="Dark screen while it plays" icon="contrast-outline" onPress={() => setDark(true)} />
          <Button kind="warn" label="This is making it worse" icon="hand-left-outline" onPress={worse} />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Eyebrow>Fade out after</Eyebrow>
        <Segmented options={TIMERS} value={timer} onChange={setTimer} />
      </View>

      {checkFor && !playing && (
        <Card accent>
          <Text style={{ color: colors.ink, fontSize: 16 }}>Optional: how did that go?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {([['better', 'A bit easier'], ['same', 'About the same'], ['worse', 'Worse'], ['skipped', 'Skip']] as const).map(([k, label]) => (
              <Button key={k} label={label} kind={k === 'skipped' ? 'quiet' : 'outline'} onPress={() => answer(k)} style={{ flexBasis: '47%', flexGrow: 1 }} />
            ))}
          </View>
          <Muted small>How it felt, not proof the sound helped. Headaches also change with time, rest and medicine.</Muted>
        </Card>
      )}

      {status ? <Muted>{status}</Muted> : null}

      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, gap: 6 }}>
        <Muted small>Your sound is made on this phone and nothing leaves it. Still is for comfort; it does not diagnose, treat or prevent migraine. A new, sudden or worst-ever headache, or weakness, numbness, confusion or trouble speaking: get medical help now.</Muted>
      </View>

      <Modal visible={dark} animationType="none" transparent={false} onRequestClose={leaveDark} statusBarTranslucent>
        <StatusBar hidden />
        <Pressable onPress={leaveDark} accessibilityLabel="Dark screen. Tap to come back." style={{ flex: 1, backgroundColor: colors.black, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 48 }}>
          <Text style={{ color: '#161a18', fontSize: 12 }}>Tap to come back</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function RoundAction({ icon, label, sub, onPress, active }: { icon: IconName; label: string; sub: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPressIn={tap} onPress={onPress}
      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: active ? 'rgba(169,199,155,0.55)' : colors.line, backgroundColor: colors.surface }, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}>
      <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }}>
        <Ionicons name={icon} size={20} color={colors.moon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}
