// Render a grid of Still sounds (attack state) that varies one design choice at a time.
import fs from 'node:fs';
import { renderComfortLoop, rng } from '../../src/engine/comfort-engine.js';
import { buildRecipe, renderOptions } from '../../src/recipe/recipe.js';
import { clampRecipe } from '../../src/recipe/bounds.js';
import { encodeWav } from '../../src/engine/wav.js';
const out = process.argv[2], RATE = 48000, SECONDS = 30;
const base = buildRecipe({ intake: {}, tests: {}, calibration: {}, trims: {}, baseLevelDb: 0 }, 'attack').recipe;
const tile = (a) => { const n = RATE * SECONDS, y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = a[i % a.length]; return y; };
const meta = [];
function render(name, over) {
  const r = clampRecipe({ ...base, ...over }, 'attack');
  const { x, opts } = renderOptions(r);
  const s = renderComfortLoop(x, { ...opts, rate: RATE, log2Length: 19, seed: 21 });
  fs.writeFileSync(`${out}/${name}.wav`, encodeWav(tile(s.left), tile(s.right), RATE));
  meta.push({ name, tilt: r.tiltDbPerOct, cutoff: r.cutoffHz, tonal: r.tonal, humHz: r.humHz, texture: r.texture, swellDb: r.swellDb });
}
for (const tilt of [-8, -6, -4, -2]) for (const cutoff of [800, 2000, 6000]) for (const tonal of [0, 0.5])
  render(`grid_t${-tilt}_c${cutoff}_h${tonal * 10}`, { tiltDbPerOct: tilt, cutoffHz: cutoff, tonal, texture: 'none', swellDb: 0 });
for (const texture of ['rain', 'ocean', 'fan']) for (const cutoff of [1200, 4000])
  render(`tex_${texture}_c${cutoff}`, { tiltDbPerOct: -6, cutoffHz: cutoff, tonal: 0, texture, textureAmount: 0.8 });
render('still_default_attack', {});
// Controls: white, pink, brown noise.
const n = RATE * SECONDS, rand = rng(5), w = new Float32Array(n), p = new Float32Array(n), b = new Float32Array(n);
let b0 = 0, b1 = 0, b2 = 0, br = 0;
for (let i = 0; i < n; i++) {
  const g = rand.gauss() * 0.1; w[i] = g;
  b0 = 0.99765 * b0 + g * 0.0990460; b1 = 0.96300 * b1 + g * 0.2965164; b2 = 0.57000 * b2 + g * 1.0526913; p[i] = (b0 + b1 + b2 + g * 0.1848) * 0.25;
  br = 0.998 * br + g * 0.05; b[i] = br;
}
for (const [k, v] of [['white', w], ['pink', p], ['brown', b]]) { fs.writeFileSync(`${out}/control_${k}.wav`, encodeWav(v, v, RATE)); meta.push({ name: `control_${k}` }); }
fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1));
console.log(meta.length, 'sounds');
