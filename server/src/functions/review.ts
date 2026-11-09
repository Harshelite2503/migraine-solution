// POST /api/review: review a sound recipe. Open only to people signed in to Still (Supabase): the
// app sends the person's sign-in token, and the server asks Supabase to count it against that
// person's 5 reviews a day. No key is built into the app, so there is nothing to extract from it.
// Uses free OpenRouter models when OPENROUTER_API_KEY is set (OPENROUTER_MODELS overrides the list),
// otherwise Claude when ANTHROPIC_API_KEY is set. With neither, answers 503 and the app keeps its rules.
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import Anthropic from '@anthropic-ai/sdk';
import { MAX_REQUEST_BYTES, ProviderError, anthropicModel, openRouterModel, reviewRecipe, validateRequest, type ReviewModel } from '../reviewer.js';

function pickModel(): ReviewModel | null {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    const models = (process.env.OPENROUTER_MODELS || '').split(',').map(m => m.trim()).filter(Boolean);
    return openRouterModel({ apiKey: orKey, ...(models.length ? { models } : {}) });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ timeout: 240_000, maxRetries: 2 });
    return anthropicModel(params => client.beta.messages.create(params));
  }
  return null;
}
const model = pickModel();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';

/** 'ok' when Supabase accepts the token and the person has reviews left today. */
export async function claimReview(authorization: string | null, { url = SUPABASE_URL, key = SUPABASE_KEY, fetcher = fetch }: { url?: string; key?: string; fetcher?: typeof fetch } = {}): Promise<'ok' | 'unauthorized' | 'limit' | 'unavailable'> {
  const token = /^Bearer\s+(\S+)$/.exec(authorization || '')?.[1];
  if (!token) return 'unauthorized';
  if (!url || !key) return 'unavailable';
  try {
    const res = await fetcher(`${url}/rest/v1/rpc/claim_review`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (res.status === 401 || res.status === 403) return 'unauthorized';
    if (!res.ok) return 'unavailable';
    return (await res.json()) === true ? 'ok' : 'limit';
  } catch { return 'unavailable'; }
}

export async function review(request: HttpRequest): Promise<HttpResponseInit> {
  if (!model) return { status: 503, jsonBody: { error: 'not-configured' } };
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES * 2) return { status: 413, jsonBody: { error: 'too-large' } };
  let body: Record<string, unknown>;
  try { body = validateRequest(JSON.parse(raw)); } catch { return { status: 400, jsonBody: { error: 'bad-request' } }; }
  // Only a well-formed request uses up one of the person's daily reviews.
  const claim = await claimReview(request.headers.get('authorization'));
  if (claim === 'unauthorized') return { status: 401, jsonBody: { error: 'sign-in' } };
  if (claim === 'limit') return { status: 429, jsonBody: { error: 'daily-limit' } };
  if (claim === 'unavailable') return { status: 503, jsonBody: { error: 'auth-unavailable' } };
  try {
    return { status: 200, jsonBody: await reviewRecipe(model, body) };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || (error instanceof ProviderError && error.status === 429)) return { status: 429, jsonBody: { error: 'busy' } };
    if (error instanceof Anthropic.AuthenticationError || (error instanceof ProviderError && (error.status === 401 || error.status === 403))) return { status: 503, jsonBody: { error: 'not-configured' } };
    if (error instanceof Anthropic.APIError || error instanceof ProviderError) return { status: 502, jsonBody: { error: 'upstream' } };
    return { status: 500, jsonBody: { error: 'review-failed' } };
  }
}

app.http('review', { methods: ['POST'], authLevel: 'anonymous', route: 'review', handler: review });
