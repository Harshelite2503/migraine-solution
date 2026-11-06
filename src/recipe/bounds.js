// Hard safety limits for every recipe, whoever proposed it (rules, learning or the AI review).
// A recipe can only be made quieter, darker or steadier than these allow, never louder or harsher.
import { MODES } from '../engine/comfort-engine.js';

export const BOUNDS = {
  tiltDbPerOct: [-9, -1.5],
  cutoffHz: [300, 6000],
  tonal: [0, 1],
  humHz: [55, 330],
  harmonics: [1, 16],
  swellDb: [0, 6],
  swellPeriodS: [4, 16],     // 0.25 Hz or slower: the only "no penalty" modulation rate (Virjonen 2019)
  width: [0, 1],
  eqGainDb: [-18, 0],        // cuts only, never boosts
  fadeInS: [2, 20],
  fadeOutS: [2, 10],
  levelDb: [-50, 6],         // relative to the reference loudness
  timerMin: [0, 90],
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback);

/**
 * Clamp a recipe into the safe space for a listening state. `ceilingDb` is the loudest level this
 * person may get in this state (from rules and their own "making it worse" history).
 */
export function clampRecipe(recipe, state, ceilingDb) {
  const mode = MODES[state] || MODES.normal;
  const r = { ...recipe };
  r.tiltDbPerOct = clamp(finite(r.tiltDbPerOct, -6), BOUNDS.tiltDbPerOct);
  r.cutoffHz = clamp(finite(r.cutoffHz, 2000), BOUNDS.cutoffHz);
  r.tonal = clamp(finite(r.tonal, 0.15), BOUNDS.tonal);
  r.humHz = clamp(finite(r.humHz, 110), BOUNDS.humHz);
  r.harmonics = Math.round(clamp(finite(r.harmonics, 6), BOUNDS.harmonics));
  r.swellDb = Math.min(clamp(finite(r.swellDb, 0), BOUNDS.swellDb), mode.swellCapDb);
  r.swellPeriodS = clamp(finite(r.swellPeriodS, 10), BOUNDS.swellPeriodS);
  r.width = clamp(finite(r.width, 0.6), BOUNDS.width);
  r.fadeInS = Math.max(clamp(finite(r.fadeInS, mode.fadeSeconds), BOUNDS.fadeInS), mode.fadeSeconds);
  r.fadeOutS = clamp(finite(r.fadeOutS, 3), BOUNDS.fadeOutS);
  r.timerMin = Math.round(clamp(finite(r.timerMin, 30), BOUNDS.timerMin));
  r.eq = (Array.isArray(r.eq) ? r.eq : [])
    .filter(p => Number.isFinite(p?.hz) && Number.isFinite(p?.gainDb))
    .map(p => ({ hz: Math.round(clamp(p.hz, [40, 12000])), gainDb: Math.round(clamp(p.gainDb, BOUNDS.eqGainDb) * 10) / 10 }))
    .sort((a, b) => a.hz - b.hz)
    .slice(0, 12);
  r.levelDb = Math.min(clamp(finite(r.levelDb, -14), BOUNDS.levelDb), ceilingDb);
  return r;
}

/** Fewest hum harmonics so that no two partials beat inside one hearing band (roughness guard). */
export function safeHarmonics(humHz, wanted = 16) {
  // Above roughly 1 kHz a hearing band is wider than the hum's spacing, so neighbouring
  // partials would beat at the hum frequency. Keep partials below ~1 kHz, at least 2.
  return Math.max(1, Math.min(wanted, Math.max(2, Math.floor(1000 / humHz))));
}
