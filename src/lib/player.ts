// Sound playback: render a seamless loop with Still's engine, cache it as a WAV file, play it
// with expo-audio. Volume always ramps (never jumps), and playback continues with the screen locked.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { renderComfortLoop, applyFades } from '../engine/comfort-engine.js';
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
