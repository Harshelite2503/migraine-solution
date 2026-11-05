// The comfort profile on the phone: question answers, the A/B preference model and per-state levels.
// Same rules as the web profile: a harder state is never louder than a normal day.
import { MODES } from '../engine/comfort-engine.js';
import { PreferenceGP, startingPoint } from '../engine/preference-model.js';

export const PROFILE_KEY = 'still-app-profile-v1';
export type State = 'attack' | 'warning' | 'recovering';
export type Point = [number, number, number, number];
export type Answers = Partial<Record<'sudden' | 'high' | 'low' | 'pulse', number>>;
export type Profile = {
  schema: string;
  answers: Answers;
  model: unknown | null;           // PreferenceGP.toJSON()
  vetoes: Point[];
  rounds: number;
  baseLevelDb: number;              // relative to the -30 dBFS reference loudness
  trims: Record<State, number>;     // extra quieting per state after "making it worse", 0 to -30 dB
};

export const DEFAULT_X: Point = [0.25, 0.15, 0, 0.3];
export const WORSE_STEP_DB = 4;
export const SOFTER_DB = -6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isPoint = (v: unknown): v is Point => Array.isArray(v) && v.length === 4 && v.every(x => Number.isFinite(x) && x >= 0 && x <= 1);

export function freshProfile(): Profile {
  return { schema: PROFILE_KEY, answers: {}, model: null, vetoes: [], rounds: 0, baseLevelDb: 0, trims: { attack: 0, warning: 0, recovering: 0 } };
}

export function sanitizeProfile(raw: any): Profile {
  if (!raw || raw.schema !== PROFILE_KEY) return freshProfile();
  const p = freshProfile();
  for (const k of ['sudden', 'high', 'low', 'pulse'] as const) {
    const v = raw.answers?.[k];
    if (Number.isInteger(v) && v >= 0 && v <= 4) p.answers[k] = v;
  }
  if (raw.model && typeof raw.model === 'object') p.model = PreferenceGP.fromJSON(raw.model).toJSON();
  p.vetoes = (Array.isArray(raw.vetoes) ? raw.vetoes : []).filter(isPoint).slice(-50);
  p.rounds = Number.isInteger(raw.rounds) ? clamp(raw.rounds, 0, 1000) : 0;
  if (Number.isFinite(raw.baseLevelDb)) p.baseLevelDb = clamp(raw.baseLevelDb, -40, 6);
  for (const s of ['attack', 'warning', 'recovering'] as const) if (Number.isFinite(raw.trims?.[s])) p.trims[s] = clamp(raw.trims[s], -30, 0);
  return p;
}

const near = (p: number[], q: number[]) => Math.hypot(...p.map((v, i) => v - q[i])) < 0.15;
export const isVetoed = (profile: Profile, x: number[]) => profile.vetoes.some(v => near(v, x));

export function modelOf(profile: Profile): PreferenceGP {
  return profile.model ? PreferenceGP.fromJSON(profile.model) : new PreferenceGP();
}

/** The favourite sound so far, or null before any comparison. */
export function champion(profile: Profile): Point | null {
  if (!profile.model) return null;
  try { return modelOf(profile).champion((x: number[]) => isVetoed(profile, x)) as Point | null; } catch { return null; }
}

export function firstSound(profile: Profile): Point {
  return (startingPoint(profile.answers) as Point);
}

export function levelFor(profile: Profile, state: State): number {
  return Math.min(profile.baseLevelDb, 6) + MODES[state].offsetDb + profile.trims[state];
}

export function fadeInSeconds(profile: Profile, state: State): number {
  return MODES[state].fadeSeconds + 0.75 * (profile.answers.sudden ?? 0);
}

/** A softer, darker variant: darker tilt, duller top end, no swell. */
export function softer(x: Point): Point {
  return [Math.max(0, x[0] - 0.2), x[1], 0, Math.max(0, x[3] - 0.25)];
}

export function lowerState(profile: Profile, state: State): { profile: Profile; loweredDb: number } {
  const before = profile.trims[state];
  const after = clamp(before - WORSE_STEP_DB, -30, 0);
  return { profile: { ...profile, trims: { ...profile.trims, [state]: after } }, loweredDb: before - after };
}
