// Optional AI review of the recipe. Needs a review server (see server/README.md) configured at
// build time with EXPO_PUBLIC_RECIPE_API_URL. Only runs when the person has opted in.
import { metrics } from '../engine/journal-store.js';
import { buildReviewRequest, sanitizeReview } from '../recipe/review.js';
import { recipeFor, type AiReview, type Profile } from './profile';
import type { Journal } from './storage';

const URL = process.env.EXPO_PUBLIC_RECIPE_API_URL || '';
const KEY = process.env.EXPO_PUBLIC_RECIPE_API_KEY || '';
export const aiAvailable = URL.startsWith('https://');

export function reviewPayload(profile: Profile, journal: Journal) {
  return buildReviewRequest(profile, { normal: recipeFor(profile, 'normal').recipe, attack: recipeFor(profile, 'attack').recipe }, metrics(journal));
}

export async function requestReview(profile: Profile, journal: Journal): Promise<AiReview> {
  if (!aiAvailable) throw new Error('not-configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000); // free models take ~1–2 minutes
  try {
    const res = await fetch(URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(KEY ? { 'x-functions-key': KEY } : {}) },
      body: JSON.stringify(reviewPayload(profile, journal)),
    });
    if (!res.ok) throw new Error(`status-${res.status}`);
    const clean = sanitizeReview(await res.json());
    return { at: new Date().toISOString(), ...clean, adjustments: clean.adjustments as unknown as Record<string, unknown> };
  } finally { clearTimeout(timer); }
}
