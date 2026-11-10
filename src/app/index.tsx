// Quiet room: the screen the app opens on. The room is the saved sound's scene; the lamp is the
// only bright thing in it and the only decision (play). Two escapes sit beneath it: Dark screen
// and Softer. No questions while anything plays; one optional check-in afterwards. Sounds are
// prepared in the background, so pressing play is instant.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { applyAdjustments } from '../recipe/recipe.js';
import { clampRecipe } from '../recipe/bounds.js';
import { pendingFollowUp } from '../engine/journal-store.js';
import { freshProfile, lowerState, recipeFor, SOFTER_DB, type Profile, type State } from '../lib/profile';
import { loadJournal, loadOnboarded, loadProfile, loadQuietMode, saveJournal, saveOnboarded, saveProfile, saveQuietMode, type Session } from '../lib/storage';
import { Onboarding } from '../components/Onboarding';
import { textureName } from '../components/Studio';
import * as player from '../lib/player';
import { loadActivity, summarize, track } from '../lib/activity';
import { Button, Caption, Columns, Fade, Greeting, Inert, Ionicons, Label, muteHaptics, Press, Screen, Segmented, Status, useMaterial, useTablet, useWide, type IconName } from '../lib/ui';
import { colors, radius, sceneFor, tabBarStyle, z, type Depth } from '../lib/theme';
import { ease, timing } from '../lib/motion';
import { useWelcomeRedirect } from '../lib/welcome';
import { Lamp, useLampRing, type LampAnchor, type ViewRef } from '../components/room/Lamp';
import { CHECK_IN_HEIGHT, CheckIn } from '../components/room/CheckIn';
import { WorseBar, WORSE_BAR_PAD } from '../components/room/WorseBar';
import { DimVeil } from '../components/room/DimVeil';
import { DarkScreen } from '../components/room/DarkScreen';

type Choice = Session['choice'];
type Live = { id: string; at: string; state: State; choice: Choice; startMs: number; levelDb: number | null; worse: boolean };
// Named by how they sound, not by a diagnosis: people pick whichever feels best right now.
const STATES: { value: State; label: string; icon: IconName; short: string }[] = [
  { value: 'attack', label: 'Hushed', icon: 'moon-outline', short: 'Quietest' },
  { value: 'warning', label: 'Gentle', icon: 'cloudy-outline', short: 'A little quieter' },
  { value: 'normal', label: 'Full', icon: 'sunny-outline', short: 'Normal volume' },
];
// Loudness as depth: the quieter the sound, the lower and darker the room's floor.
const DEPTH: Record<State, Depth> = { attack: 2, warning: 1, recovering: 1, normal: 0 };
const TIMERS = ['30', '60', '15', '0'];
const AUTO_DIM_MS = 15000;
const IDLE_LINE = 'Press when you are ready. It starts in silence.';

export default function QuietRoom() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [state, setState] = useState<State>('attack');
  const [timer, setTimer] = useState('30');
  const [playing, setPlaying] = useState<Choice | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dark, setDark] = useState(false);
  const [checkFor, setCheckFor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [worseNote, setWorseNote] = useState(false);   // the status sentence is the "worse" one: rose hairline, assertive
  const [backedOff, setBackedOff] = useState(false);   // the room stays one step darker for the rest of the visit
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  // Web only: a first visit with no sound set up goes to the landing page once.
  useWelcomeRedirect(onboarded);
  const [helped, setHelped] = useState<{ sound: string; better: number; total: number } | null>(null);
  const [autoDim, setAutoDim] = useState(false);
  const [anchor, setAnchor] = useState<LampAnchor | null>(null);
  const [checkInH, setCheckInH] = useState(CHECK_IN_HEIGHT);
  const live = useRef<Live | null>(null);
  const scroll = useRef<any>(null);
  const lampRef = useRef<ViewRef>(null);
  const lampFocus = useRef<unknown>(null);
  const dimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigation = useNavigation();
  const sleep = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Check-ins waved away this visit (drag, handle, Escape, timeout). Nothing is written for them, so the
  // journal still lists them as pending; this keeps them from rising again on every return to the room.
  const dismissed = useRef(new Set<string>());
  const checkForRef = useRef(checkFor);
  checkForRef.current = checkFor;

  useFocusEffect(useCallback(() => {
    Promise.all([loadProfile(), loadOnboarded()]).then(([p, done]) => {
      setProfile(p);
      // People who set up their sound before the first-run setup existed skip it.
      const already = done || !!p.intake.texture || Object.keys(p.tests).length > 0;
      if (already && !done) saveOnboarded(true);
      setOnboarded(already);
    });
    loadQuietMode().then(m => { if (m === 'attack' || m === 'warning' || m === 'normal') setState(m); });
    loadJournal().then(j => { const p = pendingFollowUp(j); if (p && !live.current && !dismissed.current.has(p.id)) setCheckFor(p.id); });
    loadActivity().then(a => setHelped(summarize(a, 90).helpedMost)).catch(() => {});
  }, []));
  useEffect(() => () => { if (sleep.current) clearTimeout(sleep.current); player.stop(0.5); }, []);

  // While sound plays the screen dims itself after 15 s without a touch; any touch wakes it and nothing else.
  const playingNow = playing === 'comfort' || playing === 'softer';
  const armDim = useCallback(() => {
    if (dimTimer.current) clearTimeout(dimTimer.current);
    setAutoDim(false);
    if (playingNow) dimTimer.current = setTimeout(() => setAutoDim(true), AUTO_DIM_MS);
  }, [playingNow]);
  useEffect(() => { armDim(); return () => { if (dimTimer.current) clearTimeout(dimTimer.current); }; }, [armDim]);
  // Hide the tab bar while dimmed, so the whole screen goes dark.
  const dimmed = autoDim && playingNow && !dark;
  const dimmedRef = useRef(dimmed);
  dimmedRef.current = dimmed;
  // Any activity anywhere in the room counts, not only a touch on the column: the worse bar, the margins,
  // a click, the wheel, a key. While dimmed it does not: the veil takes that first touch and only wakes.
  const activity = useCallback(() => { if (!dimmedRef.current) armDim(); }, [armDim]);
  useEffect(() => {
    if (!playingNow || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const opts = { capture: true, passive: true };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    events.forEach(e => document.addEventListener(e, activity, opts));
    return () => events.forEach(e => document.removeEventListener(e, activity, opts));
  }, [playingNow, activity]);
  // Nothing buzzes while sound plays, on any tab, except the stop and worse presses (haptic="always").
  useEffect(() => { muteHaptics(playingNow); return () => muteHaptics(false); }, [playingNow]);
  const setup = onboarded === false;
  useEffect(() => { navigation.setOptions({ tabBarStyle: dimmed || dark || setup ? { ...tabBarStyle, display: 'none' } : tabBarStyle }); }, [dimmed, dark, setup, navigation]);
  // Where the lamp is, so the veil and the dark screen can draw its ring in the same place.
  const measureLamp = useCallback(() => { lampRef.current?.measureInWindow((x: number, y: number, w: number) => { if (w > 0) setAnchor({ x, y, size: w }); }); }, []);
  useEffect(() => { if (dimmed || dark) measureLamp(); }, [dimmed, dark, measureLamp]);

  /** Your recipe for this state, or a softer, darker version of it (never louder, never brighter). */
  const recipes = useMemo(() => {
    const comfort = recipeFor(profile, state).recipe;
    const softer = clampRecipe({ ...applyAdjustments(comfort, { tiltDbPerOct: comfort.tiltDbPerOct - 1.5, cutoffHz: comfort.cutoffHz * 0.6, swellDb: 0, levelOffsetDb: SOFTER_DB }), textureAmount: comfort.textureAmount * 0.5 }, state, comfort.levelDb);
    return { comfort, softer };
  }, [profile, state]);

  // Prepare both sounds for this state while the screen is idle.
  // Also again when the first-run setup closes: its preview was playing, and background renders
  // never compete with playback, so a sound changed during setup would otherwise not be ready.
  const wasSetup = useRef(false);
  useEffect(() => {
    if (onboarded === null) return;
    const justClosed = wasSetup.current && !setup;
    wasSetup.current = setup;
    player.prewarm([recipes.comfort, recipes.softer], justClosed ? 150 : 700);
  }, [recipes, setup, onboarded]);

  const say = (text: string) => { setStatus(text); setWorseNote(false); };

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
    if (!(await saveJournal(journal))) say('The phone is not letting Still save the journal.');
    if (ask && !s.worse) setCheckFor(s.id);
  };

  const playSound = async (choice: 'comfort' | 'softer') => {
    const r = recipes[choice];
    // Update the screen first; finish the bookkeeping and loading after.
    player.cancelPrewarm(); // never let a background render block the stop button
    setPlaying(choice); setCheckFor(null); setPreparing(true); say('');
    const previous = live.current; live.current = null;
    if (previous) { live.current = previous; end({ ask: false }); }
    begin(choice, r.levelDb);
    track('play', { state, choice, texture: r.texture, tiltDbPerOct: Math.round(r.tiltDbPerOct * 10) / 10, cutoffHz: Math.round(r.cutoffHz), tonal: Math.round(r.tonal * 100) / 100, levelDb: Math.round(r.levelDb), timerMin: Number(timer) });
    try {
      const uri = await player.recipeFile(r);
      if (live.current?.choice !== choice) return;
      await player.play(uri, { levelDb: r.levelDb, fadeIn: r.fadeInS, title: choice === 'softer' ? 'Softer and darker' : 'My sound' });
    } catch {
      say('Could not start the sound on this device.'); setPlaying(null); live.current = null; setPreparing(false); return;
    }
    setPreparing(false);
    const minutes = Number(timer);
    // Both steps live in `sleep`, so a stop, a new sound or leaving the screen cancels the second one too.
    if (minutes) sleep.current = setTimeout(() => { player.stop(60); sleep.current = setTimeout(() => { end({ ask: false }); setPlaying(null); say('Faded to silence. Rest well.'); }, 61000); }, Math.max(0, minutes - 1) * 60000);
    say('Fading in. It keeps playing if you lock the phone.');
  };

  const stopSound = () => {
    player.stop(3); setPlaying(null); setPreparing(false); say('Fading to silence.'); end();
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
    setWorseNote(true); setBackedOff(true);
  };

  const answer = async (follow: 'better' | 'same' | 'worse' | 'skipped') => {
    const id = checkFor; setCheckFor(null);
    track('check_in', { answer: follow, state });
    say(follow === 'skipped' ? 'Okay. Rest well.' : 'Noted. Rest well.');
    const journal = await loadJournal();
    const s = journal.sessions.find(x => x.id === id);
    if (s) { s.followUp = follow; await saveJournal(journal); }
  };
  // Drag-down, the handle or the 90 s timeout: the question just leaves; nothing is written.
  const dismissCheckIn = useCallback(() => {
    const id = checkForRef.current;
    if (id) dismissed.current.add(id);
    setCheckFor(null);
  }, []);

  const changeState = (next: State) => {
    if (playing || live.current) { player.stop(2); setPlaying(null); end({ ask: false }); say('Switched. Press play to hear it.'); }
    track('sound_change', { from: state, to: next });
    setState(next); saveQuietMode(next);
  };
  const cycleTimer = () => { const t = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length]; setTimer(t); track('timer_change', { timerMin: Number(t) }); };

  // The room: the sound's scene, loudness as depth, and the lamp ring mirroring the gain ramp.
  const wide = useWide(), tablet = useTablet();
  const { height } = useWindowDimensions();
  const lampSize = wide ? 320 : tablet ? 280 : height < 700 ? 208 : 232;
  const current = recipes[playing === 'softer' ? 'softer' : 'comfort'];
  const scene = sceneFor(current.texture);
  const sounding = playingNow && !preparing;   // the gain ramp has started
  const fadeInMs = Math.max(1, Math.round(current.fadeInS * 1000));
  const ring = useLampRing({ sounding, fadeInMs });
  const mode = STATES.find(x => x.value === state)!;
  const timerShort = timer === '0' ? 'No timer' : timer === '60' ? '1 hour' : `${timer} min`;
  const timerLabel = timer === '0' ? 'Plays until you stop it' : `Fades out after ${timer === '60' ? '1 hour' : `${timer} minutes`}`;
  const timerSub = timer === '0' ? 'plays until you stop it' : `fades after ${timer === '60' ? '1 hour' : `${timer} min`}`;
  const lampCaption = preparing ? 'Getting ready…' : 'Tap to fade out';
  const line = status || (playingNow ? '' : IDLE_LINE);
  const sub = playingNow ? `${textureName(current.texture)} · ${mode.label} · ${timerSub}` : undefined;

  // Saving the flag happens the moment setup ends (onSaved); this runs once the overlay has lifted.
  const finishSetup = () => { setOnboarded(true); say('Your sound is ready. Press play when you need it.'); };

  const header = (
    <View style={styles.header}>
      <Greeting>Rest here.</Greeting>
      {wide ? null : (
        <Hold show={!playingNow}>
          <TimerPill short={timerShort} label={timerLabel} onPress={cycleTimer} />
        </Hold>
      )}
    </View>
  );
  const lamp = (
    <Lamp size={lampSize} scene={scene} ring={ring} playing={playingNow} preparing={preparing} anchorRef={lampRef} focusRef={lampFocus} onLayout={measureLamp}
      onPress={() => (playingNow ? stopSound() : playSound('comfort'))} />
  );
  const statusLine = <Status sub={sub} worse={worseNote} live={worseNote ? 'assertive' : 'polite'} center={!wide}>{line}</Status>;
  // Loudness is not reachable while sound plays (changing it would stop the sound); Softer is the in-session quieter path.
  const loudness = (
    <Hold show={!playingNow} style={styles.loudness}>
      <Segmented options={STATES} value={state} onChange={changeState} label="Loudness" />
      {helped ? <Caption color={colors.moss} center>{`${helped.sound} has helped you most.`}</Caption> : <Caption center>{mode.short}</Caption>}
    </Hold>
  );
  const escapes = (
    <View style={styles.escapes}>
      {/* Dark screen always stops the sound, so it may buzz; Softer only when it is the stop. */}
      <Button icon="moon" label="Dark screen" sub="Silence" onPress={darkOnly} haptic="always" style={styles.escape} />
      <Button icon="water-outline" label={playing === 'softer' ? 'Playing softer' : 'Softer'} sub="Quieter, darker" on={playing === 'softer'}
        haptic={playing === 'softer' ? 'always' : 'tap'}
        onPress={() => (playing === 'softer' ? stopSound() : playSound('softer'))} style={styles.escape} />
    </View>
  );
  const disclaimer = <Caption color={colors.ink3} center={!wide}>For comfort, not treatment. A sudden, new or worst-ever headache: get medical help.</Caption>;
  const checkInUp = !!checkFor && !playing;
  const checkIn = <CheckIn open={checkInUp} onAnswer={answer} onDismiss={dismissCheckIn} returnFocusRef={lampFocus} onHeight={setCheckInH} />;
  // Covered by the veil or the black: everything beneath is out of reach for touch, keys and screen readers.
  const covered = dimmed || dark;

  const overlay = (
    <>
      {wide ? null : (
        <Inert when={covered} pointerEvents="box-none" style={styles.worseLayer}>
          <WorseBar show={playingNow} onPress={worse} />
        </Inert>
      )}
      {wide ? null : checkIn}
      <DimVeil show={dimmed} onWake={armDim} ring={ring} anchor={anchor} lampSize={lampSize} caption={lampCaption} worseBar={!wide} />
      <DarkScreen show={dark} onLeave={leaveDark} ring={ring} anchor={anchor} lampSize={lampSize} />
      {setup ? <Onboarding profile={profile} onChange={p => { setProfile(p); saveProfile(p); }} onSaved={() => saveOnboarded(true)} onDone={finishSetup} /> : null}
    </>
  );
  // Phone: room to scroll everything clear of the pinned worse bar or the check-in sheet.
  const bottomPad = wide ? 0 : playingNow ? WORSE_BAR_PAD : checkInUp ? checkInH + 12 : 0;

  return (
    // Capture, never claim: every touch start in the room re-arms the auto-dim and then goes on as usual.
    <View style={styles.room} onStartShouldSetResponderCapture={() => { activity(); return false; }}>
      <Screen overlay={overlay} scrollRef={scroll} center texture={scene} depth={DEPTH[state]} playing={sounding} softer={playing === 'softer'} worse={backedOff}
        fadeInMs={fadeInMs} bottomPad={bottomPad} inert={covered}>
        <View style={styles.column}>
          {wide ? (
            <Columns align="center" gap={64} rightWidth={420}
              left={<>{header}{lamp}{statusLine}</>}
              right={<>
                {loudness}
                {escapes}
                <Fade show={playingNow}><Button kind="rose" label="This is making it worse" icon="hand-left-outline" onPress={worse} haptic="always" /></Fade>
                {checkIn}
                <Hold show={!playingNow} style={styles.pillRow}><TimerPill short={timerShort} label={timerLabel} onPress={cycleTimer} /></Hold>
                {disclaimer}
              </>} />
          ) : (
            <>
              {header}
              {lamp}
              {statusLine}
              {loudness}
              {escapes}
              {disclaimer}
            </>
          )}
        </View>
      </Screen>
    </View>
  );
}

/**
 * Cross-fades its controls out while sound plays and keeps their space, so the column never jumps.
 * Once faded the controls unmount: they leave the screen-reader and keyboard order too, because
 * changing loudness or the timer mid-sound would stop it by surprise.
 */
function Hold({ show, style, children }: { show: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const [height, setHeight] = useState(0);
  return (
    <View style={!show && height ? { minHeight: height } : null}
      onLayout={e => { if (show) setHeight(e.nativeEvent.layout.height); }}>
      <Fade show={show} style={style}>{children}</Fade>
    </View>
  );
}

/** The sleep timer, as a 44 pt pill. Its label cross-fades when the value changes; the value itself is set by tap. */
function TimerPill({ short, label, onPress }: { short: string; label: string; onPress: () => void }) {
  const [shown, setShown] = useState(short);
  const pending = useRef<string | null>(null);
  const opacity = useSharedValue(1);
  const swap = useCallback(() => {
    const next = pending.current; pending.current = null;
    if (next != null) setShown(next);
    opacity.set(withTiming(1, { duration: timing.status, easing: ease.enter }));
  }, [opacity]);
  useEffect(() => {
    if (short === shown) return;
    pending.current = short;
    cancelAnimation(opacity);
    opacity.set(withTiming(0, { duration: timing.crossfadeOut, easing: ease.exit }, finished => { if (finished) scheduleOnRN(swap); }));
  }, [short, shown, opacity, swap]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const material = useMaterial();
  return (
    <Press haptic="tick" accessibilityRole="button" accessibilityLabel={`${label}. Change`} onPress={onPress} style={[styles.pill, material.fill]}>
      <Ionicons name="timer-outline" size={16} color={colors.ink2} />
      <Animated.View style={animated}><Label>{shown}</Label></Animated.View>
    </Press>
  );
}

const styles = StyleSheet.create({
  room: { flex: 1 },
  worseLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: z.worseBar },
  column: { gap: 18 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.smoke },
  pillRow: { alignItems: 'flex-start' },
  loudness: { gap: 10 },
  escapes: { flexDirection: 'row', gap: 12 },
  escape: { flex: 1, minWidth: 0 },
});
