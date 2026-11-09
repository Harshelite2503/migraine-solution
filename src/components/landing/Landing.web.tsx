/// <reference types="expo/types" />
// The web landing page at /welcome. Plain DOM and CSS, with Motion for the reveals and the scroll dusk.
// Read top to bottom it descends from dusk to the app's own floor, so entering the room has no seam.
// No sound plays here and nothing is interactive beyond links: this page explains, the room does.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from 'react';
import { MotionConfig, motion, stagger, useInView, useReducedMotion, type Variants } from 'motion/react';
import { router, useIsFocused } from 'expo-router';
import { colors, type SceneTexture } from '../../lib/theme';
import { useAppFonts } from '../../lib/fonts';
import { markWelcomed } from '../../lib/welcome';
import { Instrument } from './Instrument.web';
import './landing.css'; // typed by expo/types (referenced above); expo-env.d.ts is not committed

const SOURCE_URL = 'https://github.com/shivankur-code/migraine-solution';
const CTA = 'Open the quiet room';
const LEAVE_MS = 240;

// The palette arrives as custom properties, so landing.css never repeats a value from theme.ts.
const PALETTE = {
  '--night': colors.night,
  '--black': colors.black,
  '--solid': colors.solid,
  '--smoke': colors.smoke,
  '--smoke-pressed': colors.smokePressed,
  '--hairline': colors.hairline,
  '--hairline-lit': colors.hairlineLit,
  '--ink': colors.ink,
  '--ink2': colors.ink2,
  '--ink3': colors.ink3,
  '--lamp': colors.lamp,
  '--lamp-deep': colors.lampDeep,
  '--lamp-glow': colors.lampGlow,
  '--lamp-track': colors.lampTrack,
  '--on-lamp': colors.onLamp,
  '--rose': colors.rose,
  '--focus-ring': colors.focusRing,
  '--glass': colors.glass,
  '--rain-floor-0': colors.scene.rain.floor[0],
  '--rain-floor-1': colors.scene.rain.floor[1],
} as CSSProperties;

// Reveals: a 12 px rise and a fade, critically damped. MotionConfig drops the rise under reduced motion.
const SPRING = { type: 'spring', bounce: 0, visualDuration: 0.55 } as const;
const rise: Variants = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: SPRING } };
const group: Variants = { hidden: {}, shown: { transition: { delayChildren: stagger(0.08) } } };

/** A left click with no modifier: the only click we take over. Cmd/middle click still opens a new tab. */
function plainClick(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function Landing() {
  const focused = useIsFocused();
  const { ready } = useAppFonts();
  const reduced = useReducedMotion() === true;
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  // Arriving on the route puts keyboard and screen-reader focus at the start of the content.
  useEffect(() => {
    if (!focused) return;
    setLeaving(false);
    mainRef.current?.focus({ preventScroll: true });
  }, [focused]);

  // Every CTA: remember the visit, fade the page out, then hand over to the room on the same floor colour.
  // `ready` lets the instrument finish saving a sound the person shaped before the room opens.
  const enter = (e: MouseEvent<HTMLAnchorElement>, ready?: Promise<unknown>) => {
    markWelcomed();
    if (!plainClick(e)) return;
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    const fade = new Promise(r => { leaveTimer.current = setTimeout(r, LEAVE_MS); });
    Promise.all([fade, ready]).catch(() => {}).then(() => router.navigate('/'));
  };

  // In-page jumps scroll our own container and move focus with them, without touching the URL.
  const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  };

  if (!focused) return null;

  const view = { once: true, margin: '-10%', root: rootRef as RefObject<Element | null> } as const;
  // A plain function, not a component, so re-renders never remount the links (and drop focus).
  const cta = (className: string) => <a href="/" className={className} onClick={enter}>{CTA}</a>;

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className={`lp${leaving ? ' is-leaving' : ''}`} style={PALETTE}>
        <div className="lp-night" aria-hidden />

        <div className={`lp-page${ready ? ' is-ready' : ''}${leaving ? ' is-leaving' : ''}`}>
          {/* 0. For someone mid-attack: the way out comes before everything else, in DOM and tab order. */}
          <div className="lp-now">
            <div className="lp-wrap">
              <span>Headache right now? Skip all this.</span>
              {cta('lp-btn lp-btn-outline lp-btn-pill')}
            </div>
          </div>

          <a href="#main" className="lp-skip" onClick={jump('main')}>Skip to content</a>

          <main id="main" ref={mainRef} tabIndex={-1}>
            {/* 1. The instrument: the real sound engine, to touch before anything else (see Instrument.web.tsx) */}
            <Instrument onEnter={enter} onHow={jump('how')} reduced={reduced} ctaHref="/" />

            {/* 3. Three choices */}
            <section id="how" className="lp-section" aria-labelledby="lp-how" tabIndex={-1}>
              <div className="lp-wrap">
                <motion.div className="lp-stack lp-col" variants={group} initial="hidden" whileInView="shown" viewport={view}>
                  <motion.p className="lp-eyebrow" variants={rise}>How it works</motion.p>
                  <motion.h2 id="lp-how" className="lp-h2" variants={rise}>Three choices, and nothing else to read.</motion.h2>
                  <motion.p className="lp-lead" variants={rise}>
                    The room has one thing to press and two ways out. Nothing asks you a question while the sound plays.
                  </motion.p>
                </motion.div>
                <motion.ul className="lp-cards" style={{ marginTop: 32 }} variants={group} initial="hidden" whileInView="shown" viewport={view}>
                  <Choice scene="hush" tint={0.9} title="Dark screen" text="Black and silent. One tap comes back." />
                  <Choice scene="ocean" tint={0} title="Your sound" text="Made from a few choices you make by ear. It starts in silence." />
                  <Choice scene="ocean" tint={0.35} title="Softer" text="The same sound, quieter and darker." />
                </motion.ul>
              </div>
            </section>

            {/* 4. It starts in silence */}
            <section className="lp-section" aria-labelledby="lp-silence">
              <div className="lp-wrap">
                <motion.div className="lp-stack lp-col" variants={group} initial="hidden" whileInView="shown" viewport={view}>
                  <motion.p className="lp-eyebrow" variants={rise}>Sound</motion.p>
                  <motion.h2 id="lp-silence" className="lp-h2" variants={rise}>It starts in silence.</motion.h2>
                  <motion.p className="lp-lead" variants={rise}>
                    Press play and nothing happens for a moment. Then the sound rises over six seconds or more, so it
                    never arrives all at once. During a headache it plays well below your everyday level, and the
                    volume always ramps; it never jumps.
                  </motion.p>
                  <motion.div variants={rise}>
                    <FadeTrack root={rootRef} />
                  </motion.div>
                </motion.div>
              </div>
            </section>

            {/* 5. Privacy: the darkest point of the page */}
            <section className="lp-section" aria-labelledby="lp-privacy">
              <div className="lp-wrap">
                <motion.div className="lp-col" variants={group} initial="hidden" whileInView="shown" viewport={view}>
                  <div className="lp-stack">
                    <motion.p className="lp-eyebrow" variants={rise}>Privacy</motion.p>
                    <motion.h2 id="lp-privacy" className="lp-h2" variants={rise}>Made on your device, kept on your device.</motion.h2>
                    <motion.p className="lp-italic" variants={rise}>No account. No analytics. No ads.</motion.p>
                  </div>
                  <motion.div className="lp-wall" variants={rise}>
                    <Wall reduced={reduced} view={view} />
                  </motion.div>
                  <motion.ul className="lp-rows" variants={rise}>
                    <li className="lp-row"><span className="lp-row-dot" aria-hidden /><p>Your sound is made on the phone. The questions, the listening tests and the sound itself all run on the device.</p></li>
                    <li className="lp-row"><span className="lp-row-dot" aria-hidden /><p>Your answers and your journal are stored only on this device.</p></li>
                    <li className="lp-row"><span className="lp-row-dot" aria-hidden /><p>Still works fully offline after install.</p></li>
                    <li className="lp-row is-dim"><span className="lp-row-dot" aria-hidden /><p className="lp-caption is-dim">The one exception is an optional AI review of your settings. It is off until you switch it on, and you can preview the exact data first.</p></li>
                  </motion.ul>
                </motion.div>
              </div>
            </section>

            {/* 6. Tuned by ear */}
            <section className="lp-section" aria-labelledby="lp-tune">
              <div className="lp-wrap">
                <motion.div className="lp-tune" variants={group} initial="hidden" whileInView="shown" viewport={view}>
                  <div className="lp-stack lp-col">
                    <motion.p className="lp-eyebrow" variants={rise}>My sound</motion.p>
                    <motion.h2 id="lp-tune" className="lp-h2" variants={rise}>Tuned by ear, not by settings.</motion.h2>
                    <motion.p className="lp-lead" variants={rise}>
                      Pick a texture: rain, ocean, a fan, or a plain hush. Four click-stop dials, Tone, Hum, Motion and
                      Space, change it while it plays. If you would rather not decide, Still plays two versions and asks
                      which felt calmer, a few times over, and learns from your answers.
                    </motion.p>
                  </div>
                  <motion.div className="lp-tune-art" variants={rise} aria-hidden>
                    <DialPicture />
                    <div className="lp-pads">
                      <span className="lp-pad">A</span>
                      <span className="lp-pad is-on">B</span>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            </section>

            {/* 7. The medical line: never collapsed, never animated */}
            <section className="lp-section lp-medical" aria-labelledby="lp-medical">
              <div className="lp-wrap">
                <div className="lp-medical-line">
                  <h2 id="lp-medical" className="lp-visually-hidden">For comfort, not treatment</h2>
                  <p>Still does not diagnose, treat or prevent migraine. A new, sudden or worst-ever headache needs medical care.</p>
                </div>
              </div>
            </section>

            {/* 8. Enter */}
            <section className="lp-section lp-enter" aria-labelledby="lp-enter">
              <div className="lp-wrap">
                <motion.div className="lp-stack lp-col" variants={group} initial="hidden" whileInView="shown" viewport={view}>
                  <motion.h2 id="lp-enter" className="lp-h2" variants={rise}>The room is ready when you need it.</motion.h2>
                  <motion.p className="lp-lead" variants={rise}>It opens dark and quiet, with nothing to read first.</motion.p>
                  <motion.div variants={rise}>
                    {cta('lp-btn lp-btn-primary')}
                  </motion.div>
                </motion.div>
              </div>
            </section>
          </main>

          <footer className="lp-foot">
            <div className="lp-wrap">
              <div className="lp-foot-hints">
                <p><span className="lp-label">On iPhone</span><br />In Safari, tap Share, then Add to Home Screen.</p>
                <p><span className="lp-label">On Android</span><br />In Chrome, open the menu, then Add to Home screen.</p>
              </div>
              <nav className="lp-foot-links" aria-label="More">
                <a href="/privacy.html" className="lp-link">Privacy</a>
                <a href={SOURCE_URL} className="lp-link" rel="noopener noreferrer">Source on GitHub</a>
              </nav>
              <p>Made on your device. Nothing leaves it.</p>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}

function Choice({ scene, tint, title, text }: { scene: SceneTexture; tint: number; title: string; text: string }) {
  const s = colors.scene[scene];
  const style = { '--scene-0': s.floor[0], '--scene-1': s.floor[1], '--tint': tint } as CSSProperties;
  return (
    <motion.li className="lp-card" variants={rise}>
      <div className={`lp-card-scene${s.horizon && tint < 0.5 ? ' has-horizon' : ''}`} style={style} aria-hidden />
      <div className="lp-card-body">
        <h3 className="lp-h3">{title}</h3>
        <p>{text}</p>
      </div>
    </motion.li>
  );
}

/** The fade-in, drawn: a 2 px track that fills over exactly 6 s, once, when it comes into view. */
function FadeTrack({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useInView(ref, { once: true, margin: '-10%', root: root as RefObject<Element | null> });
  return (
    <div>
      <div ref={ref} className={`lp-track${live ? ' is-live' : ''}`} aria-hidden>
        <div className="lp-track-fill" />
      </div>
      <div className="lp-track-ends" aria-hidden>
        <span className="lp-label">silence</span>
        <span className="lp-label">your level</span>
      </div>
      <div className="lp-captions">
        <p className="lp-caption">14 dB below a normal day during a headache</p>
        <p className="lp-caption">never louder than you chose</p>
      </div>
    </div>
  );
}

/** The privacy sentence as a picture: the lamp line crosses "your phone" and stops dead at the wall. */
function Wall({ reduced, view }: { reduced: boolean; view: { once: boolean; margin: string; root: RefObject<Element | null> } }) {
  return (
    <div aria-hidden>
      <svg viewBox="0 0 600 48" preserveAspectRatio="none" focusable="false">
        <rect className="lp-wall-strip" x="0.5" y="8.5" width="419" height="31" rx="15.5" />
        <motion.path className="lp-wall-line" d="M16 24 H416"
          initial={{ pathLength: reduced ? 1 : 0 }} whileInView={{ pathLength: 1 }} viewport={view}
          transition={{ duration: reduced ? 0 : 1.8, ease: [0.4, 0, 1, 1] }} />
        <line className="lp-wall-edge" x1="420" y1="0" x2="420" y2="48" />
      </svg>
      <div className="lp-wall-labels">
        <span className="lp-label">your phone</span>
        <span className="lp-label">nothing leaves it</span>
      </div>
    </div>
  );
}

/** A still picture of a click-stop dial at its third of six stops. Decorative. */
function DialPicture() {
  const stops = 6, lit = 3, c = 80;
  const angle = (i: number) => (-135 + (270 * i) / (stops - 1)) * (Math.PI / 180);
  const at = (i: number, r: number) => ({ x: c + r * Math.sin(angle(i)), y: c - r * Math.cos(angle(i)) });
  const tip = at(lit - 1, 38), base = at(lit - 1, 22);
  return (
    <svg className="lp-dial" viewBox="0 0 160 160" focusable="false">
      <circle className="lp-dial-face" cx={c} cy={c} r={62} />
      <circle className="lp-dial-inner" cx={c} cy={c} r={46} />
      <line className="lp-dial-mark" x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} />
      {Array.from({ length: stops }, (_, i) => {
        const p = at(i, 74);
        return <circle key={i} className={`lp-dial-dot${i < lit ? ' is-lit' : ''}`} cx={p.x} cy={p.y} r={2.5} />;
      })}
    </svg>
  );
}
