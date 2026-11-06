// Sound playback: render a seamless loop with Still's engine, cache it as a WAV file, play it
// with expo-audio. Volume always ramps (never jumps), and playback continues with the screen locked.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { renderComfortLoop, applyFades, renderBand } from '../engine/comfort-engine.js';
import { renderOptions } from '../recipe/recipe.js';
import { encodeWav } from '../engine/wav.js';

const RATE = 44100;
const STEP_MS = 50;
const dbToAmp = (db: number) => 10 ** (db / 20);

let player: AudioPlayer | null = null;
let ramp: ReturnType<typeof setInterval> | null = null;
let modeReady = false;
let generation = 0;

async function ensureAudioMode() {
  if (modeReady) return;
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
  modeReady = true;
}

const keyOf = (x: number[], mode: string, clip: boolean) =>
  `${clip ? 'clip' : 'loop'}-${mode}-${x.map(v => Math.round(v * 1000)).join('-')}`;

/** Small stable hash, so each distinct recipe gets its own cached file. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

async function writeOnce(name: string, render: () => { left: Float32Array; right: Float32Array; rate: number }) {
  const file = new File(Paths.cache, name);
  if (file.exists) return file.uri;
  await new Promise(r => setTimeout(r, 16)); // let "Preparing…" paint before heavy work
  const s = render();
  file.create({ overwrite: true });
  await file.write(encodeWav(s.left, s.right, s.rate));
  return file.uri;
}

type RecipeLike = Parameters<typeof renderOptions>[0];

/**
 * Render (or reuse) a recipe as a seamless ~12 s loop, or as a 6 s clip with fades for tests.
 * The loop is long enough for a swell of up to 12 s to repeat cleanly.
 */
export async function recipeFile(recipe: RecipeLike, clip = false, longClip = false): Promise<string> {
  const { x, opts } = renderOptions(recipe);
  const key = hash(JSON.stringify({ x, opts, clip, longClip }));
  return writeOnce(`still-r-${clip ? 'c' : 'l'}-${key}.wav`, () => {
    const s = renderComfortLoop(x, { ...opts, rate: RATE, log2Length: clip && !longClip ? 18 : 19, seed: 21 });
    return clip ? { left: applyFades(s.left, RATE, 0.8), right: applyFades(s.right, RATE, 0.8), rate: RATE } : s;
  });
}

/**
 * Render sounds ahead of time, one at a time, when the app is idle, so pressing play is instant.
 * Rendering a 12 s loop takes a second or more on a phone; cached files are reused across launches.
 */
type WarmItem = RecipeLike | { recipe: RecipeLike; clip: boolean; long?: boolean };
let warmQueue: WarmItem[] = [];
let warming = false;
export function prewarm(recipes: WarmItem[], delayMs = 700) {
  warmQueue = [...recipes];
  if (warming) return;
  warming = true;
  const next = () => {
    const item = warmQueue.shift();
    if (!item || player) { warming = false; return; }   // stop while something plays: never compete with playback
    const job = 'clip' in item && 'recipe' in item ? recipeFile(item.recipe, item.clip, item.long) : recipeFile(item as RecipeLike);
    job.catch(() => {}).finally(() => setTimeout(next, 150));
  };
  setTimeout(next, delayMs);
}

/** Half-octave noise band for the comfort contour. */
export async function bandFile(hz: number): Promise<string> {
  return writeOnce(`still-band-${hz}.wav`, () => renderBand(hz, { rate: RATE, log2Length: 17 }));
}

/** Render (or reuse) a sound file. Loops are ~6 s and seamless; clips are 6 s with fades, for A/B rounds. */
export async function soundFile(x: number[], mode: string, clip = false): Promise<string> {
  const file = new File(Paths.cache, `still-${keyOf(x, mode, clip)}.wav`);
  if (file.exists) return file.uri;
  await new Promise(r => setTimeout(r, 16)); // let the "Preparing…" text paint before heavy work
  const sound = renderComfortLoop(x, { rate: RATE, log2Length: 18, seed: 21, mode });
  const left = clip ? applyFades(sound.left, RATE, 0.8) : sound.left;
  const right = clip ? applyFades(sound.right, RATE, 0.8) : sound.right;
  file.create({ overwrite: true });
  await file.write(encodeWav(left, right, RATE));
  return file.uri;
}

function clearRamp() { if (ramp) { clearInterval(ramp); ramp = null; } }

function rampTo(target: number, seconds: number, done?: () => void) {
  clearRamp();
  const p = player;
  if (!p) { done?.(); return; }
  const start = p.volume, steps = Math.max(1, Math.round((seconds * 1000) / STEP_MS));
  let i = 0;
  ramp = setInterval(() => {
    i++;
    if (player !== p) { clearRamp(); return; }
    p.volume = Math.max(0, Math.min(1, start + ((target - start) * i) / steps));
    if (i >= steps) { clearRamp(); done?.(); }
  }, STEP_MS);
}

/** Start a sound. levelDb is relative to the reference loudness; fades in over fadeIn seconds. */
export async function play(uri: string, { levelDb, fadeIn, loop = true, title = 'Comfort sound' }: { levelDb: number; fadeIn: number; loop?: boolean; title?: string }) {
  const mine = ++generation;
  stop(0.2);
  await ensureAudioMode();
  if (mine !== generation) return;
  const p = createAudioPlayer({ uri });
  p.loop = loop;
  p.volume = 0;
  player = p;
  p.play();
  try { p.setActiveForLockScreen(true, { title, artist: 'Still' }); } catch {}
  rampTo(Math.min(1, dbToAmp(levelDb)), fadeIn);
}

/** Fade out and release. Safe to call when nothing is playing. */
export function stop(seconds = 3) {
  const p = player;
  if (!p) return;
  player = null;
  clearRamp();
  const start = p.volume, steps = Math.max(1, Math.round((seconds * 1000) / STEP_MS));
  let i = 0;
  const t = setInterval(() => {
    i++;
    p.volume = Math.max(0, start * (1 - i / steps));
    if (i >= steps) {
      clearInterval(t);
      try { p.setActiveForLockScreen(false); } catch {}
      try { p.pause(); p.remove(); } catch {}
    }
  }, STEP_MS);
}

export const isPlaying = () => player !== null;

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
  p.loop = true; p.volume = Math.min(1, dbToAmp(fromDb)); player = p; p.play();
  const started = Date.now();
  const levelNow = () => Math.min(toDb, fromDb + ((Date.now() - started) / 1000) * dbPerSecond);
  clearRamp();
  ramp = setInterval(() => { if (player === p) p.volume = Math.min(1, dbToAmp(levelNow())); }, STEP_MS);
  return () => { const reached = levelNow(); stop(0.3); return reached; };
}
