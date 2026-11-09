// Rendering and caching: turn a recipe into a seamless loop with Still's engine, once, and reuse it.
// Where the rendered sound lives is platform-specific (soundCache.ts on phones, soundCache.web.ts in
// the browser); how it is played is in output.ts / output.web.ts.
import { cachedUri, storeSound } from './soundCache';
import { isPlaying } from './output';
import { renderComfortLoop, applyFades, renderBand } from '../engine/comfort-engine.js';
import { renderOptions } from '../recipe/recipe.js';

const RATE = 44100;

const keyOf = (x: number[], mode: string, clip: boolean) =>
  `${clip ? 'clip' : 'loop'}-${mode}-${x.map(v => Math.round(v * 1000)).join('-')}`;

/** Small stable hash, so each distinct recipe gets its own cached file. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

async function writeOnce(name: string, render: () => { left: Float32Array; right: Float32Array; rate: number }) {
  const hit = cachedUri(name);
  if (hit) return hit;
  await new Promise(r => setTimeout(r, 16)); // let "Preparing…" paint before heavy work
  return storeSound(name, render());
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
/** Drop queued background renders, so nothing heavy starts while a person is starting or stopping a sound. */
export function cancelPrewarm() { warmQueue = []; }
export function prewarm(recipes: WarmItem[], delayMs = 700) {
  warmQueue = [...recipes];
  if (warming) return;
  warming = true;
  const next = () => {
    const item = warmQueue.shift();
    if (!item || isPlaying()) { warming = false; return; }   // never compete with playback
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
  return writeOnce(`still-${keyOf(x, mode, clip)}.wav`, () => {
    const sound = renderComfortLoop(x, { rate: RATE, log2Length: 18, seed: 21, mode });
    return clip ? { left: applyFades(sound.left, RATE, 0.8), right: applyFades(sound.right, RATE, 0.8), rate: RATE } : sound;
  });
}
