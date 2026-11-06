// Recipe layer: safety limits always win; answers, tests and learning move the sound as intended.
import assert from 'node:assert/strict';
import { buildRecipe, applyAdjustments, settingsFromX, xFromSettings, renderOptions } from '../src/recipe/recipe.js';
import { clampRecipe, safeHarmonics, BOUNDS } from '../src/recipe/bounds.js';
import { TESTS, testByKey, startStaircase, pairFor, answer, result } from '../src/recipe/staircase.js';
import { EVIDENCE } from '../src/recipe/evidence.js';
import { renderComfortLoop } from '../src/engine/comfort-engine.js';

const empty = { intake: {}, tests: {}, calibration: {}, trims: {}, baseLevelDb: 0 };

// Harder states are never louder; attack is at least 14 dB down.
const levels = Object.fromEntries(['normal', 'warning', 'attack', 'recovering'].map(s => [s, buildRecipe(empty, s).recipe.levelDb]));
assert.ok(levels.attack <= levels.normal - 14);
assert.ok(levels.warning < levels.normal && levels.recovering < levels.normal);

// Sound as worst symptom → extra 6 dB quieter in attacks; anxiety → 3 more.
const sensitive = { ...empty, intake: { worstSymptom: 'sound', anxietyDuringAttacks: 2 } };
assert.equal(buildRecipe(sensitive, 'attack').recipe.levelDb, levels.attack - 9);

// Hiss bother → darker and softer top; pulse bother → steady; dizziness → narrow.
const hiss = buildRecipe({ ...empty, intake: { bother: { high: 4, pulse: 3 }, dizziness: 3 } }, 'normal').recipe;
const plain = buildRecipe(empty, 'normal').recipe;
assert.ok(hiss.tiltDbPerOct < plain.tiltDbPerOct);
assert.ok(hiss.cutoffHz < plain.cutoffHz);
assert.equal(hiss.swellDb, 0);
assert.ok(hiss.width <= 0.2);
assert.ok(hiss.eq.some(e => e.hz === 3500 && e.gainDb < 0), 'presence region softened');

// Measured tests win over estimates; learned A/B wins over tests once it has 4+ rounds.
const measured = buildRecipe({ ...empty, tests: { tilt: { value: -3.2, trials: 5 }, humHz: { value: 146.8, trials: 5 } } }, 'normal');
assert.equal(measured.recipe.tiltDbPerOct, -3.2);
assert.equal(measured.recipe.humHz, 146.8);
assert.ok(measured.why.some(w => w.param === 'tiltDbPerOct' && w.source === 'measured'));
const learned = buildRecipe({ ...empty, tests: { tilt: { value: -3.2, trials: 5 } } }, 'normal', { learned: [0.1, 0.2, 0, 0.5], learnedRounds: 6 });
assert.ok(Math.abs(learned.recipe.tiltDbPerOct - settingsFromX([0.1, 0.2, 0, 0.5]).tiltDbPerOct) < 1e-9);

// Natural textures: picked by ear wins; otherwise from loved sounds; a disliked sound vetoes it.
assert.equal(buildRecipe({ ...empty, intake: { texture: 'ocean' } }, 'normal').recipe.texture, 'ocean');
assert.equal(buildRecipe({ ...empty, intake: { loves: ['fan'] } }, 'normal').recipe.texture, 'fan');
assert.equal(buildRecipe({ ...empty, intake: { texture: 'rain', dislikes: ['rain'] } }, 'normal').recipe.texture, 'none');
const rainAttack = buildRecipe({ ...empty, intake: { texture: 'rain', bother: { sudden: 3 } } }, 'attack').recipe;
const rainNormal = buildRecipe({ ...empty, intake: { texture: 'rain' } }, 'normal').recipe;
assert.ok(rainAttack.textureAmount < rainNormal.textureAmount && rainAttack.gentleEvents);
for (const t of ['rain', 'ocean', 'fan']) {
  const r = buildRecipe({ ...empty, intake: { texture: t } }, 'attack').recipe;
  const { x, opts } = renderOptions(r);
  const s = renderComfortLoop(x, { ...opts, rate: 44100, log2Length: 16, seed: 4 });
  const peak = s.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak <= 0.35 + 1e-9, `${t} peak within limit`);
  assert.ok(s.left.every(Number.isFinite), `${t} renders`);
}

// A disliked category vetoes a measured value.
const vetoHum = buildRecipe({ ...empty, intake: { dislikes: ['hum'] }, tests: { tonal: { value: 0.05, trials: 4 } } }, 'normal');
assert.equal(vetoHum.recipe.tonal, 0);
assert.ok(vetoHum.why.some(w => w.param === 'tonal' && w.source === 'rule'));

// Round trip between recipe settings and the learner space.
const s = { tiltDbPerOct: -6.1, tonal: 0.3, swellDb: 1.2, cutoffHz: 1800 };
const back = settingsFromX(xFromSettings(s));
for (const k of Object.keys(s)) assert.ok(Math.abs(back[k] - s[k]) < 1e-9, k);

// Roughness guard: higher hums use fewer harmonics, always ≥ 2 and all below ~1 kHz.
assert.equal(safeHarmonics(110), 9);
assert.equal(safeHarmonics(300), 3);
assert.equal(safeHarmonics(600), 2);

// The AI review can only make things quieter, darker-or-equal within limits, never boost EQ.
const base = buildRecipe(empty, 'attack').recipe;
const pushed = applyAdjustments(base, { levelOffsetDb: +20, fadeInS: 1, extraCuts: [{ hz: 4000, gainDb: +6 }], swellDb: 9, humHz: 1000, tiltDbPerOct: 5 });
const safe = clampRecipe(pushed, 'attack', base.levelDb);
assert.equal(safe.levelDb, base.levelDb, 'louder request ignored');
assert.ok(safe.fadeInS >= base.fadeInS, 'shorter fade ignored');
assert.ok(safe.eq.every(e => e.gainDb <= 0), 'no boosts');
assert.ok(safe.swellDb <= 1, 'attack swell cap');
assert.ok(safe.humHz <= BOUNDS.humHz[1] && safe.tiltDbPerOct <= BOUNDS.tiltDbPerOct[1]);
// Without consent, a stored AI review is ignored.
const withAi = buildRecipe({ ...empty, consentAI: false, aiReview: { adjustments: { levelOffsetDb: -10 } } }, 'attack').recipe;
assert.equal(withAi.levelDb, base.levelDb);
const withConsent = buildRecipe({ ...empty, consentAI: true, aiReview: { adjustments: { levelOffsetDb: -10 }, rationale: [{ param: 'levelDb', why: 'test' }] } }, 'attack');
assert.equal(withConsent.recipe.levelDb, base.levelDb - 10);
assert.ok(withConsent.why.some(w => w.source === 'ai'));

// Every rationale cites known evidence.
for (const w of [...hiss && buildRecipe(sensitive, 'attack').why, ...measured.why]) for (const e of w.evidence) assert.ok(EVIDENCE[e], e);

// The recipe renders: exact hum pitch reaches the engine, width 0 gives identical channels.
const mono = { ...base, tonal: 0.6, humHz: 146.8, width: 0 };
const { x, opts } = renderOptions(mono);
const loop = renderComfortLoop(x, { ...opts, rate: 44100, log2Length: 16, seed: 2 });
assert.equal(loop.params.toneHz, 146.8);
let diff = 0; for (let i = 0; i < loop.left.length; i += 97) diff = Math.max(diff, Math.abs(loop.left[i] - loop.right[i]));
assert.ok(diff < 1e-6, 'width 0 is mono');

// Staircases converge toward a simulated listener's preference.
for (const test of TESTS) {
  const target = test.scale === 'log' ? Math.sqrt(test.range[0] * test.range[1]) * 1.3 : test.range[0] + 0.7 * (test.range[1] - test.range[0]);
  let st = startStaircase(test);
  while (!st.done) {
    const [lo, hi] = pairFor(test, st);
    const dist = v => (test.scale === 'log' ? Math.abs(Math.log(v / target)) : Math.abs(v - target));
    st = answer(test, st, dist(lo) < dist(hi) ? 'lower' : 'higher');
  }
  const err = test.scale === 'log' ? Math.abs(Math.log(st.value / target)) : Math.abs(st.value - target) / (test.range[1] - test.range[0]);
  assert.ok(err < 0.25, `${test.key} converged (${st.value.toFixed(2)} vs ${target.toFixed(2)})`);
  assert.equal(result(st).trials, test.rounds);
}
// "Both unpleasant" ends a test early.
assert.ok(answer(testByKey('tilt'), startStaircase(testByKey('tilt')), 'neither').done);
// The AI review summary carries no sensitive answers that sound tuning does not need.
import('../src/recipe/review.js').then(({ buildReviewRequest }) => {
  const sent = JSON.stringify(buildReviewRequest({ ...empty, intake: { aura: true, attacksPerMonth: '15+', currentlyHelps: ['music'], anxietyDuringAttacks: 1, dizziness: 1, worstSymptom: 'pain', bother: { high: 2 } } }, { normal: plain, attack: base }, null));
  for (const word of ['aura', 'attacksPerMonth', 'currentlyHelps', 'anxietyDuringAttacks', 'dizziness', 'worstSymptom', '15+']) assert.ok(!sent.includes(word), word);
  assert.ok(sent.includes('"soundBother":{"high":2}'));
  console.log('recipe ok');
});
