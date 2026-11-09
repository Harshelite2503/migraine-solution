// Quiet room: the screen the app opens on. One large control plays the person's own sound; a dark
// screen and a softer version sit beside it. No questions while anything plays; one optional
// check-in afterwards. Sounds are prepared in the background, so pressing play is instant.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StatusBar, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { applyAdjustments } from '../recipe/recipe.js';
import { clampRecipe } from '../recipe/bounds.js';
import { pendingFollowUp } from '../engine/journal-store.js';
import { freshProfile, lowerState, recipeFor, SOFTER_DB, type Profile, type State } from '../lib/profile';
import { loadJournal, loadOnboarded, loadProfile, loadQuietMode, saveJournal, saveOnboarded, saveProfile, saveQuietMode, type Session } from '../lib/storage';
import { Onboarding } from '../components/Onboarding';
import { textureName } from '../components/Studio';
import * as player from '../lib/player';
import { loadActivity, summarize, track } from '../lib/activity';
import { Button, Card, Ionicons, Screen, Segmented, tap, tick, type IconName, Columns, useWide } from '../lib/ui';
import { colors, tabBarStyle } from '../lib/theme';

type Choice = Session['choice'];
type Live = { id: string; at: string; state: State; choice: Choice; startMs: number; levelDb: number | null; worse: boolean };
// Named by how they sound, not by a diagnosis: people pick whichever feels best right now.
const STATES: { value: State; label: string; icon: IconName; short: string }[] = [
  { value: 'attack', label: 'Hushed', icon: 'moon-outline', short: 'Quietest' },
  { value: 'warning', label: 'Gentle', icon: 'cloudy-outline', short: 'A little quieter' },
  { value: 'normal', label: 'Full', icon: 'sunny-outline', short: 'Normal volume' },
];
const TIMERS = ['30', '60', '15', '0'];
const AUTO_DIM_MS = 15000;
// Very dim text for a dark room during a headache.
const dim = { text: '#a9b3a6', soft: '#7d8a81', faint: '#7d8a81', glow: 'rgba(160,190,150,' };

export default function QuietRoom() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [state, setState] = useState<State>('attack');
  const [timer, setTimer] = useState('30');
  const [playing, setPlaying] = useState<Choice | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dark, setDark] = useState(false);
  const [checkFor, setCheckFor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [helped, setHelped] = useState<{ sound: string; better: number; total: number } | null>(null);
  const [autoDim, setAutoDim] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const live = useRef<Live | null>(null);
  const scroll = useRef<any>(null);
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breath = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  const sleep = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(useCallback(() => {
    Promise.all([loadProfile(), loadOnboarded()]).then(([p, done]) => {
      setProfile(p);
      // People who set up their sound before the first-run setup existed skip it.
      const already = done || !!p.intake.texture || Object.keys(p.tests).length > 0;
      if (already && !done) saveOnboarded(true);
      setOnboarded(already);
    });
    loadQuietMode().then(m => { if (m === 'attack' || m === 'warning' || m === 'normal') setState(m); });
    loadJournal().then(j => { const p = pendingFollowUp(j); if (p && !live.current) setCheckFor(p.id); });
    loadActivity().then(a => setHelped(summarize(a, 90).helpedMost)).catch(() => {});
  }, []));
  useEffect(() => () => { player.stop(0.5); }, []);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // While sound plays: a very slow glow (about 6 breaths a minute) to breathe along with, unless the
  // phone asks for reduced motion; and the screen dims itself after 15 s without a touch.
  const playingNow = playing === 'comfort' || playing === 'softer';
  useEffect(() => {
    if (!playingNow || reduceMotion || autoDim) { breath.stopAnimation(); breath.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 4500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: 5500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [playingNow, reduceMotion, autoDim]);
  const armDim = useCallback(() => {
    if (dimTimer.current) clearTimeout(dimTimer.current);
    setAutoDim(false);
    if (playingNow) dimTimer.current = setTimeout(() => setAutoDim(true), AUTO_DIM_MS);
  }, [playingNow]);
  useEffect(() => { armDim(); return () => { if (dimTimer.current) clearTimeout(dimTimer.current); }; }, [armDim]);
  // Hide the tab bar while dimmed, so the whole screen goes dark.
  const dimmed = autoDim && playingNow && !dark;
  const setup = onboarded === false;
  useEffect(() => { navigation.setOptions({ tabBarStyle: dimmed || dark || setup ? { ...tabBarStyle, display: 'none' } : tabBarStyle }); }, [dimmed, dark, setup, navigation]);

  /** Your recipe for this state, or a softer, darker version of it (never louder, never brighter). */
  const recipes = useMemo(() => {
    const comfort = recipeFor(profile, state).recipe;
    const softer = clampRecipe({ ...applyAdjustments(comfort, { tiltDbPerOct: comfort.tiltDbPerOct - 1.5, cutoffHz: comfort.cutoffHz * 0.6, swellDb: 0, levelOffsetDb: SOFTER_DB }), textureAmount: comfort.textureAmount * 0.5 }, state, comfort.levelDb);
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
    track('stop', { state: s.state, choice: s.choice, durationS, texture: s.choice === 'silence' ? 'silence' : recipes[s.choice].texture, worse: s.worse });
    if (durationS < 3 && !s.worse) return;
    const journal = await loadJournal();
    journal.sessions.push({ id: s.id, at: s.at, state: s.state, choice: s.choice, durationS, levelDb: s.levelDb, worse: s.worse, followUp: s.worse ? 'worse' : null });
    if (!(await saveJournal(journal))) setStatus('The phone is not letting Still save the journal.');
    if (ask && !s.worse) setCheckFor(s.id);
  };

  const playSound = async (choice: 'comfort' | 'softer') => {
    const r = recipes[choice];
    // Update the screen first; finish the bookkeeping and loading after.
    player.cancelPrewarm(); // never let a background render block the stop button
    setPlaying(choice); setCheckFor(null); setPreparing(true); setStatus('');
    const previous = live.current; live.current = null;
    if (previous) { live.current = previous; end({ ask: false }); }
    begin(choice, r.levelDb);
    track('play', { state, choice, texture: r.texture, tiltDbPerOct: Math.round(r.tiltDbPerOct * 10) / 10, cutoffHz: Math.round(r.cutoffHz), tonal: Math.round(r.tonal * 100) / 100, levelDb: Math.round(r.levelDb), timerMin: Number(timer) });
    try {
      const uri = await player.recipeFile(r);
      if (live.current?.choice !== choice) return;
      await player.play(uri, { levelDb: r.levelDb, fadeIn: r.fadeInS, title: choice === 'softer' ? 'Softer and darker' : 'My sound' });
    } catch {
      setStatus('Could not start the sound on this device.'); setPlaying(null); live.current = null; setPreparing(false); return;
    }
    setPreparing(false);
    const minutes = Number(timer);
    if (minutes) sleep.current = setTimeout(() => { player.stop(60); setTimeout(() => { end({ ask: false }); setPlaying(null); setStatus('Faded to silence. Rest well.'); }, 61000); }, Math.max(0, minutes - 1) * 60000);
    setStatus('Fading in. It keeps playing if you lock the phone.');
  };

  const stopSound = () => {
    player.stop(3); setPlaying(null); setPreparing(false); setStatus('Fading to silence.'); end();
    player.prewarm([recipes.comfort, recipes.softer], 8000); // get Softer ready again once things are quiet
  };
  const darkOnly = () => { track('dark_screen', { state }); player.stop(2); setPlaying(null); end({ ask: false }); setCheckFor(null); begin('silence', null); setDark(true); };
  const leaveDark = () => { setDark(false); if (live.current?.choice === 'silence') end(); };

  const worse = async () => {
    player.stop(1.5); setPlaying(null); setPreparing(false);
    const s = live.current?.state ?? state;
    track('worse', { state: s, choice: live.current?.choice ?? null });
    if (live.current) live.current.worse = true;
    await end({ ask: false });
    const { profile: next, loweredDb } = lowerState(await loadProfile(), s);
    await saveProfile(next); setProfile(next);
    setStatus(`Stopped. Silence may be best right now.${loweredDb ? ' Next time it will start quieter.' : ''} If this headache is new or different, get medical advice.`);
  };

  const answer = async (follow: 'better' | 'same' | 'worse' | 'skipped') => {
    const id = checkFor; setCheckFor(null);
    track('check_in', { answer: follow, state });
    setStatus(follow === 'skipped' ? 'Okay. Rest well.' : 'Noted. Rest well.');
    const journal = await loadJournal();
    const s = journal.sessions.find(x => x.id === id);
    if (s) { s.followUp = follow; await saveJournal(journal); }
  };

  const changeState = (next: State) => {
    if (playing || live.current) { player.stop(2); setPlaying(null); end({ ask: false }); setStatus('Switched. Press play to hear it.'); }
    track('sound_change', { from: state, to: next });
    setState(next); saveQuietMode(next);
  };

  const wide = useWide();
  const orbSize = wide ? 340 : 248, coreSize = wide ? 256 : 186;
  const orbOn = playingNow;
  const mode = STATES.find(x => x.value === state)!;
  const timerShort = timer === '0' ? 'No timer' : timer === '60' ? '1 hour' : `${timer} min`;
  const timerLabel = timer === '0' ? 'Plays until you stop it' : `Fades out after ${timer === '60' ? '1 hour' : `${timer} minutes`}`;
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });
  const haloScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  const finishSetup = () => { saveOnboarded(true); setOnboarded(true); setStatus('Your sound is ready. Press play when you need it.'); };
  const dimLayer = setup ? (
    <Onboarding profile={profile} onChange={p => { setProfile(p); saveProfile(p); }} onDone={finishSetup} />
  ) : dark ? (
    // Dark screen: pure black, status bar hidden; one tap comes back.
    <Pressable onPress={leaveDark} accessibilityRole="button" accessibilityLabel="Dark screen. Tap to come back."
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 11, backgroundColor: colors.black, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 48 }}>
      <StatusBar hidden />
      <Text style={{ color: '#161a18', fontSize: 12 }}>Tap to come back</Text>
    </Pressable>
  ) : dimmed ? (
    // Auto-dim while playing: nearly black; any touch brings the screen back (and never stops the sound).
    <Pressable onPress={armDim} accessibilityRole="button" accessibilityLabel="Screen dimmed. Tap to brighten."
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56 }}>
      <Text style={{ color: '#2a312d', fontSize: 12 }}>Tap to brighten</Text>
    </Pressable>
  ) : null;

  return (
    <Screen overlay={dimLayer} scrollRef={scroll} center>
      <View onTouchStart={armDim} style={{ gap: 18 }}>
        <Columns align="center" gap={64} rightWidth={420} left={<>
        <View style={{ gap: 6, marginTop: 8 }}>
          <Text style={{ color: dim.text, fontFamily: 'Georgia', fontSize: wide ? 46 : 30 }}>Rest here.</Text>
          <Text style={{ color: dim.soft, fontSize: 15, lineHeight: 22 }}>Breathe out slowly. Press play when you're ready.</Text>
        </View>

        {/* The one big control */}
        <View style={{ alignItems: 'center', paddingTop: 8, gap: 14 }}>
          <Pressable
            accessibilityRole="button" accessibilityLabel={preparing ? 'Getting ready' : orbOn ? 'Fade to silence' : 'Play my sound'}
            onPressIn={tap} onPress={() => (orbOn ? stopSound() : playSound('comfort'))}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}>
            <View style={{ width: orbSize, height: orbSize, alignItems: 'center', justifyContent: 'center' }}>
              <Animated.View style={{ position: 'absolute', width: orbSize, height: orbSize, borderRadius: orbSize / 2, backgroundColor: `${dim.glow}0.10)`, opacity: orbOn ? haloOpacity : 0.35, transform: [{ scale: orbOn ? haloScale : 1 }] }} />
              <View style={{ width: coreSize, height: coreSize, borderRadius: coreSize / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${dim.glow}0.08)`, borderWidth: 1, borderColor: `${dim.glow}0.22)` }}>
                <Ionicons name={orbOn ? 'pause' : 'play'} size={40} color="#9fbb93" style={{ marginLeft: orbOn ? 0 : 5 }} />
                <Text style={{ color: dim.text, fontSize: 14.5, marginTop: 8 }}>{preparing ? 'Getting ready…' : orbOn ? 'Tap to fade out' : 'My sound'}</Text>
              </View>
            </View>
          </Pressable>
          <Text style={{ color: dim.soft, fontSize: 13, textAlign: 'center' }}>{`${textureName(recipes.comfort.texture)} · ${mode.label} · ${timerShort}`}</Text>
        </View>
        </>} right={<>

        {checkFor && !playing && (
          <Card>
            <Text style={{ color: dim.text, fontSize: 15.5 }}>Optional: how did that go?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {([['better', 'A bit easier'], ['same', 'About the same'], ['worse', 'Worse'], ['skipped', 'Skip']] as const).map(([k, label]) => (
                <Button key={k} label={label} kind={k === 'skipped' ? 'quiet' : 'outline'} onPress={() => answer(k)} style={{ flexBasis: '47%', flexGrow: 1 }} />
              ))}
            </View>
          </Card>
        )}
        {status ? <Text style={{ color: dim.soft, fontSize: 13.5, textAlign: 'center', lineHeight: 20 }}>{status}</Text> : null}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <RoundAction icon="moon" label="Dark screen" sub="Silence" onPress={darkOnly} />
          <RoundAction icon="water-outline" label="Softer" sub="Quieter, darker" active={playing === 'softer'} onPress={() => (playing === 'softer' ? stopSound() : playSound('softer'))} />
        </View>

        {playing && <Button kind="quiet" label="This is making it worse" icon="hand-left-outline" onPress={worse} style={{ borderWidth: 1, borderColor: 'rgba(227,155,131,0.22)' }} />}

        {/* Loudness and timer: always visible, one tap each. */}
        <View style={{ gap: 10 }}>
          <Segmented options={STATES} value={state} onChange={changeState} />
          <Text style={{ color: dim.faint, fontSize: 12.5, textAlign: 'center' }}>
            {helped ? `${helped.sound} has helped you most.` : mode.short}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${timerLabel}. Change`} onPressIn={tick}
            onPress={() => { const t = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]; setTimer(t); track('timer_change', { timerMin: Number(t) }); }} hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.line }}>
            <Ionicons name="timer-outline" size={15} color={dim.soft} />
            <Text style={{ color: dim.soft, fontSize: 13 }}>{timerLabel}</Text>
          </Pressable>
        </View>

        <Text style={{ color: dim.faint, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 6 }}>
          For comfort, not treatment. A sudden, new or worst-ever headache: get medical help.
        </Text>
        </>} />
      </View>

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
