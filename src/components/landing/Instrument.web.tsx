/// <reference types="expo/types" />
// The landing's first screen: Still as an instrument you can touch before you install anything.
// Inspired by Gather's depth model: a dim point field framed like a lab instrument, tracker
// brackets riding on single points, a numbered rail, a control strip, Space to turn the page.
// Here the brackets read out the real recipe (level, tilt, cut-off, swell, width, fade-in), the
// dials are the app's own four dials, and Listen plays the real comfort sound from silence.
//
// Safety, in the same spirit as the room: nothing plays until Listen is pressed, sound starts in
// silence and fades in, Esc stops it, Calm view freezes every point, reduced motion starts frozen.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useFonts } from 'expo-font';
import { Manrope_300Light } from '@expo-google-fonts/manrope/300Light';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { freshProfile, recipeFor, type State } from '../../lib/profile';
import { saveOnboarded, saveProfile, saveQuietMode } from '../../lib/storage';
import * as player from '../../lib/player';
import { DIALS, TEXTURES, withDial, type Texture } from '../Studio';
import { createField, type Field } from './field';
import './instrument.css';

type DialKey = 'tone' | 'hum' | 'motion' | 'space';
type Dials = Record<DialKey, number>;
const DIAL_KEYS: DialKey[] = ['tone', 'hum', 'motion', 'space'];
const LEVELS: { value: State; label: string; field: number }[] = [
  { value: 'attack', label: 'Hushed', field: 0.7 },
  { value: 'warning', label: 'Gentle', field: 0.85 },
  { value: 'normal', label: 'Full', field: 1 },
];
const CALM_KEY = 'still.calmView';
const MINUS = '−';

// Six points carry a bracket each. Indices are fixed so the same points are followed on every form.
const TRACKS: { index: number; key: 'level' | 'tilt' | 'cutoff' | 'swell' | 'width' | 'fade'; label: string; wide?: boolean }[] = [
  { index: 211, key: 'level', label: 'Level' },
  { index: 4441, key: 'tilt', label: 'Tilt' },
  { index: 3301, key: 'cutoff', label: 'Cut-off' },
  { index: 5023, key: 'swell', label: 'Swell', wide: true },
  { index: 7411, key: 'width', label: 'Width', wide: true },
  { index: 9137, key: 'fade', label: 'Fade-in' },
];

const signed = (n: number, digits = 0) => `${n < 0 ? MINUS : n > 0 ? '+' : ''}${Math.abs(n).toFixed(digits)}`;
const hz = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} kHz` : `${Math.round(n)} Hz`);

function startingDials(): Dials {
  const r = recipeFor(freshProfile(), 'normal').recipe;
  return { tone: DIALS.tone.index(r), hum: DIALS.hum.index(r), motion: DIALS.motion.index(r), space: DIALS.space.index(r) };
}

function readCalm(): boolean {
  try { return window.localStorage.getItem(CALM_KEY) === '1'; } catch { return false; }
}

export function Instrument({ onEnter, onHow, reduced, ctaHref }: {
  /** Every "open the room" link. Called synchronously (it prevents the default), with the save to wait for. */
  onEnter: (e: MouseEvent<HTMLAnchorElement>, ready?: Promise<unknown>) => void;
  onHow: (e: MouseEvent<HTMLAnchorElement>) => void;
  reduced: boolean;
  ctaHref: string;
}) {
  const [fontsReady] = useFonts({ Manrope_300Light, Manrope_500Medium });
  const [form, setForm] = useState(0);
  const [dials, setDials] = useState<Dials>(startingDials);
  const [level, setLevel] = useState<State>('attack');
  const [touched, setTouched] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calm, setCalm] = useState(() => readCalm());
  const [tuneOpen, setTuneOpen] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [touch] = useState(() => typeof window !== 'undefined' && !window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  // Fewer points on small screens: same look, a third of the work.
  const [count] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 820 ? 12288 : 28672));

  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([]);
  const fieldRef = useRef<Field | null>(null);
  const inView = useRef(true);
  const run = useRef(0);
  const listenRef = useRef(false);
  listenRef.current = listening;

  const texture: Texture = TEXTURES[form].value;
  const profile = useMemo(() => {
    let p = freshProfile();
    p = { ...p, intake: { ...p.intake, texture } };
    for (const k of DIAL_KEYS) p = withDial(p, k, dials[k]);
    return p;
  }, [texture, dials]);
  const recipe = useMemo(() => recipeFor(profile, level).recipe, [profile, level]);
  const params = useMemo(() => ({
    tone: dials.tone / (DIALS.tone.stops.length - 1), hum: dials.hum / (DIALS.hum.stops.length - 1),
    motion: dials.motion / (DIALS.motion.stops.length - 1), space: dials.space / (DIALS.space.stops.length - 1),
  }), [dials]);

  // ------------------------------------------------------------------ the field
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const field = createField(canvas, { count, reduced });
    if (!field) { setWebgl(false); return; }
    fieldRef.current = field;
    const measure = () => {
      const f = frameRef.current, c = canvas.getBoundingClientRect();
      if (!f) return;
      const r = f.getBoundingClientRect();
      field.setFrame({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(canvas); if (frameRef.current) ro.observe(frameRef.current);
    measure();
    field.setTrackers(TRACKS.map((t, i) => ({ el: trackRefs.current[i]!, index: t.index })).filter(t => t.el));
    return () => { ro.disconnect(); field.destroy(); fieldRef.current = null; };
  }, [reduced, count]);

  useEffect(() => { fieldRef.current?.setForm(form); }, [form]);
  useEffect(() => { fieldRef.current?.setParams(params); }, [params]);
  useEffect(() => { fieldRef.current?.setLevel(LEVELS.find(l => l.value === level)!.field); }, [level]);
  useEffect(() => {
    fieldRef.current?.setCalm(calm);
    try { window.localStorage.setItem(CALM_KEY, calm ? '1' : '0'); } catch {}
  }, [calm]);

  // A little depth under a mouse. Never on touch, never in calm view or reduced motion.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || touch) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      fieldRef.current?.setTilt(((e.clientX - r.left) / r.width - 0.5) * 0.5, ((e.clientY - r.top) / r.height - 0.5) * 0.3);
    };
    const leave = () => fieldRef.current?.setTilt(0, 0);
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [touch]);

  // Space only turns the page while the instrument fills the screen; further down it scrolls as usual.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.intersectionRatio > 0.55; }, { threshold: [0, 0.55, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ------------------------------------------------------------------ sound
  const start = useCallback(async (fadeIn: number) => {
    const mine = ++run.current;
    setBusy(true);
    try {
      const uri = await player.recipeFile(recipe);
      if (mine !== run.current) return;
      await player.play(uri, { levelDb: recipe.levelDb, fadeIn, title: 'Still' });
      if (mine !== run.current) return;
      setListening(true);
      fieldRef.current?.setGlow(true, fadeIn);
    } catch {
      if (mine === run.current) setListening(false);
    } finally {
      if (mine === run.current) setBusy(false);
    }
  }, [recipe]);

  const stop = useCallback((seconds = 2) => {
    run.current++;
    player.stop(seconds);
    setListening(false); setBusy(false);
    fieldRef.current?.setGlow(false, 3);
  }, []);

  const toggleListen = () => (listening || busy ? stop() : start(recipe.fadeInS));

  // While listening, a change of texture, dial or loudness plays the new version once things settle.
  const firstRecipe = useRef(true);
  useEffect(() => {
    if (firstRecipe.current) { firstRecipe.current = false; return; }
    if (!listenRef.current) return;
    const t = window.setTimeout(() => start(0.8), 350);
    return () => window.clearTimeout(t);
  }, [recipe, start]);

  useEffect(() => () => { run.current++; player.stop(0.5); }, []);

  // ------------------------------------------------------------------ keys
  const next = useCallback(() => { setForm(f => (f + 1) % TEXTURES.length); setTouched(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === 'Escape' && listenRef.current) { stop(1.5); return; }
      if (typing) return;
      const control = !!t && (t.tagName === 'BUTTON' || t.tagName === 'A');
      if (e.key === ' ' && !control && inView.current) { e.preventDefault(); next(); }
      else if ((e.key === 'l' || e.key === 'L') && !control) toggleListenRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, stop]);
  const toggleListenRef = useRef(toggleListen);
  toggleListenRef.current = toggleListen;

  // ------------------------------------------------------------------ enter, carrying the sound
  const enter = (e: MouseEvent<HTMLAnchorElement>) => {
    if (listening || busy) stop(1.2);
    // The person shaped a sound here: the room opens with it, and the setup is already done.
    const saved = touched
      ? (async () => { await saveProfile(profile); await saveQuietMode(level); await saveOnboarded(true); })()
      : undefined;
    onEnter(e, saved);
  };
  const enterLabel = touched ? 'Open the room with this sound' : 'Open the quiet room';

  // ------------------------------------------------------------------ readouts
  const values: Record<(typeof TRACKS)[number]['key'], string> = {
    level: `${signed(recipe.levelDb)} dB`,
    tilt: `${signed(recipe.tiltDbPerOct, 1)} dB/oct`,
    cutoff: hz(recipe.cutoffHz),
    swell: `${recipe.swellDb.toFixed(1)} dB`,
    width: recipe.width.toFixed(2),
    fade: `${recipe.fadeInS.toFixed(1)} s`,
  };
  const levelLabel = LEVELS.find(l => l.value === level)!.label;
  const status = busy && !listening ? 'Preparing your sound on this device…'
    : listening ? `Listening · ${TEXTURES[form].label} · ${levelLabel} · fades in over ${recipe.fadeInS.toFixed(0)} s · Esc stops it`
    : 'Silent until you press Listen. It starts quietly and fades in.';

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <section ref={sectionRef} className={`ins${fontsReady ? ' is-ready' : ''}${calm ? ' is-calm' : ''}${listening ? ' is-listening' : ''}`}
      aria-labelledby="ins-title">
      <canvas ref={canvasRef} className="ins-canvas" aria-hidden />

      {/* Top: identity, keys, way in */}
      <header className="ins-top">
        <div className="ins-id">
          <p className="ins-word">Still</p>
          <p className="ins-meta">A quiet room for migraine days</p>
          <p className="ins-meta">Sound made on your device{webgl ? ` · ${count.toLocaleString('en-US')} points` : ''}</p>
          <p className="ins-meta">Nothing leaves it</p>
        </div>
        <p className="ins-hint" aria-hidden>{touch ? 'Tap a texture · listen when you are ready' : 'Space turns the page · L listens · Esc falls silent'}</p>
        <nav className="ins-nav" aria-label="Landing">
          <a href="#how" className="ins-link" onClick={onHow}>How it works</a>
          <a href="/privacy.html" className="ins-link">Privacy</a>
          <a href={ctaHref} className="ins-link ins-link-lamp" onClick={enter}>{enterLabel} <span aria-hidden>↗</span></a>
        </nav>
      </header>

      {/* Left: what it is, in a sentence, and the way in */}
      <div className="ins-copy">
        <p className="ins-eyebrow">For migraine days</p>
        <h1 id="ins-title" className="ins-h1">A quiet room, with one soft sound in it.</h1>
        <p className="ins-lead">Pick a texture, turn the dials, and listen. This is the real sound engine, running in your browser at the quietest level. Nothing is uploaded.</p>
        <div className="ins-actions">
          <a href={ctaHref} className="ins-btn ins-btn-primary" onClick={enter}>{enterLabel}</a>
          <button type="button" className={`ins-btn ins-btn-ghost${listening ? ' is-on' : ''}`} onClick={toggleListen} aria-pressed={listening}>
            <ListenGlyph on={listening || busy} />
            <span>{busy && !listening ? 'Preparing…' : listening ? 'Fade to silence' : 'Listen'}</span>
          </button>
        </div>
        <p className="ins-status" role="status" aria-live="polite">{status}</p>
      </div>

      {/* Centre: the frame the field lives in */}
      <div ref={frameRef} className="ins-stage" aria-hidden>
        <span className="ins-corner tl" /><span className="ins-corner tr" /><span className="ins-corner bl" /><span className="ins-corner br" />
        <span className="ins-ruler top" /><span className="ins-ruler bottom" /><span className="ins-ruler left" />
        <span className="ins-frame-label tl">{pad(form + 1)} / {pad(TEXTURES.length)} · {TEXTURES[form].label}</span>
        <span className="ins-frame-label tr">{levelLabel} · fade {recipe.fadeInS.toFixed(1)} s</span>
        <span className="ins-frame-label bl">{calm ? 'Calm view · still' : listening ? 'Listening' : 'Silent'}</span>
        {!webgl ? <FallbackMark /> : null}
      </div>

      {/* Trackers: positioned every frame by the field, straight on the element */}
      <div className="ins-trackers" aria-hidden>
        {TRACKS.map((t, i) => (
          <div key={t.key} ref={el => { trackRefs.current[i] = el; }} className={`ins-track${t.wide ? ' is-wide' : ''}`}>
            <span className="ins-bracket" />
            <span className="ins-track-text">{pad(i + 1)} {t.label} {values[t.key]}</span>
          </div>
        ))}
      </div>

      {/* Right: the four textures */}
      <div className="ins-rail" role="radiogroup" aria-label="Texture">
        {TEXTURES.map((t, i) => (
          <button key={t.value} type="button" role="radio" aria-checked={form === i} className={`ins-tex${form === i ? ' is-on' : ''}`}
            onClick={() => { setForm(i); setTouched(true); }}>
            <span className="ins-tex-glyph"><TextureGlyph i={i} /></span>
            <span className="ins-tex-num" aria-hidden>{pad(i + 1)}</span>
            <span className="ins-tex-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Bottom: the control strip */}
      <div className="ins-strip">
        <div className="ins-keys">
          <button type="button" className="ins-key is-listen" onClick={toggleListen} aria-pressed={listening}>
            <ListenGlyph on={listening || busy} /><span>{listening ? 'Silence' : 'Listen'}</span><kbd aria-hidden>L</kbd>
          </button>
          <button type="button" className="ins-key" onClick={next}>
            <NextGlyph /><span>Next</span><kbd aria-hidden>Space</kbd>
          </button>
        </div>

        <button type="button" className="ins-tune-toggle" aria-expanded={tuneOpen} aria-controls="ins-dials" onClick={() => setTuneOpen(o => !o)}>
          Tune the sound <span aria-hidden>{tuneOpen ? '−' : '+'}</span>
        </button>
        <div id="ins-dials" className={`ins-dials${tuneOpen ? ' is-open' : ''}`}>
          {DIAL_KEYS.map(k => {
            const spec = DIALS[k], max = spec.stops.length - 1;
            return (
              <label key={k} className="ins-dial">
                <span className="ins-dial-head"><span className="ins-dial-name">{spec.label}</span><span className="ins-dial-value">{spec.stops[dials[k]]}</span></span>
                <input type="range" min={0} max={max} step={1} value={dials[k]} aria-valuetext={spec.stops[dials[k]]}
                  style={{ '--fill': `${(dials[k] / max) * 100}%` } as CSSProperties}
                  onChange={e => { setDials(d => ({ ...d, [k]: Number(e.target.value) })); setTouched(true); }} />
              </label>
            );
          })}
        </div>

        <div className="ins-levels" role="radiogroup" aria-label="Loudness">
          <span className="ins-strip-label" aria-hidden>Loudness</span>
          {LEVELS.map(l => (
            <button key={l.value} type="button" role="radio" aria-checked={level === l.value} className={`ins-opt${level === l.value ? ' is-on' : ''}`}
              onClick={() => { setLevel(l.value); setTouched(true); }}>{l.label}</button>
          ))}
        </div>

        <div className="ins-calm">
          <span className="ins-strip-label" aria-hidden>View</span>
          <button type="button" className={`ins-opt${calm ? ' is-on' : ''}`} aria-pressed={calm} onClick={() => setCalm(c => !c)}>
            {calm ? 'Calm · still' : 'Calm view'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Small marks. Decorative; the words beside them carry the meaning.

function TextureGlyph({ i }: { i: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' as const };
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      {i === 0 ? <g {...common}><path d="M9 6v7M14 9v9M19 6v7M11.5 16v6M16.5 15v6" /></g> : null}
      {i === 1 ? <g {...common}><path d="M4 11c3-3 5-3 8 0s5 3 8 0 3-1 4-1" /><path d="M4 17c3-3 5-3 8 0s5 3 8 0 3-1 4-1" /></g> : null}
      {i === 2 ? <g {...common}><circle cx="14" cy="14" r="8.5" /><path d="M14 14c0-4 2-6 5-6M14 14c-3.5 2-6 1.5-7.5-1M14 14c1.5 3.5 1 6-1.5 7.5" /></g> : null}
      {i === 3 ? <g {...common}><circle cx="14" cy="12" r="5.5" /><path d="M4 18.5h20" /></g> : null}
    </svg>
  );
}

function ListenGlyph({ on }: { on: boolean }) {
  return on
    ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2.5" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" /><rect x="7.1" y="2" width="2.4" height="8" rx="0.6" fill="currentColor" /></svg>
    : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3.2 1.8v8.4L10 6z" fill="currentColor" /></svg>;
}

function NextGlyph() {
  return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2 2v8l5-4zM8 2h1.6v8H8z" fill="currentColor" /></svg>;
}

function FallbackMark() {
  return (
    <svg className="ins-fallback" width="160" height="120" viewBox="0 0 160 120" aria-hidden>
      <circle cx="80" cy="52" r="34" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10 88h140" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}
