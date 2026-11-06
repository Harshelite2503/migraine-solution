// The personal sound profile, stored on the phone. Version 1 profiles (answers + A/B model) load
// into this shape unchanged; everything new is optional and filled in by "Build my sound".
import { MODES } from '../engine/comfort-engine.js';
import { PreferenceGP, startingPoint } from '../engine/preference-model.js';
import { buildRecipe } from '../recipe/recipe.js';

export const PROFILE_KEY = 'still-app-profile-v1';
export type State = 'attack' | 'warning' | 'recovering';
export type AnyState = State | 'normal';
export type Point = [number, number, number, number];
export type Bother = Partial<Record<'sudden' | 'high' | 'low' | 'pulse' | 'voices' | 'repetitive' | 'mouth', number>>;
export type Category = 'rain' | 'ocean' | 'stream' | 'wind' | 'birds' | 'fan' | 'hum' | 'bowls' | 'piano' | 'voices' | 'silence';
export type Intake = {
  attackSoundBother?: 0 | 1 | 2 | 3;               // never / sometimes / usually / always
  worstSymptom?: 'pain' | 'light' | 'sound' | 'nausea' | 'other';
  aura?: boolean;
  attacksPerMonth?: '1-3' | '4-7' | '8-14' | '15+';
  otherSensitivities?: ('light' | 'smell' | 'motion' | 'touch')[];
  dizziness?: number;                                 // 0-4
  anxietyDuringAttacks?: 0 | 1 | 2;                   // low / some / high
  currentlyHelps?: ('silence' | 'darkness' | 'nature' | 'music' | 'noise' | 'nothing')[];
  bother?: Bother;                                    // 0-4 each
  dislikes?: Category[];
  loves?: Category[];
  listening?: 'earbuds' | 'headphones' | 'speaker' | 'pillow';
  goal?: 'rest' | 'sleep' | 'distract' | 'focus';
};
export type Measured = { value: number; trials: number; decisive?: number; at?: string };
export type Tests = Partial<Record<'tilt' | 'cutoff' | 'tonal' | 'humHz' | 'swellDb' | 'swellPeriodS' | 'width' | 'harmonics', Measured>>;
export type AiReview = { at: string; adjustments: Record<string, unknown>; rationale: { param: string; value?: unknown; why: string }[]; cautions?: string[]; questions?: string[] };
export type Profile = {
  schema: string;
  answers: Partial<Record<'sudden' | 'high' | 'low' | 'pulse', number>>;  // v1 quick questions
  intake: Intake;
  calibration: { referenceAt?: string; contour: { hz: number; ceilingDb: number }[] };
  tests: Tests;
  model: unknown | null;            // PreferenceGP.toJSON()
  vetoes: Point[];
  rounds: number;
  baseLevelDb: number;              // relative to the -30 dBFS reference loudness
  trims: Record<State, number>;     // extra quieting per state after "making it worse", 0 to -30 dB
  consentAI: boolean;
  aiReview: AiReview | null;
};

export const DEFAULT_X: Point = [0.25, 0.15, 0, 0.3];
export const WORSE_STEP_DB = 4;
export const SOFTER_DB = -6;
export const CONTOUR_BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isPoint = (v: unknown): v is Point => Array.isArray(v) && v.length === 4 && v.every(x => Number.isFinite(x) && x >= 0 && x <= 1);
const int04 = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4 ? (v as number) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined);
const someOf = <T extends string>(v: unknown, list: readonly T[]) => (Array.isArray(v) ? [...new Set(v.filter(x => list.includes(x)))] as T[] : undefined);
const CATEGORIES = ['rain', 'ocean', 'stream', 'wind', 'birds', 'fan', 'hum', 'bowls', 'piano', 'voices', 'silence'] as const;

export function freshProfile(): Profile {
  return {
    schema: PROFILE_KEY, answers: {}, intake: {}, calibration: { contour: [] }, tests: {},
    model: null, vetoes: [], rounds: 0, baseLevelDb: 0, trims: { attack: 0, warning: 0, recovering: 0 },
    consentAI: false, aiReview: null,
  };
}

function sanitizeIntake(raw: any): Intake {
  if (!raw || typeof raw !== 'object') return {};
  const bother: Bother = {};
  for (const k of ['sudden', 'high', 'low', 'pulse', 'voices', 'repetitive', 'mouth'] as const) {
    const v = int04(raw.bother?.[k]); if (v !== undefined) bother[k] = v;
  }
  const i: Intake = {
    attackSoundBother: [0, 1, 2, 3].includes(raw.attackSoundBother) ? raw.attackSoundBother : undefined,
    worstSymptom: oneOf(raw.worstSymptom, ['pain', 'light', 'sound', 'nausea', 'other'] as const),
    aura: typeof raw.aura === 'boolean' ? raw.aura : undefined,
    attacksPerMonth: oneOf(raw.attacksPerMonth, ['1-3', '4-7', '8-14', '15+'] as const),
    otherSensitivities: someOf(raw.otherSensitivities, ['light', 'smell', 'motion', 'touch'] as const),
    dizziness: int04(raw.dizziness),
    anxietyDuringAttacks: [0, 1, 2].includes(raw.anxietyDuringAttacks) ? raw.anxietyDuringAttacks : undefined,
    currentlyHelps: someOf(raw.currentlyHelps, ['silence', 'darkness', 'nature', 'music', 'noise', 'nothing'] as const),
    bother,
    dislikes: someOf(raw.dislikes, CATEGORIES),
    loves: someOf(raw.loves, CATEGORIES),
    listening: oneOf(raw.listening, ['earbuds', 'headphones', 'speaker', 'pillow'] as const),
    goal: oneOf(raw.goal, ['rest', 'sleep', 'distract', 'focus'] as const),
  };
  return Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as Intake;
}

export function sanitizeProfile(raw: any): Profile {
  if (!raw || raw.schema !== PROFILE_KEY) return freshProfile();
  const p = freshProfile();
  for (const k of ['sudden', 'high', 'low', 'pulse'] as const) { const v = int04(raw.answers?.[k]); if (v !== undefined) p.answers[k] = v; }
  p.intake = sanitizeIntake(raw.intake);
  // Carry v1 quick answers into the fuller questionnaire when it has not been filled in yet.
  p.intake.bother = { ...p.answers, ...(p.intake.bother || {}) };
  if (typeof raw.calibration?.referenceAt === 'string') p.calibration.referenceAt = raw.calibration.referenceAt;
  p.calibration.contour = (Array.isArray(raw.calibration?.contour) ? raw.calibration.contour : [])
    .filter((b: any) => CONTOUR_BANDS.includes(b?.hz) && Number.isFinite(b?.ceilingDb))
    .map((b: any) => ({ hz: b.hz, ceilingDb: clamp(b.ceilingDb, -30, 6) }))
    .filter((b: any, i: number, all: any[]) => all.findIndex(o => o.hz === b.hz) === i);
  for (const [k, v] of Object.entries(raw.tests || {})) {
    const m = v as any;
    if (Number.isFinite(m?.value) && Number.isFinite(m?.trials)) (p.tests as any)[k] = { value: m.value, trials: m.trials, decisive: m.decisive, at: m.at };
  }
  if (raw.model && typeof raw.model === 'object') p.model = PreferenceGP.fromJSON(raw.model).toJSON();
  p.vetoes = (Array.isArray(raw.vetoes) ? raw.vetoes : []).filter(isPoint).slice(-50);
  p.rounds = Number.isInteger(raw.rounds) ? clamp(raw.rounds, 0, 1000) : 0;
  if (Number.isFinite(raw.baseLevelDb)) p.baseLevelDb = clamp(raw.baseLevelDb, -40, 6);
  for (const s of ['attack', 'warning', 'recovering'] as const) if (Number.isFinite(raw.trims?.[s])) p.trims[s] = clamp(raw.trims[s], -30, 0);
  p.consentAI = raw.consentAI === true;
  if (raw.aiReview && typeof raw.aiReview === 'object' && typeof raw.aiReview.at === 'string') p.aiReview = raw.aiReview;
  return p;
}

const near = (p: number[], q: number[]) => Math.hypot(...p.map((v, i) => v - q[i])) < 0.15;
export const isVetoed = (profile: Profile, x: number[]) => profile.vetoes.some(v => near(v, x));

export function modelOf(profile: Profile): PreferenceGP {
  return profile.model ? PreferenceGP.fromJSON(profile.model) : new PreferenceGP();
}

/** The A/B favourite so far, or null before any comparison. */
export function champion(profile: Profile): Point | null {
  if (!profile.model) return null;
  try { return modelOf(profile).champion((x: number[]) => isVetoed(profile, x)) as Point | null; } catch { return null; }
}

export function firstSound(profile: Profile): Point {
  return startingPoint(profile.intake.bother || profile.answers) as Point;
}

/** The full recipe for a state, with the reason for each setting. */
export function recipeFor(profile: Profile, state: AnyState) {
  return buildRecipe(profile, state, { learned: champion(profile), learnedRounds: profile.rounds });
}

/** How much of "Build my sound" is done, 0–1, and what each step contributes. */
export function progress(profile: Profile) {
  const i = profile.intake;
  const steps = {
    about: !!(i.attackSoundBother !== undefined && i.worstSymptom && i.listening),
    sensitivities: Object.keys(i.bother || {}).length >= 5,
    likes: !!((i.loves?.length || 0) + (i.dislikes?.length || 0)),
    reference: !!profile.calibration.referenceAt,
    contour: profile.calibration.contour.length >= 7,
    tests: Object.keys(profile.tests).length >= 4,
    refine: profile.rounds >= 6,
  };
  const done = Object.values(steps).filter(Boolean).length;
  return { steps, done, total: Object.keys(steps).length };
}

export function levelFor(profile: Profile, state: State): number {
  return recipeFor(profile, state).recipe.levelDb;
}

export function fadeInSeconds(profile: Profile, state: State): number {
  return Math.max(MODES[state].fadeSeconds, recipeFor(profile, state).recipe.fadeInS);
}

export function lowerState(profile: Profile, state: State): { profile: Profile; loweredDb: number } {
  const before = profile.trims[state];
  const after = clamp(before - WORSE_STEP_DB, -30, 0);
  return { profile: { ...profile, trims: { ...profile.trims, [state]: after } }, loweredDb: before - after };
}
