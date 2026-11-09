// Optional AI review of the recipe. Needs a review server (see server/README.md) configured at
// build time with EXPO_PUBLIC_RECIPE_API_URL. Only runs when the person has opted in.
import { metrics } from '../engine/journal-store.js';
import { buildReviewRequest, sanitizeReview } from '../recipe/review.js';
import { recipeFor, type AiReview, type Profile } from './profile';
import type { Journal } from './storage';
import { supabase, supabaseReady } from './supabase';

const URL = process.env.EXPO_PUBLIC_RECIPE_API_URL || 'https://still-review-fc26d0.azurewebsites.net/api/review';
export const aiAvailable = URL.startsWith('https://');
/** Why a review could not run, in words the screen can show. */
export class ReviewError extends Error {}

export function reviewPayload(profile: Profile, journal: Journal) {
  return buildReviewRequest(profile, { normal: recipeFor(profile, 'normal').recipe, attack: recipeFor(profile, 'attack').recipe }, metrics(journal));
}

export async function requestReview(profile: Profile, journal: Journal): Promise<AiReview> {
  if (!aiAvailable || !supabaseReady) throw new ReviewError('The AI review is not set up in this version yet.');
  // The review server accepts signed-in people only (5 reviews a day), so no key is built into the app.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || data.session?.user?.is_anonymous) throw new ReviewError('Sign in under Account (below) to use the AI review.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000); // free models take ~1–2 minutes
  try {
    const res = await fetch(URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(reviewPayload(profile, journal)),
    });
    if (res.status === 401) throw new ReviewError('Your sign-in has expired. Sign in again under Account.');
    if (res.status === 429) throw new ReviewError('You have used today\'s 5 reviews. Try again tomorrow.');
    if (!res.ok) throw new Error(`status-${res.status}`);
    const clean = sanitizeReview(await res.json());
    return { at: new Date().toISOString(), ...clean, adjustments: clean.adjustments as unknown as Record<string, unknown> };
  } finally { clearTimeout(timer); }
}
