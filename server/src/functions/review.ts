// POST /api/review: review a sound recipe. Protected by an Azure Functions key.
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

export async function review(request: HttpRequest): Promise<HttpResponseInit> {
  if (!model) return { status: 503, jsonBody: { error: 'not-configured' } };
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES * 2) return { status: 413, jsonBody: { error: 'too-large' } };
  let body: Record<string, unknown>;
  try { body = validateRequest(JSON.parse(raw)); } catch { return { status: 400, jsonBody: { error: 'bad-request' } }; }
  try {
    return { status: 200, jsonBody: await reviewRecipe(model, body) };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || (error instanceof ProviderError && error.status === 429)) return { status: 429, jsonBody: { error: 'busy' } };
    if (error instanceof Anthropic.AuthenticationError || (error instanceof ProviderError && (error.status === 401 || error.status === 403))) return { status: 503, jsonBody: { error: 'not-configured' } };
    if (error instanceof Anthropic.APIError || error instanceof ProviderError) return { status: 502, jsonBody: { error: 'upstream' } };
    return { status: 500, jsonBody: { error: 'review-failed' } };
  }
}

app.http('review', { methods: ['POST'], authLevel: 'function', route: 'review', handler: review });
