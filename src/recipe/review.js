// Contract for the optional AI review, shared by the app and the server.
// The app sends a privacy-minimal summary (answers, measured values, counts; no name, no dates,
// no free text). The model may only return small adjustments from the list below; the app's
// recipe rules then clamp them to the safety limits, so a review can never make a sound louder,
// brighter than allowed, faster-moving or boosted in any band.

import { EVIDENCE } from './evidence.js';
import { BOUNDS } from './bounds.js';

export const ADJUSTABLE = ['tiltDbPerOct', 'cutoffHz', 'tonal', 'humHz', 'swellDb', 'swellPeriodS', 'width', 'fadeInS', 'levelOffsetDb'];

/** JSON schema for the model's structured output. Numeric limits are enforced after parsing. */
export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'adjustments', 'rationale', 'cautions', 'questions'],
  properties: {
    summary: { type: 'string' },
    adjustments: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...Object.fromEntries(ADJUSTABLE.map(k => [k, { type: 'number' }])),
        extraCuts: {
          type: 'array',
          items: { type: 'object', additionalProperties: false, required: ['hz', 'gainDb'], properties: { hz: { type: 'number' }, gainDb: { type: 'number' } } },
        },
      },
    },
    rationale: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['param', 'why', 'evidence'],
        properties: { param: { type: 'string' }, why: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } },
      },
    },
    cautions: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
  },
};

const text = (v, max = 400) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const within = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
const LIMITS = {
  tiltDbPerOct: BOUNDS.tiltDbPerOct, cutoffHz: BOUNDS.cutoffHz, tonal: BOUNDS.tonal, humHz: BOUNDS.humHz,
  swellDb: BOUNDS.swellDb, swellPeriodS: BOUNDS.swellPeriodS, width: BOUNDS.width, fadeInS: BOUNDS.fadeInS,
  levelOffsetDb: [-20, 0],
};

/** Keep only well-formed, in-range parts of a review. Anything else is dropped, not repaired. */
export function sanitizeReview(raw) {
  const adj = /** @type {Record<string, any>} */ ({});
  for (const k of ADJUSTABLE) if (within(raw?.adjustments?.[k], LIMITS[k])) adj[k] = raw.adjustments[k];
  const cuts = (Array.isArray(raw?.adjustments?.extraCuts) ? raw.adjustments.extraCuts : [])
    .filter(c => within(c?.hz, [40, 12000]) && within(c?.gainDb, [-12, 0]))
    .slice(0, 6)
    .map(c => ({ hz: Math.round(c.hz), gainDb: Math.round(c.gainDb * 10) / 10 }));
  if (cuts.length) adj.extraCuts = cuts;
  const rationale = (Array.isArray(raw?.rationale) ? raw.rationale : [])
    .map(r => ({ param: text(r?.param, 40), why: text(r?.why), evidence: (Array.isArray(r?.evidence) ? r.evidence : []).filter(e => EVIDENCE[e]).slice(0, 4) }))
    .filter(r => r.param && r.why)
    .slice(0, 12);
  const list = v => (Array.isArray(v) ? v.map(x => text(x, 300)).filter(Boolean).slice(0, 5) : []);
  return { summary: text(raw?.summary, 900), adjustments: adj, rationale, cautions: list(raw?.cautions), questions: list(raw?.questions) };
}

/**
 * The summary sent for review. `recipes` are the current rule-built recipes for 'normal' and
 * 'attack'; `feedback` is the journal's metrics() output (counts only).
 */
export function buildReviewRequest(profile, recipes, feedback) {
  const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
  const strip = r => r && Object.fromEntries(Object.entries(r).filter(([k]) => !['sources', 'version'].includes(k)).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v]));
  const i = profile.intake || {};
  // Data minimisation: only what tuning a sound needs. Aura, headache frequency, what currently
  // helps, and exact anxiety or dizziness levels are never sent; the rest is reduced to flags.
  const intake = {
    soundBother: i.bother || {},
    soundOftenBothersInAttacks: (i.attackSoundBother ?? 0) >= 2,
    soundIsWorstSymptom: i.worstSymptom === 'sound',
    dizzy: (i.dizziness ?? 0) >= 2,
    motionSensitive: Array.isArray(i.otherSensitivities) && i.otherSensitivities.includes('motion'),
    oftenVeryAnxious: i.anxietyDuringAttacks === 2,
    listening: i.listening ?? null,
    goal: i.goal ?? null,
    texture: i.texture ?? null,
    loves: i.loves || [],
    dislikes: i.dislikes || [],
  };
  return {
    intake,
    calibration: { contour: (profile.calibration?.contour || []).map(b => ({ hz: b.hz, ceilingDb: round(b.ceilingDb, 1) })) },
    tests: Object.fromEntries(Object.entries(profile.tests || {}).map(([k, v]) => [k, { value: round(v.value), trials: v.trials, decisive: v.decisive }])),
    learnedRounds: profile.rounds || 0,
    trims: profile.trims || {},
    recipes: { normal: strip(recipes.normal), attack: strip(recipes.attack) },
    feedback: feedback ? {
      episodesLast60Days: feedback.usedEpisodes, sessions: feedback.sessions, choices: feedback.choices,
      followUps: feedback.followUps, worseSessions: feedback.worseSessions, medianListeningMin: round(feedback.medianListeningMin, 0),
    } : null,
  };
}
