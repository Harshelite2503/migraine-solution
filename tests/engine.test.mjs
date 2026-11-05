// Sound engine and app profile rules, run in Node (no phone needed).
import assert from 'node:assert/strict';
import { renderComfortLoop, MODES, aWeightedLevelDb, REFERENCE_DBFS } from '../src/engine/comfort-engine.js';
import { encodeWav } from '../src/engine/wav.js';
import { PreferenceGP, startingPoint } from '../src/engine/preference-model.js';

const RATE = 44100;
const loop = renderComfortLoop([.25, .15, 0, .3], { rate: RATE, log2Length: 18, seed: 21, mode: 'attack' });
assert.equal(loop.left.length, 2 ** 18);
assert.ok(loop.left.reduce((m, v) => Math.max(m, Math.abs(v)), 0) <= .35 + 1e-9, 'peaks stay under the engine limit');
const level = aWeightedLevelDb(loop.left, RATE);
assert.ok(Math.abs(level - REFERENCE_DBFS) < 1.5, `loop is loudness-normalised (${level.toFixed(1)} dBFS)`);

// WAV: valid header, right size, samples clipped to 16-bit range.
const wav = encodeWav(loop.left, loop.right, RATE);
const view = new DataView(wav.buffer);
assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
assert.equal(view.getUint16(22, true), 2);
assert.equal(view.getUint32(24, true), RATE);
assert.equal(wav.length, 44 + loop.left.length * 4);
const extreme = encodeWav(new Float32Array([2, -2, 0]), null, 8000);
const ev = new DataView(extreme.buffer);
assert.equal(ev.getInt16(44, true), 32767); assert.equal(ev.getInt16(46, true), -32768);

// Harder states are never louder than a normal day.
for (const s of ['warning', 'attack', 'recovering']) assert.ok(MODES[s].offsetDb < 0);

// Preference learner round-trips through JSON and finds the preferred sound.
const m = new PreferenceGP();
const fav = [.2, .3, .05, .25];
for (const o of [[.7, .1, .5, .8], [.5, .6, .3, .6], [.1, .9, .2, .4]]) m.addComparison(fav, o);
assert.deepEqual(PreferenceGP.fromJSON(m.toJSON()).champion(), fav);
assert.equal(startingPoint({}).length, 4);
console.log('engine ok');
