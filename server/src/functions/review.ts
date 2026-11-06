// POST /api/review: review a sound recipe. Protected by an Azure Functions key.
// Needs the ANTHROPIC_API_KEY app setting; without it, answers 503 so the app falls back to rules.
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import Anthropic from '@anthropic-ai/sdk';
import { MAX_REQUEST_BYTES, reviewRecipe, validateRequest } from '../reviewer.js';

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 240_000, maxRetries: 2 }) : null;

export async function review(request: HttpRequest): Promise<HttpResponseInit> {
  if (!client) return { status: 503, jsonBody: { error: 'not-configured' } };
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES * 2) return { status: 413, jsonBody: { error: 'too-large' } };
  let body: Record<string, unknown>;
  try { body = validateRequest(JSON.parse(raw)); } catch { return { status: 400, jsonBody: { error: 'bad-request' } }; }
  try {
    const result = await reviewRecipe(params => client.beta.messages.create(params), body);
    return { status: 200, jsonBody: result };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { status: 429, jsonBody: { error: 'busy' } };
    if (error instanceof Anthropic.AuthenticationError) return { status: 503, jsonBody: { error: 'not-configured' } };
    if (error instanceof Anthropic.APIError) return { status: 502, jsonBody: { error: 'upstream' } };
    return { status: 500, jsonBody: { error: 'review-failed' } };
  }
}

app.http('review', { methods: ['POST'], authLevel: 'function', route: 'review', handler: review });
