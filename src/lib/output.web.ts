// Browser playback with Web Audio: an AudioBufferSourceNode loops sample-accurately, so the
// seamless loop repeats with no gap at all. Volume always ramps, never jumps.
import { samplesFor } from './soundCache.web';
import { encodeWav } from '../engine/wav.js';

const dbToAmp = (db: number) => 10 ** (db / 20);
type Voice = { src: AudioBufferSourceNode; gain: GainNode };

let ctx: AudioContext | null = null;
let voice: Voice | null = null;
let generation = 0;
const buffers = new Map<string, AudioBuffer>();

function context(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

// Browsers only allow sound after a tap, and iPhones mute Web Audio when the silent switch is on.
// On the first tap: wake the audio context, and loop a silent media clip, which moves the phone's
// audio into "playback" mode so the sound is heard regardless of the switch.
let keepAlive: HTMLAudioElement | null = null;
function unlock() {
  try { context().resume().catch(() => {}); } catch {}
  if (!keepAlive) {
    const silence = encodeWav(new Float32Array(4410), new Float32Array(4410), 44100);
    keepAlive = new Audio(URL.createObjectURL(new Blob([silence as Uint8Array<ArrayBuffer>], { type: 'audio/wav' })));
    keepAlive.loop = true;
    keepAlive.play().catch(() => { keepAlive = null; });
  }
}
if (typeof window !== 'undefined') {
  for (const e of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(e, unlock, { passive: true });
}

function bufferFor(key: string): AudioBuffer | null {
  const hit = buffers.get(key);
  if (hit) return hit;
  const s = samplesFor(key);
  if (!s) return null;
  const c = context(), b = c.createBuffer(2, s.left.length, s.rate);
  b.copyToChannel(s.left as Float32Array<ArrayBuffer>, 0);
  b.copyToChannel(s.right as Float32Array<ArrayBuffer>, 1);
  buffers.set(key, b);
  if (buffers.size > 12) buffers.delete(buffers.keys().next().value as string);
  return b;
}

function start(key: string, loop: boolean, gainNow: number): Voice | null {
  const c = context(), b = bufferFor(key);
  if (!b) return null;
  const src = c.createBufferSource(), gain = c.createGain();
  src.buffer = b; src.loop = loop;
  gain.gain.setValueAtTime(gainNow, c.currentTime);
  src.connect(gain).connect(c.destination);
  src.start();
  return { src, gain };
}

/** Start a sound. levelDb is relative to the reference loudness; fades in over fadeIn seconds. */
export async function play(key: string, { levelDb, fadeIn, loop = true }: { levelDb: number; fadeIn: number; loop?: boolean; title?: string }) {
  const mine = ++generation;
  stop(0.2);
  try { await context().resume(); } catch {}
  if (mine !== generation) return;
  const v = start(key, loop, 0);
  if (!v) return;
  const t = context().currentTime;
  v.gain.gain.linearRampToValueAtTime(Math.min(1, dbToAmp(levelDb)), t + Math.max(0.05, fadeIn));
  voice = v;
}

/** Fade out and release. Safe to call when nothing is playing. */
export function stop(seconds = 3) {
  const v = voice;
  if (!v || !ctx) return;
  voice = null;
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.02, seconds));
  try { v.src.stop(t + Math.max(0.02, seconds) + 0.05); } catch {}
}

export const isPlaying = () => voice !== null;

/**
 * Play a sound that rises slowly in loudness (even steps in dB) while the person holds a button.
 * Returns a function that stops it and reports the level reached, in dB relative to the reference.
 */
export async function playRising(key: string, fromDb: number, toDb: number, dbPerSecond: number): Promise<() => number> {
  const mine = ++generation;
  stop(0.1);
  try { await context().resume(); } catch {}
  if (mine !== generation) return () => fromDb;
  const v = start(key, true, Math.min(1, dbToAmp(fromDb)));
  if (!v) return () => fromDb;
  const t = context().currentTime, seconds = Math.max(0.1, (toDb - fromDb) / dbPerSecond);
  v.gain.gain.exponentialRampToValueAtTime(Math.max(1e-4, Math.min(1, dbToAmp(toDb))), t + seconds); // even steps in dB
  voice = v;
  const started = Date.now();
  const levelNow = () => Math.min(toDb, fromDb + ((Date.now() - started) / 1000) * dbPerSecond);
  return () => { const reached = levelNow(); stop(0.3); return reached; };
}
