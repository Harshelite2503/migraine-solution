// The landing's point field: a few thousand dim points that gather into the four textures (rain,
// ocean, fan, hush) and swarm from one to the next. Plain WebGL2, no library, no React: it owns one
// requestAnimationFrame loop and writes tracker positions straight to the DOM (never through state).
//
// Migraine rules baked in here, not left to callers:
// - Points are dim (additive, low alpha) and slow: nothing cycles faster than about 0.1 Hz.
// - Brightness never jumps. Level eases with a ~0.6 s time constant (about 1.8 s to settle) and the
//   listening glow follows the sound's own fade-in, linear, and falls over 3 s.
// - `calm` freezes time: no drift, no swarm, form changes become a short cross-fade.
// The same form maths exists twice (GLSL for the points, JS for the trackers). Keep them in step.

export type FieldParams = { tone: number; hum: number; motion: number; space: number };
export type TrackerEl = { el: HTMLElement; index: number };

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Seeds: four uniform numbers per point from a fixed PRNG, so trackers and shader agree.
function seeds(count: number): Float32Array {
  let a = 0x9e3779b9;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = new Float32Array(count * 4);
  for (let i = 0; i < out.length; i++) out[i] = next();
  return out;
}

// ---------------------------------------------------------------------------------------------
// GLSL. `fall(a, b, v)` is 1 below a and 0 above b (smoothstep with edge0 > edge1 is undefined).
const FORMS_GLSL = /* glsl */ `
float fall(float a, float b, float v) { return 1.0 - smoothstep(a, b, v); }

vec4 rain(vec4 s, float t) {
  // 22 lanes of soft drops inside an oval, each lane at its own slow speed: rain, not static.
  float lane = floor(s.x * 22.0);
  float speed = mix(0.025, 0.07, uMotion) * (0.6 + 0.4 * fract(lane * 0.618));
  float f = fract(s.y + t * speed);
  float y = 0.8 - f * 1.6;
  float yn = y / 0.8;
  float W = mix(0.75, 1.25, uSpace);
  float x = ((lane / 21.0) * 2.0 - 1.0) * 0.5 * W + (s.z - 0.5) * 0.012;
  x *= 0.25 + 0.75 * sqrt(max(0.0, 1.0 - yn * yn));
  float drop = smoothstep(0.15, 0.45, fract(s.y * 6.0 + lane * 0.37));
  return vec4(x, y, (fract(lane * 0.43) * 2.0 - 1.0) * 0.35, fall(0.7, 1.0, abs(yn)) * drop);
}

vec4 ocean(vec4 s, float t) {
  float W = mix(0.75, 1.25, uSpace);
  float b = floor(s.y * 7.0);
  float x = (s.x * 2.0 - 1.0) * 0.95 * W;
  float amp = mix(0.015, 0.07, uMotion);
  float sp = mix(0.12, 0.35, uMotion);
  float y = (b / 6.0 - 0.5) * 0.62 + (s.z - 0.5) * 0.025;
  y += sin(x * 2.6 + t * sp + b * 0.7) * amp * (1.0 - 0.5 * abs(x) / (0.95 * W));
  return vec4(x, y, (b / 6.0 - 0.5) * 0.9, fall(0.75, 1.0, abs(x) / (0.95 * W)));
}

vec4 fan(vec4 s, float t) {
  // Three soft swept blades turning slowly round a hub: a fan, not a disc of noise.
  float rot = t * mix(0.03, 0.12, uMotion);
  float blade = floor(s.z * 3.0);
  float r = (0.08 + 0.92 * sqrt(s.y)) * 0.56 * mix(0.85, 1.1, uSpace);
  float spread = (s.x - 0.5) * mix(0.9, 0.45, r / 0.6);
  float ang = blade * 2.0943951 + r * 2.4 + spread + rot;
  float a = fall(0.5, 0.64, r) * (1.0 - 0.55 * abs(s.x - 0.5) * 2.0);
  return vec4(cos(ang) * r, sin(ang) * r, (fract(s.z * 3.0) - 0.5) * 0.25, a);
}

vec4 hush(vec4 s, float t) {
  float W = mix(0.75, 1.25, uSpace);
  if (s.w < 0.72) {
    float th = s.x * 6.2831853;
    float ph = acos(2.0 * s.y - 1.0);
    float R = 0.3 * (1.0 + 0.012 * sin(t * 0.5));
    return vec4(R * sin(ph) * cos(th), 0.12 + R * cos(ph), R * sin(ph) * sin(th), 0.9);
  }
  float x = (s.x * 2.0 - 1.0) * 0.9 * W;
  return vec4(x, -0.2 + (s.y - 0.5) * 0.006, (s.z - 0.5) * 0.3, fall(0.6, 1.0, abs(x) / (0.9 * W)) * 0.8);
}

vec4 form(float i, vec4 s, float t) {
  if (i < 0.5) return rain(s, t);
  if (i < 1.5) return ocean(s, t);
  if (i < 2.5) return fan(s, t);
  return hush(s, t);
}
`;

const VS = /* glsl */ `#version 300 es
precision highp float;
in vec4 aSeed;
uniform float uTime, uProgress, uFrom, uTo;
uniform float uTone, uHum, uMotion, uSpace, uLevel, uGlow, uDpr;
uniform vec2 uCenter, uScale, uTilt;
out float vAlpha;
out vec3 vColor;
${FORMS_GLSL}
void main() {
  vec4 s = aSeed;
  float delay = fract(s.w * 7.13) * 0.4;
  float e = smoothstep(0.0, 1.0, clamp((uProgress - delay) / 0.6, 0.0, 1.0));
  vec4 A = form(uFrom, s, uTime);
  vec4 B = form(uTo, s, uTime);
  vec3 p = mix(A.xyz, B.xyz, e);
  float alpha = mix(A.w, B.w, e);
  float sw = sin(e * 3.14159265);
  p += vec3(sin(uTime * 0.6 + s.x * 31.0), cos(uTime * 0.5 + s.y * 29.0), sin(uTime * 0.4 + s.z * 23.0)) * 0.09 * sw;
  float d = length(p.xy);
  p.xy *= 1.0 + uHum * 0.035 * sin(d * 22.0 - uTime * 0.45);
  // A small tilt for depth, then a gentle perspective.
  float cy = cos(uTilt.x), sy = sin(uTilt.x), cx = cos(uTilt.y), sx = sin(uTilt.y);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  float f = 2.2 / (2.2 - p.z);
  gl_Position = vec4(uCenter + p.xy * f * uScale, 0.0, 1.0);
  gl_PointSize = (1.4 + 1.4 * s.z + uGlow * 0.6) * uDpr * f;
  // Visible as points, never as a glare: even the densest overlap stays well below full lamp colour.
  vAlpha = alpha * mix(0.12, 0.28, s.z) * uLevel * (1.0 + 0.5 * uGlow) * mix(0.75, 1.0, uTone);
  vec3 deep = vec3(0.54, 0.41, 0.26), lamp = vec3(0.76, 0.60, 0.38), airy = vec3(0.91, 0.89, 0.85);
  vec3 c = uTone < 0.5 ? mix(deep, lamp, uTone * 2.0) : mix(lamp, airy, (uTone - 0.5) * 2.0);
  vColor = mix(c, airy, step(0.78, s.z) * 0.45);
}`;

const FS = /* glsl */ `#version 300 es
precision mediump float;
in float vAlpha;
in vec3 vColor;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vAlpha;
  outColor = vec4(vColor * a, a);
}`;

// ---------------------------------------------------------------------------------------------
// The JS mirror, for trackers. Same maths as above, one point at a time.
const fract = (v: number) => v - Math.floor(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const fall = (a: number, b: number, v: number) => 1 - smooth(a, b, v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type V4 = [number, number, number, number];

function formJS(i: number, s: V4, t: number, P: FieldParams): V4 {
  const W = mix(0.75, 1.25, P.space);
  if (i === 0) {
    const lane = Math.floor(s[0] * 22);
    const f = fract(s[1] + t * mix(0.025, 0.07, P.motion) * (0.6 + 0.4 * fract(lane * 0.618)));
    const y = 0.8 - f * 1.6, yn = y / 0.8;
    const x = (((lane / 21) * 2 - 1) * 0.5 * W + (s[2] - 0.5) * 0.012) * (0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - yn * yn)));
    const drop = smooth(0.15, 0.45, fract(s[1] * 6 + lane * 0.37));
    return [x, y, (fract(lane * 0.43) * 2 - 1) * 0.35, fall(0.7, 1, Math.abs(yn)) * drop];
  }
  if (i === 1) {
    const b = Math.floor(s[1] * 7), x = (s[0] * 2 - 1) * 0.95 * W;
    let y = (b / 6 - 0.5) * 0.62 + (s[2] - 0.5) * 0.025;
    y += Math.sin(x * 2.6 + t * mix(0.12, 0.35, P.motion) + b * 0.7) * mix(0.015, 0.07, P.motion) * (1 - 0.5 * Math.abs(x) / (0.95 * W));
    return [x, y, (b / 6 - 0.5) * 0.9, fall(0.75, 1, Math.abs(x) / (0.95 * W))];
  }
  if (i === 2) {
    const rot = t * mix(0.03, 0.12, P.motion);
    const blade = Math.floor(s[2] * 3);
    const r = (0.08 + 0.92 * Math.sqrt(s[1])) * 0.56 * mix(0.85, 1.1, P.space);
    const ang = blade * 2.0943951 + r * 2.4 + (s[0] - 0.5) * mix(0.9, 0.45, r / 0.6) + rot;
    const a = fall(0.5, 0.64, r) * (1 - 0.55 * Math.abs(s[0] - 0.5) * 2);
    return [Math.cos(ang) * r, Math.sin(ang) * r, (fract(s[2] * 3) - 0.5) * 0.25, a];
  }
  if (s[3] < 0.72) {
    const th = s[0] * TAU, ph = Math.acos(2 * s[1] - 1), R = 0.3 * (1 + 0.012 * Math.sin(t * 0.5));
    return [R * Math.sin(ph) * Math.cos(th), 0.12 + R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th), 0.9];
  }
  const x = (s[0] * 2 - 1) * 0.9 * W;
  return [x, -0.2 + (s[1] - 0.5) * 0.006, (s[2] - 0.5) * 0.3, fall(0.6, 1, Math.abs(x) / (0.9 * W)) * 0.8];
}

// ---------------------------------------------------------------------------------------------

export type Field = {
  count: number;
  setForm(i: number): void;
  setParams(p: FieldParams): void;
  setLevel(level: number): void;
  /** Glow up to 1 over `seconds` (the sound's fade-in), or down to 0 over 3 s. */
  setGlow(on: boolean, seconds: number): void;
  setCalm(calm: boolean): void;
  setTilt(x: number, y: number): void;
  setFrame(rect: { x: number; y: number; w: number; h: number }): void;
  setTrackers(t: TrackerEl[]): void;
  destroy(): void;
};

export function createField(canvas: HTMLCanvasElement, opts: { count: number; reduced: boolean }): Field | null {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(sh)); return null; }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);

  const count = opts.count;
  const seed = seeds(count);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aSeed');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.disable(gl.DEPTH_TEST);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = { time: U('uTime'), progress: U('uProgress'), from: U('uFrom'), to: U('uTo'), tone: U('uTone'), hum: U('uHum'), motion: U('uMotion'), space: U('uSpace'), level: U('uLevel'), glow: U('uGlow'), dpr: U('uDpr'), center: U('uCenter'), scale: U('uScale'), tilt: U('uTilt') };

  // State. Everything that changes per frame lives here, never in React.
  let params: FieldParams = { tone: 0.33, hum: 0, motion: 0.33, space: 0.5 };
  let from = 0, to = 0, progress = 1, pending: number | null = null;
  let time = 0, last = performance.now(), raf = 0, running = true, visible = true;
  let level = 0, levelTarget = 0.7;
  let glow = 0, glowTarget = 0, glowRate = 1 / 3;
  let calm = opts.reduced, tilt = [0, 0], tiltTarget = [0, 0];
  let frame = { x: 0, y: 0, w: 1, h: 1 }, cw = 1, ch = 1, dpr = 1;
  let trackers: TrackerEl[] = [];
  let dirty = true;
  const TRANSITION_S = 2.6;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = canvas.clientWidth || 1; ch = canvas.clientHeight || 1;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    dirty = true;
  };
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  const project = (p: V4) => {
    const [ax, ay] = tilt;
    const cy = Math.cos(ax), sy = Math.sin(ax), cx = Math.cos(ay), sx = Math.sin(ay);
    let x = cy * p[0] + sy * p[2], y = p[1], z = -sy * p[0] + cy * p[2];
    const y2 = cx * y - sx * z; z = sx * y + cx * z; y = y2;
    const f = 2.2 / (2.2 - z), s = Math.min(frame.w, frame.h) / 2 * 0.95;
    return { x: frame.x + frame.w / 2 + x * f * s, y: frame.y + frame.h / 2 - y * f * s };
  };

  const placeTrackers = () => {
    const shown: { x: number; y: number }[] = [];
    for (const t of trackers) {
      const i = t.index % count, s: V4 = [seed[i * 4], seed[i * 4 + 1], seed[i * 4 + 2], seed[i * 4 + 3]];
      const delay = fract(s[3] * 7.13) * 0.4;
      const e = smooth(0, 1, clamp01((progress - delay) / 0.6));
      const A = formJS(from, s, time, params), B = formJS(to, s, time, params);
      const sw = Math.sin(e * Math.PI);
      const p: V4 = [
        mix(A[0], B[0], e) + Math.sin(time * 0.6 + s[0] * 31) * 0.09 * sw,
        mix(A[1], B[1], e) + Math.cos(time * 0.5 + s[1] * 29) * 0.09 * sw,
        mix(A[2], B[2], e) + Math.sin(time * 0.4 + s[2] * 23) * 0.09 * sw,
        mix(A[3], B[3], e),
      ];
      const d = Math.hypot(p[0], p[1]), k = 1 + params.hum * 0.035 * Math.sin(d * 22 - time * 0.45);
      p[0] *= k; p[1] *= k;
      const q = project(p);
      // Hide a tracker whose point has faded (rain ends, ocean edges) or is mid-swarm.
      // A label that would sit on top of one already shown is hidden rather than overprinted.
      const clear = shown.every(o => Math.abs(o.y - q.y) > 18 || Math.abs(o.x - q.x) > 210);
      const show = clear && p[3] > 0.45 && (progress >= 1 || e < 0.05 || e > 0.95);
      if (show) shown.push(q);
      // Near the right edge the label sits to the left of its point instead of running off screen.
      const flip = q.x > cw - 200;
      t.el.dataset.flip = flip ? '1' : '0';
      t.el.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0)${flip ? ' translateX(-100%)' : ''}`;
      t.el.style.opacity = show ? '1' : '0';
    }
  };

  const draw = () => {
    const s = Math.min(frame.w, frame.h) / 2 * 0.95;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.time, time); gl.uniform1f(u.progress, progress); gl.uniform1f(u.from, from); gl.uniform1f(u.to, to);
    gl.uniform1f(u.tone, params.tone); gl.uniform1f(u.hum, params.hum); gl.uniform1f(u.motion, params.motion); gl.uniform1f(u.space, params.space);
    gl.uniform1f(u.level, level); gl.uniform1f(u.glow, glow); gl.uniform1f(u.dpr, dpr);
    gl.uniform2f(u.center, ((frame.x + frame.w / 2) / cw) * 2 - 1, 1 - ((frame.y + frame.h / 2) / ch) * 2);
    gl.uniform2f(u.scale, (s * 2) / cw, (s * 2) / ch);
    gl.uniform2f(u.tilt, tilt[0], tilt[1]);
    gl.drawArrays(gl.POINTS, 0, count);
    placeTrackers();
  };

  const tick = (now: number) => {
    raf = 0;
    if (!running) return;
    // Real elapsed time (capped so a stall cannot make points leap), so a slow device does not stretch the swarm.
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    let moving = false;
    if (!calm) { time += dt; moving = true; }
    if (progress < 1) {
      progress = calm ? 1 : Math.min(1, progress + dt / TRANSITION_S); moving = true;
      if (progress >= 1 && pending !== null) { from = to; to = pending; pending = null; progress = 0; }
    }
    // Brightness eases: level with a 0.6 s time constant, glow at the sound's own rate.
    const k = 1 - Math.exp(-dt / 0.6);
    if (Math.abs(levelTarget - level) > 0.001) { level += (levelTarget - level) * k; moving = true; } else level = levelTarget;
    if (glow !== glowTarget) {
      const step = glowRate * dt;
      glow = glowTarget > glow ? Math.min(glowTarget, glow + step) : Math.max(glowTarget, glow - step); moving = true;
    }
    if (!calm) {
      const kt = 1 - Math.exp(-dt / 0.35);
      tilt = [tilt[0] + (tiltTarget[0] - tilt[0]) * kt, tilt[1] + (tiltTarget[1] - tilt[1]) * kt];
    }
    if (moving || dirty) { draw(); dirty = false; }
    if (visible && (moving || !calm)) raf = requestAnimationFrame(tick);
  };
  const wake = () => { dirty = true; if (!raf && running && visible) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  // Pause off-screen and in background tabs: no work nobody can see.
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && !document.hidden; if (visible) wake(); }, { threshold: 0 });
  io.observe(canvas);
  const onVis = () => { visible = !document.hidden; if (visible) wake(); };
  document.addEventListener('visibilitychange', onVis);
  wake();

  return {
    count,
    setForm(i) {
      if (i === to && pending === null) return;
      if (calm) {
        // A cross-fade instead of a swarm, at the room's brightness pace: darker over 900 ms, brighter over 700 ms.
        canvas.style.transition = 'opacity 900ms ease-in-out';
        canvas.style.opacity = '0';
        window.setTimeout(() => {
          from = i; to = i; progress = 1; pending = null; wake();
          canvas.style.transition = 'opacity 700ms ease-in-out';
          canvas.style.opacity = '';
        }, 900);
        return;
      }
      if (progress < 1) { pending = i; return; } // finish the current swarm first, then go on
      from = to; to = i; progress = 0; wake();
    },
    setParams(p) { params = p; wake(); },
    setLevel(l) { levelTarget = l; wake(); },
    setGlow(on, seconds) { glowTarget = on ? 1 : 0; glowRate = on ? 1 / Math.max(0.5, seconds) : 1 / 3; wake(); },
    setCalm(c) { calm = c || opts.reduced; if (calm) { tiltTarget = [0, 0]; tilt = [0, 0]; if (progress < 1) { from = to; progress = 1; pending = null; } } wake(); },
    setTilt(x, y) { if (calm) return; tiltTarget = [x, y]; wake(); },
    setFrame(r) { frame = r; wake(); },
    setTrackers(t) { trackers = t; wake(); },
    destroy() {
      running = false; if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', onVis);
      gl.deleteBuffer(buf); gl.deleteVertexArray(vao); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
    },
  };
}
