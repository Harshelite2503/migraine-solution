// The sound recipe layer: turns a person's answers, calibration, listening tests, learned
// preferences, feedback and (optionally) an AI review into one exact sound, with a reason for
// every number. Pure functions, no device APIs, so it runs in the app, on the server and in tests.
//
// Precedence for each setting, highest first:
//   1. Hard safety limits and the listening state (bounds.js): never overridden.
//   2. AI review adjustments, only if the person opted in, and only inside the limits.
//   3. Learned from A/B fine-tuning (4+ choices).
//   4. Measured by that setting's focused listening test.
//   5. Estimated from the questionnaire, using the research in evidence.js.
//   6. Defaults.

import { MODES, contourEqDb, contourCeilingDb } from '../engine/comfort-engine.js';
import { BOUNDS, clampRecipe, safeHarmonics } from './bounds.js';
import { EVIDENCE } from './evidence.js';

export const RECIPE_VERSION = 1;
export const STATES = ['normal', 'warning', 'attack', 'recovering'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const has = (list, x) => Array.isArray(list) && list.includes(x);
const n04 = v => (Number.isFinite(v) ? clamp(v, 0, 4) : 0);

/** Point in the 4-D learner space (see comfort-engine paramsFromX) → recipe settings. */
export function settingsFromX(x) {
  return {
    tiltDbPerOct: -9 + 7.5 * x[0],
    tonal: x[1],
    swellDb: 6 * x[2],
    cutoffHz: 300 * 20 ** x[3],
  };
}
/** Recipe settings → point in the learner space. */
export function xFromSettings(s) {
  return [
    clamp((s.tiltDbPerOct + 9) / 7.5, 0, 1),
    clamp(s.tonal, 0, 1),
    clamp(s.swellDb / 6, 0, 1),
    clamp(Math.log(s.cutoffHz / 300) / Math.log(20), 0, 1),
  ];
}

/**
 * Build the recipe for one listening state.
 * @param {object} profile see src/lib/profile.ts (Profile)
 * @param {'normal'|'warning'|'attack'|'recovering'} state
 * @param {{ learned?: number[]|null, learnedRounds?: number }} [extra] the A/B learner's favourite
 */
export function buildRecipe(profile, state = 'attack', extra = {}) {
  const intake = profile.intake || {};
  const bother = intake.bother || {};
  const tests = profile.tests || {};
  const mode = MODES[state] || MODES.normal;
  const why = [];
  const note = (param, value, source, text, evidence) => why.push({ param, value, source, text, evidence });

  // ---- Spectral tilt (how dark or bright) ----
  let tilt, tiltSource;
  if (Number.isFinite(tests.tilt?.value)) {
    tilt = tests.tilt.value; tiltSource = 'measured';
    note('tiltDbPerOct', tilt, 'measured', `You chose this darkness in ${tests.tilt.trials} side-by-side comparisons.`, ['personal', 'hongisto2015']);
  } else {
    tilt = -6 - 0.9 * n04(bother.high) + 0.6 * n04(bother.low);
    tiltSource = 'estimated';
    note('tiltDbPerOct', tilt, 'estimated',
      bother.high >= 2 ? 'Hissy, high sounds bother you, so the sound starts darker than brown noise.'
        : bother.low >= 2 ? 'Low rumble bothers you, so the sound starts a little brighter.'
        : 'Starts near brown noise; the darkness test will measure your own preference.',
      ['hongisto2015', 'mourgela2023']);
  }

  // ---- Top-end softness (low-pass corner) ----
  let cutoff;
  if (Number.isFinite(tests.cutoff?.value)) {
    cutoff = tests.cutoff.value;
    note('cutoffHz', cutoff, 'measured', `Sound above about ${Math.round(cutoff)} Hz is softened, from your top-end test.`, ['personal', 'kumar2008']);
  } else {
    cutoff = bother.high >= 2 ? 1200 : 2500;
    note('cutoffHz', cutoff, 'estimated', 'Sound above this frequency is softened; unpleasantness concentrates at 2.5–5.5 kHz.', ['kumar2008']);
  }

  // ---- Texture: noise vs hum ----
  let tonal;
  if (Number.isFinite(tests.tonal?.value)) {
    tonal = tests.tonal.value;
    note('tonal', tonal, 'measured', 'Balance of soft noise and steady hum, from your texture test.', ['personal']);
  } else if (has(intake.dislikes, 'hum') || n04(bother.low) >= 3) {
    tonal = 0;
    note('tonal', tonal, 'estimated', 'You dislike hums or low rumble, so this is pure soft noise.', ['ichd3']);
  } else if (has(intake.loves, 'hum') || has(intake.loves, 'bowls')) {
    tonal = 0.5;
    note('tonal', tonal, 'estimated', 'You like hums and bowls, so half the sound is a steady hum.', ['aras']);
  } else {
    // No hum unless you ask for it: in our comfort test, adding a hum made the sound less pleasant.
    tonal = 0;
    note('tonal', tonal, 'default', 'Pure soft noise, no hum. A hum made the sound less pleasant in our comfort tests; you can add one in the noise-or-hum test.', ['stillLab2026']);
  }

  // A category you can't stand always wins, even over a test result (a veto, not a preference).
  if (has(intake.dislikes, 'hum') && tonal > 0) {
    tonal = 0;
    note('tonal', 0, 'rule', 'No hum at all, because you said you can\'t stand hums or drones.', []);
  }

  // ---- Hum pitch and harmonics ----
  let humHz;
  if (Number.isFinite(tests.humHz?.value)) {
    humHz = tests.humHz.value;
    note('humHz', humHz, 'measured', `Hum pitch ${humHz.toFixed(1)} Hz, from your pitch test.`, ['personal']);
  } else {
    humHz = n04(bother.low) >= 2 ? 165 : 110;
    note('humHz', humHz, 'estimated', n04(bother.low) >= 2 ? 'A higher hum, because deep rumble bothers you.' : 'A low, warm hum (A2, 110 Hz).', ['mourgela2023']);
  }
  const harmonics = safeHarmonics(humHz, tests.harmonics?.value ?? 16);
  note('harmonics', harmonics, 'rule', `Only the first ${harmonics} harmonics are used, all below about 1 kHz, so no partials beat against each other (roughness).`, ['roughness']);

  // ---- Movement: slow swell ----
  let swellDb, swellPeriodS = 10;
  if (Number.isFinite(tests.swellDb?.value)) {
    swellDb = tests.swellDb.value;
    note('swellDb', swellDb, 'measured', 'Depth of the slow rise and fall, from your movement test.', ['personal', 'virjonen2019']);
  } else {
    swellDb = n04(bother.pulse) >= 2 ? 0 : 0.5;
    note('swellDb', swellDb, 'estimated', n04(bother.pulse) >= 2 ? 'Completely steady, because pulsing sounds bother you.' : 'Almost steady, with a barely noticeable slow swell.', ['virjonen2019']);
  }
  if (Number.isFinite(tests.swellPeriodS?.value)) swellPeriodS = tests.swellPeriodS.value;
  note('swellPeriodS', swellPeriodS, 'rule', `One swell every ${swellPeriodS.toFixed(0)} seconds or slower; faster fluctuation (1–16 Hz) adds annoyance like extra loudness.`, ['virjonen2019']);

  // ---- Stereo width ----
  let width;
  const multisensory = (intake.otherSensitivities || []).length;
  if (Number.isFinite(tests.width?.value)) {
    width = tests.width.value;
    note('width', width, 'measured', 'Stereo width from your width test.', ['personal']);
  } else if (n04(intake.dizziness) >= 2 || has(intake.otherSensitivities, 'motion')) {
    width = 0.15;
    note('width', width, 'estimated', 'Narrow and centred, because you get dizzy or motion-sensitive.', ['jaimes2025']);
  } else if (intake.listening === 'speaker' || intake.listening === 'pillow') {
    width = 0.3;
    note('width', width, 'estimated', 'Narrow, since a speaker blends left and right anyway.', []);
  } else {
    width = 0.6;
    note('width', width, 'default', 'A natural, moderately wide image for headphones.', []);
  }

  // ---- Learned A/B favourite overrides the four learner dimensions once it has enough data ----
  if (extra.learned && (extra.learnedRounds ?? 0) >= 4) {
    const l = settingsFromX(extra.learned);
    tilt = l.tiltDbPerOct; tonal = l.tonal; swellDb = l.swellDb; cutoff = l.cutoffHz;
    for (const k of ['tiltDbPerOct', 'tonal', 'swellDb', 'cutoffHz']) {
      note(k, l[k], 'learned', `Fine-tuned from ${extra.learnedRounds} "which felt calmer?" choices.`, ['personal', 'nielsen2015']);
    }
  }

  // ---- Natural texture: rain, ocean or fan, chosen by ear or from the sounds you love ----
  const TEXTURE_LOVES = { rain: ['rain'], ocean: ['ocean', 'stream'], fan: ['fan'] };
  const hates = t => (TEXTURE_LOVES[t] || []).some(c => has(intake.dislikes, c));
  let texture = 'none';
  if (['none', 'rain', 'ocean', 'fan'].includes(intake.texture) && !hates(intake.texture)) {
    texture = intake.texture;
    if (texture !== 'none') note('texture', texture, 'measured', `A ${texture} texture, which you picked by ear.`, ['personal', 'buxton2021']);
  } else {
    texture = ['rain', 'ocean', 'fan'].find(t => TEXTURE_LOVES[t].some(c => has(intake.loves, c)) && !hates(t)) || 'none';
    if (texture !== 'none') note('texture', texture, 'estimated', `A ${texture} texture, because you said you find it soothing.`, ['buxton2021', 'arausWater']);
    else if (!hates('rain')) {
      // Nothing picked yet: soft rain, the most comfortable of Still's sounds in our tests.
      texture = 'rain';
      note('texture', texture, 'default', 'Soft rain, which scored as the most comfortable of Still\'s sounds. Pick another texture any time.', ['stillLab2026', 'buxton2021']);
    }
  }
  // Softer in harder states; rain droplets softer still if sudden sounds bother you.
  let textureAmount = state === 'attack' ? 0.35 : state === 'normal' ? 0.6 : 0.45;
  const gentleEvents = n04(bother.sudden) >= 2;
  if (texture === 'rain' && gentleEvents) textureAmount *= 0.7;
  if (texture === 'ocean' && state !== 'normal') note('texture', 'calm sea', 'rule', 'Waves are kept shallow in this state: slow, gentle changes in loudness, never fast ones.', ['virjonen2019']);
  if (texture === 'rain' && gentleEvents) note('texture', 'soft rain', 'rule', 'Raindrops are softened and spread out, because sudden sounds bother you.', ['ambrosini2003']);

  // ---- Personal EQ: contour cuts plus a presence soften ----
  const eq = [];
  const contour = profile.calibration?.contour || [];
  if (contour.length >= 3) {
    for (const b of contour) eq.push({ hz: b.hz, gainDb: contourEqDb(b.hz, contour) });
    const cut = eq.filter(e => e.gainDb < -0.5).map(e => `${e.hz >= 1000 ? `${e.hz / 1000} kHz` : `${e.hz} Hz`} ${e.gainDb.toFixed(0)} dB`);
    note('eq', cut.length ? cut.join(', ') : 'flat', 'measured', cut.length ? 'Bands you marked less comfortable are turned down.' : 'Your comfort contour was even, so no band is cut.', ['personal', 'mourgela2023']);
  }
  const presence = n04(bother.high) >= 2 || state === 'attack' ? (state === 'attack' ? -6 : -4) : 0;
  if (presence) {
    for (const hz of [2500, 3500, 5000]) {
      const existing = eq.find(e => e.hz === hz);
      if (existing) existing.gainDb = Math.max(-18, existing.gainDb + presence);
      else eq.push({ hz, gainDb: presence });
    }
    if (!eq.some(e => e.hz === 1500)) eq.push({ hz: 1500, gainDb: 0 });
    if (!eq.some(e => e.hz === 8000)) eq.push({ hz: 8000, gainDb: presence / 2 });
    note('eq', `${presence} dB at 2.5–5 kHz`, 'rule', 'The 2.5–5.5 kHz region, where unpleasant sounds concentrate, is softened.', ['kumar2008']);
  }

  // ---- Level ----
  const base = Math.min(profile.baseLevelDb ?? 0, contour.length >= 3 ? Math.min(6, contourCeilingDb(contour)) : 6);
  let level = base + mode.offsetDb;
  if (state !== 'normal') note('levelDb', mode.offsetDb, 'rule', `${Math.abs(mode.offsetDb)} dB quieter than a normal day in this state.`, ['ashkenazi2009', 'vingen1998']);
  const conservative = intake.worstSymptom === 'sound' || intake.attackSoundBother === 3;
  if (conservative && state !== 'normal') {
    level -= 6;
    note('levelDb', -6, 'estimated', 'A further 6 dB quieter: sound is your worst symptom or always bothers you in attacks.', ['munjal2020']);
  }
  if (intake.anxietyDuringAttacks === 2 && state === 'attack') {
    level -= 3;
    note('levelDb', -3, 'estimated', '3 dB quieter, since you feel very anxious during attacks.', ['ikumi2024']);
  }
  const trim = profile.trims?.[state] ?? 0;
  if (trim < 0) { level += trim; note('levelDb', trim, 'measured', `${Math.abs(trim)} dB quieter after you said a sound made things worse.`, ['personal']); }
  const ceiling = base + mode.offsetDb + Math.min(0, trim);

  // ---- Onset, offset, timer ----
  const fadeInS = mode.fadeSeconds + 0.75 * n04(bother.sudden) + (n04(bother.sudden) >= 3 ? 2 : 0);
  note('fadeInS', fadeInS, 'rule', `Fades in over ${fadeInS.toFixed(0)} seconds${n04(bother.sudden) >= 2 ? ', longer because sudden sounds bother you' : ''}.`, ['ambrosini2003']);
  const timerMin = intake.goal === 'sleep' ? 45 : 30;
  note('timerMin', timerMin, 'rule', `Fades out by itself after ${timerMin} minutes${intake.goal === 'sleep' ? ', for falling asleep' : ''}.`, intake.goal === 'sleep' ? ['jespersen2022', 'whoSafeListening'] : ['whoSafeListening']);

  let recipe = {
    version: RECIPE_VERSION, state,
    tiltDbPerOct: tilt, cutoffHz: cutoff, tonal, humHz, harmonics, swellDb, swellPeriodS, width,
    eq, levelDb: level, fadeInS, fadeOutS: 3, timerMin, texture, textureAmount, gentleEvents,
    avoid: [...(intake.dislikes || [])],
    sources: { tilt: tiltSource },
  };

  // ---- AI review: bounded adjustments, only with consent ----
  const ai = profile.consentAI ? profile.aiReview : null;
  if (ai?.adjustments) {
    recipe = applyAdjustments(recipe, ai.adjustments);
    for (const r of ai.rationale || []) note(r.param, r.value ?? '', 'ai', r.why, ['personal']);
  }

  recipe = clampRecipe(recipe, state, ceiling);
  return { recipe, why };
}

/** Apply bounded adjustments (from the AI review) to a recipe. Unknown keys are ignored. */
export function applyAdjustments(recipe, adj) {
  const r = { ...recipe };
  const num = k => Number.isFinite(adj?.[k]);
  if (num('tiltDbPerOct')) r.tiltDbPerOct = adj.tiltDbPerOct;
  if (num('cutoffHz')) r.cutoffHz = adj.cutoffHz;
  if (num('tonal')) r.tonal = adj.tonal;
  if (num('humHz')) { r.humHz = adj.humHz; r.harmonics = safeHarmonics(adj.humHz, r.harmonics); }
  if (num('swellDb')) r.swellDb = adj.swellDb;
  if (num('swellPeriodS')) r.swellPeriodS = adj.swellPeriodS;
  if (num('width')) r.width = adj.width;
  if (num('fadeInS')) r.fadeInS = Math.max(r.fadeInS, adj.fadeInS);           // longer only
  if (num('levelOffsetDb')) r.levelDb += Math.min(0, adj.levelOffsetDb);       // quieter only
  if (Array.isArray(adj?.extraCuts)) {
    const eq = [...(r.eq || [])];
    for (const c of adj.extraCuts) {
      if (!Number.isFinite(c?.hz) || !Number.isFinite(c?.gainDb)) continue;
      const g = Math.min(0, c.gainDb);
      const hit = eq.find(e => Math.abs(Math.log2(e.hz / c.hz)) < 0.15);
      if (hit) hit.gainDb = Math.max(BOUNDS.eqGainDb[0], hit.gainDb + g); else eq.push({ hz: c.hz, gainDb: g });
    }
    r.eq = eq;
  }
  return r;
}

/** Engine options for rendering a recipe (see renderComfortLoop). */
export function renderOptions(recipe) {
  return {
    x: xFromSettings(recipe),
    opts: {
      toneHz: recipe.humHz, harmonics: recipe.harmonics, swellPeriodS: recipe.swellPeriodS,
      width: recipe.width, eq: recipe.eq, mode: recipe.state,
      texture: recipe.texture, textureAmount: recipe.textureAmount, gentleEvents: !!recipe.gentleEvents,
    },
  };
}

/** Short plain-language summary with the exact numbers. */
export function describeRecipe(r) {
  const tilt = r.tiltDbPerOct <= -7 ? 'deep and dark (darker than brown noise)' : r.tiltDbPerOct <= -5 ? 'warm, close to brown noise' : r.tiltDbPerOct <= -3 ? 'balanced, close to pink noise' : 'airy, closer to white noise';
  const texture = r.tonal < 0.1 ? 'pure soft noise' : r.tonal < 0.4 ? `soft noise with a faint ${r.humHz.toFixed(0)} Hz hum` : r.tonal < 0.7 ? `noise and a ${r.humHz.toFixed(0)} Hz hum in equal parts` : `mostly a steady ${r.humHz.toFixed(0)} Hz hum`;
  const name = { rain: 'rain', ocean: 'ocean', fan: 'fan' }[r.texture] || null;
  return { tilt, texture, name };
}
