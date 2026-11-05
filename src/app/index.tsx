// Quiet room: the screen the app opens on. Silence first, then the person's comfort sound, then a
// softer version. No questions while anything plays; one optional check-in afterwards.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { describeX } from '../engine/comfort-engine.js';
import { pendingFollowUp } from '../engine/journal-store.js';
import { champion, DEFAULT_X, fadeInSeconds, freshProfile, levelFor, lowerState, softer, SOFTER_DB, type Profile, type State } from '../lib/profile';
import { loadJournal, loadProfile, saveJournal, saveProfile, type Session } from '../lib/storage';
import * as player from '../lib/player';
import { Button, H1, Muted, Segmented, styles } from '../lib/ui';
import { colors } from '../lib/theme';

type Choice = Session['choice'];
type Live = { id: string; at: string; state: State; choice: Choice; startMs: number; levelDb: number | null; worse: boolean };
const STATES: { value: State; label: string }[] = [
  { value: 'attack', label: 'Headache now' }, { value: 'warning', label: 'Warning signs' }, { value: 'recovering', label: 'Recovering' },
];
const TIMERS = [{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '60', label: '60 min' }, { value: '0', label: 'No timer' }];

export default function QuietRoom() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [state, setState] = useState<State>('attack');
  const [timer, setTimer] = useState('30');
  const [playing, setPlaying] = useState<Choice | null>(null);
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
    await end({ ask: false });
    setCheckFor(null);
    const base = champion(profile) ?? DEFAULT_X;
    const x = choice === 'softer' ? softer(base) : base;
    const levelDb = levelFor(profile, state) + (choice === 'softer' ? SOFTER_DB : 0);
    const fadeIn = fadeInSeconds(profile, state);
    setPlaying(choice);
    setStatus('Preparing…');
    begin(choice, levelDb);
    try {
      const uri = await player.soundFile(x, state);
      if (live.current?.choice !== choice) return;
      await player.play(uri, { levelDb, fadeIn, title: choice === 'softer' ? 'Softer and darker' : 'My comfort sound' });
    } catch {
      setStatus('Could not start the sound on this phone.'); setPlaying(null); live.current = null; return;
    }
    const minutes = Number(timer);
    if (minutes) sleep.current = setTimeout(() => { player.stop(60); setTimeout(() => { end({ ask: false }); setPlaying(null); setStatus('Faded to silence. Rest well.'); }, 61000); }, Math.max(0, minutes - 1) * 60000);
    const what = choice === 'softer' ? 'A softer, darker version' : champion(profile) ? 'Your comfort sound' : 'A gentle, dark default';
    setStatus(`${what} is fading in over ${fadeIn.toFixed(0)} seconds${minutes ? ` and fades out after ${minutes} minutes` : ''}. It keeps playing if you lock the phone. Turn the volume down if it is too much.`);
  };

  const stopSound = async () => { player.stop(3); setPlaying(null); setStatus('Fading to silence.'); await end(); };

  const darkOnly = async () => { player.stop(2); setPlaying(null); await end({ ask: false }); setCheckFor(null); begin('silence', null); setDark(true); };
  const leaveDark = async () => { setDark(false); if (live.current?.choice === 'silence') await end(); };

  const worse = async () => {
    player.stop(1.5); setPlaying(null);
    const s = live.current?.state ?? state;
    if (live.current) live.current.worse = true;
    await end({ ask: false });
    const { profile: next, loweredDb } = lowerState(await loadProfile(), s);
    await saveProfile(next); setProfile(next);
    setStatus(`Stopped. Silence may be best right now.${loweredDb ? ` Next time this state starts ${loweredDb} dB quieter.` : ''} If this headache is new or different, get medical advice.`);
  };

  const answer = async (follow: 'better' | 'same' | 'worse' | 'skipped') => {
    const journal = await loadJournal();
    const s = journal.sessions.find(x => x.id === checkFor);
    if (s) { s.followUp = follow; await saveJournal(journal); }
    setCheckFor(null);
    setStatus(follow === 'skipped' ? 'Okay. Rest well.' : 'Noted. Rest well.');
  };

  const changeState = async (next: State) => {
    if (playing || live.current) { player.stop(2); setPlaying(null); await end({ ask: false }); setStatus('State changed. Press a choice again to hear it adjusted.'); }
    setState(next);
  };

  const tuned = champion(profile);
  const level = levelFor(profile, state);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.screen}>
        <H1>Quiet room</H1>
        <Muted>Nothing plays until you press it. Silence is always fine.</Muted>
        <Segmented options={STATES} value={state} onChange={changeState} />

        <Choice title="Dark screen, no sound" body="Just rest. Tap anywhere to come back." onPress={darkOnly} />
        <Choice title="My comfort sound" active={playing === 'comfort'} onPress={() => playSound('comfort')}
          body={tuned ? `Your tuned sound: ${describeX(tuned).tilt}. Plays ${Math.abs(level).toFixed(0)} dB below your usual level.`
            : `No tuned sound yet, so a gentle, dark default plays ${Math.abs(level).toFixed(0)} dB below the usual level. Tune your sound on a calmer day.`} />
        <Choice title="Softer and darker" active={playing === 'softer'} onPress={() => playSound('softer')} body="Your sound, 6 dB quieter, with a duller top end and no swell." />

        {playing && (
          <View style={{ gap: 10 }}>
            <Button kind="primary" label="■  Fade to silence" onPress={stopSound} />
            <Button label="Dark screen while it plays" onPress={() => setDark(true)} />
            <Button label="This is making it worse" onPress={worse} />
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Muted small>Fade out after</Muted>
          <Segmented options={TIMERS} value={timer} onChange={setTimer} />
        </View>

        {checkFor && !playing && (
          <View style={styles.card}>
            <Text style={{ color: colors.ink, fontSize: 16 }}>Optional: how did that go?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {([['better', 'A bit easier'], ['same', 'About the same'], ['worse', 'Worse'], ['skipped', 'Skip']] as const).map(([k, label]) => (
                <Button key={k} label={label} onPress={() => answer(k)} style={{ flexBasis: '48%', flexGrow: 1 }} />
              ))}
            </View>
            <Muted small>This is how it felt, not proof the sound helped. Headaches also change with time, rest and medicine.</Muted>
          </View>
        )}

        {status ? <Muted>{status}</Muted> : null}

        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14, gap: 6 }}>
          <Muted small>Still is for comfort. It does not diagnose, treat or prevent migraine. A new, sudden or worst-ever headache, or weakness, numbness, confusion or trouble speaking: get medical help now.</Muted>
          <Muted small>Everything is saved only on this phone.</Muted>
        </View>
      </ScrollView>

      <Modal visible={dark} animationType="none" transparent={false} onRequestClose={leaveDark} statusBarTranslucent>
        <StatusBar hidden />
        <Pressable onPress={leaveDark} accessibilityLabel="Dark screen. Tap to come back." style={{ flex: 1, backgroundColor: colors.black, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 48 }}>
          <Text style={{ color: '#1b1f1c', fontSize: 12 }}>Tap to come back</Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Choice({ title, body, onPress, active }: { title: string; body: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, active && { borderColor: colors.ink }, pressed && { opacity: 0.8 }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{body}</Text>
    </Pressable>
  );
}
