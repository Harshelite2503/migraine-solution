// Phone playback with expo-audio. A looping player leaves a short gap each time it jumps back to
// the start, so a looping sound uses two players of the same seamless loop: both play the whole
// time, one silent. Just before the audible one reaches its end, the silent one jumps to the start
// and the two crossfade (equal power, 1.5 s). Nothing is ever paused, so lock-screen controls stay
// right, and if the app's timers are ever held up, each player still loops on its own (with the
// old small gap) instead of going quiet. Volume always ramps, never jumps.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const STEP_MS = 50;
const XFADE_S = 1.5;
const dbToAmp = (db: number) => 10 ** (db / 20);

type Ramp = { from: number; to: number; start: number; ms: number; done?: () => void };
type Rise = { fromDb: number; toDb: number; dbPerSecond: number; start: number };
type Deck = {
  players: AudioPlayer[];       // [audible, silent partner] for loops; one player otherwise
  target: number;               // 0..1 amplitude for this sound
  level: number;                // 0..1 fade-in/fade-out multiplier
  ramp: Ramp | null;
  xfadeStart: number | null;
  rise: Rise | null;            // comfort-contour test: level rising steadily in dB
  timer: ReturnType<typeof setInterval> | null;
};

let deck: Deck | null = null;
let modeReady = false;
let generation = 0;

async function ensureAudioMode() {
  if (modeReady) return;
  try { await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' }); } catch {}
  modeReady = true;
}

function setVolume(p: AudioPlayer, v: number) { try { p.volume = Math.max(0, Math.min(1, v)); } catch {} }

function tick(d: Deck) {
  const now = Date.now();
  if (d.ramp) {
    const r = d.ramp, k = Math.min(1, (now - r.start) / r.ms);
    d.level = r.from + (r.to - r.from) * k;
    if (k >= 1) { d.ramp = null; r.done?.(); }
  }
  if (d.rise) d.target = Math.min(1, dbToAmp(Math.min(d.rise.toDb, d.rise.fromDb + ((now - d.rise.start) / 1000) * d.rise.dbPerSecond)));
  const [cur, next] = d.players;
  const v = d.level * d.target;
  if (!next) { setVolume(cur, v); return; }
  // Start the crossfade just before the audible copy reaches its end.
  const dur = cur.duration, pos = cur.currentTime;
  if (d.xfadeStart === null && dur > 4 * XFADE_S && pos >= dur - XFADE_S - 0.1) {
    try { next.seekTo(0); } catch {}
    d.xfadeStart = now;
  }
  if (d.xfadeStart === null) { setVolume(cur, v); setVolume(next, 0); return; }
  const k = Math.min(1, (now - d.xfadeStart) / (XFADE_S * 1000));
  setVolume(cur, v * Math.cos((k * Math.PI) / 2));
  setVolume(next, v * Math.sin((k * Math.PI) / 2));
  if (k >= 1) { d.players = [next, cur]; d.xfadeStart = null; setVolume(cur, 0); }
}

function startDeck(players: AudioPlayer[], target: number, fadeInS: number, rise: Rise | null = null): Deck {
  const d: Deck = { players, target, level: fadeInS > 0 ? 0 : 1, ramp: null, xfadeStart: null, rise, timer: null };
  if (fadeInS > 0) d.ramp = { from: 0, to: 1, start: Date.now(), ms: fadeInS * 1000 };
  for (const p of players) { setVolume(p, 0); p.play(); }
  tick(d);
  d.timer = setInterval(() => tick(d), STEP_MS);
  return d;
}

/** Start a sound. levelDb is relative to the reference loudness; fades in over fadeIn seconds. */
export async function play(uri: string, { levelDb, fadeIn, loop = true, title = 'Comfort sound' }: { levelDb: number; fadeIn: number; loop?: boolean; title?: string }) {
  const mine = ++generation;
  stop(0.2);
  await ensureAudioMode();
  if (mine !== generation) return;
  const make = () => { const p = createAudioPlayer({ uri }); p.loop = loop; p.volume = 0; return p; };
  const players = loop ? [make(), make()] : [make()];
  deck = startDeck(players, Math.min(1, dbToAmp(levelDb)), fadeIn);
  try { players[0].setActiveForLockScreen(true, { title, artist: 'Still' }); } catch {}
}

/** Fade out and release. Safe to call when nothing is playing. */
export function stop(seconds = 3) {
  const d = deck;
  if (!d) return;
  deck = null;
  d.rise = null;
  d.ramp = {
    from: d.level, to: 0, start: Date.now(), ms: Math.max(1, seconds * 1000),
    done: () => {
      if (d.timer) clearInterval(d.timer);
      for (const p of d.players) {
        try { p.setActiveForLockScreen(false); } catch {}
        try { p.pause(); p.remove(); } catch {}
      }
    },
  };
}

export const isPlaying = () => deck !== null;

/**
 * Play a sound that rises slowly in loudness (even steps in dB) while the person holds a button.
 * Returns a function that stops it and reports the level reached, in dB relative to the reference.
 */
export async function playRising(uri: string, fromDb: number, toDb: number, dbPerSecond: number): Promise<() => number> {
  const mine = ++generation;
  stop(0.1);
  await ensureAudioMode();
  if (mine !== generation) return () => fromDb;
  const p = createAudioPlayer({ uri });
  p.loop = true;
  const rise = { fromDb, toDb, dbPerSecond, start: Date.now() };
  deck = startDeck([p], Math.min(1, dbToAmp(fromDb)), 0, rise);
  const levelNow = () => Math.min(toDb, fromDb + ((Date.now() - rise.start) / 1000) * dbPerSecond);
  return () => { const reached = levelNow(); stop(0.3); return reached; };
}
