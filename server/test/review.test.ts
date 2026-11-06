// Review server logic with a fake model: request shape, validation, and failure handling.
import assert from 'node:assert/strict';
import { reviewRecipe, validateRequest, SYSTEM_PROMPT, MODEL, type CreateFn } from '../src/reviewer.js';
import { buildReviewRequest, REVIEW_SCHEMA } from '../../src/recipe/review.js';
import { buildRecipe } from '../../src/recipe/recipe.js';

const profile = { intake: { bother: { high: 3 }, listening: 'earbuds' }, tests: { tilt: { value: -6.5, trials: 5 } }, calibration: { contour: [] }, trims: { attack: -4 }, rounds: 3 };
const request = validateRequest(buildReviewRequest(profile, { normal: buildRecipe(profile, 'normal').recipe, attack: buildRecipe(profile, 'attack').recipe }, null));

const reply = (text: string, stop: string = 'end_turn') => ({ id: 'm', type: 'message', role: 'assistant', model: MODEL, stop_reason: stop, stop_sequence: null, content: [{ type: 'text', text }], usage: {} }) as any;

// 1. Request sent to Claude: model, default fallbacks, structured output, cached system prompt.
let sent: any = null;
const good: CreateFn = async p => {
  sent = p;
  return reply(JSON.stringify({
    adjustments: { cutoffHz: 1100, levelOffsetDb: -3, humHz: 9999, extraCuts: [{ hz: 3200, gainDb: -4 }, { hz: 4000, gainDb: 6 }] },
    rationale: [{ param: 'cutoffHz', why: 'Hiss bothers you a lot, so the top end is a little softer.', evidence: ['kumar2008', 'made-up-study'] }],
    cautions: [], questions: ['Do you usually listen lying down?'],
  }));
};
const out = await reviewRecipe(good, request);
assert.equal(sent.model, 'claude-opus-5-5');
assert.equal(sent.fallbacks, 'default');
assert.deepEqual(sent.betas, ['server-side-fallback-2026-07-01']);
assert.deepEqual(sent.thinking, { type: 'adaptive' });
assert.equal(sent.output_config.format.type, 'json_schema');
assert.equal(sent.output_config.format.schema, REVIEW_SCHEMA);
assert.equal(sent.system[0].text, SYSTEM_PROMPT);
assert.ok(sent.system[0].cache_control);
assert.ok(SYSTEM_PROMPT.includes('kumar2008') && !SYSTEM_PROMPT.includes('personal (personal)'));
assert.ok(sent.messages[0].content.includes('"tilt"'));

// 2. Output is sanitised: out-of-range values and boosts dropped, unknown evidence removed.
assert.equal(out.adjustments.cutoffHz, 1100);
assert.equal(out.adjustments.levelOffsetDb, -3);
assert.equal(out.adjustments.humHz, undefined, 'out-of-range pitch dropped');
assert.deepEqual(out.adjustments.extraCuts, [{ hz: 3200, gainDb: -4 }], 'boost dropped');
assert.deepEqual(out.rationale[0].evidence, ['kumar2008']);
assert.equal(out.questions.length, 1);

// 3. Refusal → no changes, a caution. Truncation and junk → errors.
const refused = await reviewRecipe(async () => reply('', 'refusal'), request);
assert.deepEqual(refused.adjustments, {});
assert.equal(refused.cautions.length, 1);
await assert.rejects(reviewRecipe(async () => reply('{"adj', 'max_tokens'), request));
await assert.rejects(reviewRecipe(async () => reply('not json'), request));

// 4. Request validation: unknown fields stripped, junk and oversized bodies rejected.
assert.equal('secret' in validateRequest({ recipes: {}, secret: 'x' }), false);
assert.throws(() => validateRequest(null));
assert.throws(() => validateRequest({ intake: {} }));
assert.throws(() => validateRequest({ recipes: {}, intake: { pad: 'x'.repeat(30000) } }));
console.log('server ok');
