// Focused listening tests: an adaptive two-choice search (a bisection staircase) for one setting.
// Each round plays two versions either side of the current best guess, at matched loudness; the
// one that feels calmer pulls the guess toward it and the step halves. About 4–5 rounds pin a
// setting to within a small fraction of its range.

/** The six focused tests, in the order they run. Ranges stay inside bounds.js. */
export const TESTS = [
  { key: 'tilt', title: 'Dark or bright', question: 'Which feels calmer?', scale: 'linear', range: [-9, -2], start: -5.5, step: 2, rounds: 5, unit: 'dB/octave',
    describe: v => (v <= -7 ? 'deeper and darker' : v <= -4.5 ? 'warmer' : 'brighter, more airy') },
  { key: 'cutoff', title: 'How soft the top end is', question: 'Which feels calmer?', scale: 'log', range: [400, 6000], start: 1600, step: 2, rounds: 5, unit: 'Hz',
    describe: v => (v < 900 ? 'very muffled' : v < 2500 ? 'softened' : 'open and clear') },
  { key: 'tonal', title: 'Noise or hum', question: 'Which texture feels calmer?', scale: 'linear', range: [0, 1], start: 0.4, step: 0.3, rounds: 4, unit: '',
    describe: v => (v < 0.2 ? 'more like soft rain' : v < 0.6 ? 'a blend' : 'more like a steady hum') },
  { key: 'humHz', title: 'Hum pitch', question: 'Which hum pitch feels calmer?', scale: 'log', range: [65, 300], start: 140, step: 1.6, rounds: 5, unit: 'Hz',
    describe: v => (v < 100 ? 'deeper' : v < 180 ? 'mid' : 'higher'), skipIf: tests => Number.isFinite(tests.tonal?.value) && tests.tonal.value < 0.1 },
  { key: 'swellDb', title: 'Steady or gently moving', question: 'Which feels calmer?', scale: 'linear', range: [0, 3], start: 1, step: 1, rounds: 4, unit: 'dB',
    describe: v => (v < 0.4 ? 'steady' : v < 1.5 ? 'a faint slow swell' : 'a slow, breathing swell'), skipIf: (_t, intake) => (intake?.bother?.pulse ?? 0) >= 3 },
  { key: 'width', title: 'Narrow or wide', question: 'Which feels calmer?', scale: 'linear', range: [0, 1], start: 0.5, step: 0.35, rounds: 4, unit: '',
    describe: v => (v < 0.3 ? 'centred, in the middle of your head' : v < 0.7 ? 'moderately wide' : 'wide, around you'),
    skipIf: (_t, intake) => intake?.listening === 'speaker' || intake?.listening === 'pillow' },
];

export function testByKey(key) { return TESTS.find(t => t.key === key); }

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Fresh state for a test. */
export function startStaircase(test, start) {
  return { key: test.key, value: clamp(Number.isFinite(start) ? start : test.start, test.range), step: test.step, trials: 0, history: [], done: false };
}

/** The two values to compare this round (lower, higher). */
export function pairFor(test, state) {
  if (test.scale === 'log') return [clamp(state.value / state.step, test.range), clamp(state.value * state.step, test.range)];
  return [clamp(state.value - state.step, test.range), clamp(state.value + state.step, test.range)];
}

/**
 * Record a choice: 'lower' | 'higher' | 'same' | 'neither'. Returns the next state.
 * 'same' keeps the guess and narrows the step; 'neither' (both unpleasant) ends the test early.
 */
export function answer(test, state, choice) {
  const [lo, hi] = pairFor(test, state);
  const next = { ...state, history: [...state.history, { lo, hi, choice }], trials: state.trials + 1 };
  if (choice === 'lower') next.value = test.scale === 'log' ? Math.sqrt(state.value * lo) : (state.value + lo) / 2;
  if (choice === 'higher') next.value = test.scale === 'log' ? Math.sqrt(state.value * hi) : (state.value + hi) / 2;
  if (choice === 'lower' || choice === 'higher') {
    // Move all the way to the chosen side when the guess sits at the edge of the range.
    if (choice === 'lower' && lo === test.range[0]) next.value = lo;
    if (choice === 'higher' && hi === test.range[1]) next.value = hi;
  }
  next.step = test.scale === 'log' ? Math.sqrt(state.step) : state.step / 2;
  next.value = clamp(next.value, test.range);
  next.done = choice === 'neither' || next.trials >= test.rounds;
  return next;
}

/** Final measured value to store on the profile. */
export function result(state) {
  const decisive = state.history.filter(h => h.choice === 'lower' || h.choice === 'higher').length;
  return { value: state.value, trials: state.trials, decisive, at: new Date().toISOString() };
}
