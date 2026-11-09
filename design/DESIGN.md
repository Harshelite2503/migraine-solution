# Still: the final design spec

**Spine: Lowlight** (highest tally, 134), built on **Riverstone's motion primitives** and **Hearth's two motion rules**, with **Lamplight's humane defaults** grafted in. Every judge warning below is resolved in the text; the "Do not do" list at the end is the contract.

One sentence for the build team: *the screen is the room the person is resting in; the lamp is the only bright thing in it; nothing moves unless a finger moves it, and nothing gets brighter faster than a dark-adapted eye can take.*

The sound engine, recipes, player, storage, profile and activity code (`src/engine`, `src/recipe`, `src/lib/player.ts`, `output*.ts`, `sounds.ts`, `soundCache*.ts`, `storage.ts`, `profile.ts`, `activity.ts`, `account.ts`, `sharing.ts`, `ai.ts`, `supabase.ts`) are **not touched**. Every handler the screens call today (`playSound`, `stopSound`, `darkOnly`, `worse`, `answer`, `changeState`, `usePreview`, `withDial`, the staircase) is kept and re-skinned.

---

## 1. What the judges settled, and how this spec resolves it

| Judge warning | Resolution in this spec |
|---|---|
| Lowlight's ambient scene motion (drifting rain, rotating fan wedge, breathing field points) and 2.5% grain are on by default; fine pattern and slow drift are visual-stress triggers | **Cut entirely.** Scenes are static stacked gradients plus one horizon hairline. No grain, no streaks, no wedge, no points, in any mode. Banding is controlled by keeping each scene's luminance span narrow (sky to floor within 0.004 relative luminance) and verified on hardware at 25% brightness. |
| Loudness-as-depth and Softer re-light the whole viewport | Depth changes only the **floor layer** (the lower 45% of the viewport) and the horizon position. The sky layer never changes luminance after mount. Max tint delta 0.25 alpha over 1800 ms. |
| Two targets live at 28% during auto-dim; a groping hand can stop the sound and write a 4 dB change to the profile | **Nothing acts while dimmed.** The first touch anywhere only wakes (700 ms). The lamp caption and the "making it worse" bar stay *visible* at 28% so the person knows where they are, but they are `pointerEvents="none"` under the veil. Today's contract ("any touch brings it back and never stops the sound") is kept exactly. |
| Lowlight contradiction: 600 ms luminance minimum vs 400 ms wake; Hearth's 600/400 dark screen | **Brightness rule (Lamplight):** darker in ≥ 900 ms, brighter in ≥ 700 ms, always `withTiming` + `Easing.inOut(Easing.cubic)`, never a spring. Wake 700, dim 1600, dark screen 900 to black and 700 back. |
| Depth rail beside a 232 pt lamp is crowded on 375 | Loudness is a **three-segment control beneath the lamp**, full width, 48 pt; commits on tap, no drag-crossing. |
| Texture pill adds a sheet and a decision to the attack screen | **Cut.** Texture is chosen in My sound. The Quiet room has exactly one decision (play) and two escapes (Dark screen, Softer). |
| Loudness and timer should not be reachable while sound plays (changeState stops it), yet should be visible when idle | Visible and active when idle. While sound plays they **cross-fade out (240 ms)** and the read-only status line carries "Hushed · fades after 30 min". Softer is the in-session route to quieter. This is a deliberate change to "always visible" and is called out in the README diff. |
| Riverstone's tray bounce (0.85) on a large translucent surface; blur 12→0 materialise is costly | `spring.sheet` is **critically damped (dampingRatio 1.0)**; sheets animate opacity + translateY only, never blur. Two translucent layers never stack. |
| Lamplight's Google Fonts CSS breaks the offline promise; holding the splash delays the room | Fonts are **bundled** through `@expo-google-fonts/*` on every platform. The scene paints first; text fades in at 240 ms once fonts resolve. No splash hold. |
| Lamplight's check-in replaces the Plate | The check-in is a **non-modal bottom sheet on phone** below the lamp (the lamp stays visible and tappable) and an inline card on desktop. Auto-dismisses after 90 s. |
| Hearth's 48-tick ember ring is a high-contrast radial pattern | A **continuous low-alpha Recipe Arc (≤ 0.35) on /tune only**, no ticks, never on the Quiet room. |
| Hearth's draggable loudness slider fires changeState per stop | No draggable loudness anywhere. Tap-commit segments only. |
| Hearth's redirect keyed on "no saved profile" | Web redirect keyed on **`onboarded` flag OR `localStorage['still.welcomed']`**. |
| Lowlight's useScroll→useMotionTemplate gradient repaints every frame | Two fixed full-viewport gradient `div`s; `useScroll` drives the **opacity** of the top one (composite-only). Gated by `useReducedMotion()` from `motion/react`, not only `MotionConfig`. |
| Toolchain claims | `react-native-reanimated 4.7.1`, `react-native-worklets 0.13.0`, `react-native-svg 15.16.0`, `expo-blur`, `expo-haptics`, `motion 14.11` are already direct dependencies. babel-preset-expo in SDK 58 wires the worklets plugin; **no `babel.config.js` is created**. Add `react-native-gesture-handler` (currently transitive), `@expo-google-fonts/fraunces`, `@expo-google-fonts/inter`. |
| `welcome` route 404s on the static host | Add `welcome` to **both** loops: `.github/workflows/web.yml` and `scripts/deploy-web.sh`. "Make my sound" stays **only** on the onboarding primary, so the live-site grep fetches the onboarding chunk. |
| Tests.tsx uses `▶` `■` glyphs as icons | Replaced with Ionicons `play` / `stop`. |

Cut from the concepts and not coming back: time-of-day lamp shift, grain, scene detail layers, texture pill on the Quiet room, Riverstone's two-detent tray, the swipeable onboarding pager, pan-to-dismiss modal sheets on /tune, the landing sound demo, the landing interactive knob, angle-tracking on the dial (v1 is straight drag), Newsreader, expo-splash-screen.

---

## 2. Palette and tokens (`src/lib/theme.ts`)

Dark-only. Every full-bleed surface sits between 0.004 and 0.0083 relative luminance. The brightest pixel in the product is the lamp fill (#C29A62) and it appears once per screen. All contrast figures below were computed with the WCAG formula against the brightest surface each colour can sit on.

```ts
export const colors = {
  // floors
  night: '#0B0D12',        // app base, splash, theme-color, landing end colour
  black: '#000000',        // Dark screen only, reached by a 900 ms ramp
  solid: '#0E1016',        // reduce-transparency and Android material fallback
  // scenes: [skyTop, skyBottom] and [floorTop, floorBottom]; floor is the lower 45%
  scene: {
    rain:  { sky: ['#0B0C14', '#101019'], floor: ['#12111B', '#15141F'], horizon: false },
    ocean: { sky: ['#070B12', '#0A111B'], floor: ['#0B1420', '#0D1724'], horizon: true  },
    fan:   { sky: ['#0E0C0B', '#120F0D'], floor: ['#15110E', '#18130F'], horizon: false },
    hush:  { sky: ['#090B08', '#0D110B'], floor: ['#10140C', '#12170E'], horizon: false },
  },
  // the one material
  smoke: 'rgba(255,255,255,0.04)',
  smokePressed: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineLit: 'rgba(255,255,255,0.11)',
  // text
  ink: '#E7E2D8',          // 12.9:1 to 15.1:1 on every surface
  ink2: '#A8A399',         // 6.6:1 to 7.7:1; body-eligible
  ink3: '#75716A',         // 3.4:1 to 4.0:1; captions, disclaimers, disabled ONLY, never body
  // the single accent
  lamp: '#C29A62',         // 6.4:1 to 7.5:1 as text; the only filled bright surface
  lampDeep: '#7A6140',     // tracks, selected borders, arc at rest (decoration only, 3.1:1)
  lampGlow: 'rgba(194,154,98,0.14)',   // maximum glow fill
  onLamp: '#0B0D12',       // text on a lamp button, 7.5:1
  // meaning colours, always paired with a word
  rose: '#D28E7C',         // 'worse', destructive confirms, 6.3:1 to 7.3:1
  moss: '#9DB08A',         // 'easier' journal bar, helped-most line, 7.1:1 to 8.3:1
  // aliases for one release, so untouched files compile (Lamplight graft)
  bg: '#0B0D12', bgTop: '#0B0D12', bgBottom: '#0B0D12',
  surface: 'rgba(255,255,255,0.04)', surfaceStrong: 'rgba(255,255,255,0.07)', raised: 'rgba(255,255,255,0.10)',
  line: 'rgba(255,255,255,0.07)', muted: '#A8A399', faint: '#75716A',
  accent: '#C29A62', accentDeep: '#7A6140', moon: '#C29A62', warn: '#D28E7C',
};
export const radius = { card: 24, tile: 24, button: 18, chip: 14, pill: 999, sheet: 28 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 36, xxxl: 56 };
export const z = { scene: 0, content: 1, worseBar: 5, tabBar: 6, sheet: 8, veil: 10, dark: 11, setup: 20 };
```

Rules: no colour literals in components (the `dim` object in `index.tsx` goes). `ink3` never sets a sentence. `lampDeep` and `hairline*` are never text. `rose` appears only on "This is making it worse", the "made it worse once" journal note, the Worse bar, and destructive confirm labels. `app.json`: `backgroundColor`, `splash.backgroundColor` and `android.adaptiveIcon.backgroundColor` all become `#0B0D12`.

---

## 3. Type system (`src/lib/fonts.ts`, styles in `src/lib/ui.tsx`)

Two families, bundled on every platform. Install `@expo-google-fonts/fraunces` and `@expo-google-fonts/inter`. Load exactly five files:

```ts
import { Fraunces_300Light, Fraunces_300Light_Italic, Fraunces_400Regular } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
export const fonts = { display: 'Fraunces_300Light', displayItalic: 'Fraunces_300Light_Italic', title: 'Fraunces_400Regular', body: 'Inter_400Regular', ui: 'Inter_500Medium' };
```

`useAppFonts()` wraps `useFonts` and returns `{ ready }`. Nothing waits on it: the scene renders at once; the `Screen` primitive wraps its children in a view whose opacity goes 0 → 1 over 240 ms when `ready` flips (instant if already cached). Georgia is not a fallback; unready text is invisible, not swapped.

| Role | Family | Phone size/line | Desktop | Tracking | Use |
|---|---|---|---|---|---|
| Display | Fraunces 300 | 40 / 44 | 56 / 60 | -0.8 / -1.1 | "Still" on onboarding, landing hero |
| Title | Fraunces 400 | 26 / 32 | 30 / 36 | -0.3 | H1 on every screen |
| Greeting | Fraunces 300 Italic | 24 / 30 | 30 / 36 | -0.2 | "Rest here." |
| Heading | Fraunces 400 | 20 / 26 | 20 / 26 | -0.1 | card headings |
| Numeral | Fraunces 300, tabular | 44 / 48 | 44 / 48 | -0.6 | journal stats |
| Body | Inter 400 | 16 / 24 | 16 / 24 | 0 | sentences, status line |
| Control | Inter 500 | 16 / 22 | 16 / 22 | 0 | button and tile labels |
| Label | Inter 500 | 13 / 18 | 13 / 18 | +0.1 | tab labels, sub-labels, dial stop names |
| Caption | Inter 400 | 12.5 / 18 | 12.5 / 18 | +0.1 | disclaimers (ink3 allowed here) |
| Eyebrow | Inter 500 uppercase | 11.5 / 16 | 11.5 / 16 | +1.4 | kickers |

`allowFontScaling` on everywhere; `maxFontSizeMultiplier` 1.6 on Display, Title, Greeting and Numeral; 2.0 elsewhere. Layouts use `gap` and `minHeight`, never fixed heights on text containers, so 200% body text wraps. Timers, counts and numerals set `fontVariant: ['tabular-nums']`. Exported from `ui.tsx` as `<Display>`, `<Title>`, `<Greeting>`, `<Heading>`, `<Numeral>`, `<Body>`, `<Control>`, `<Label>`, `<Caption>`, `<Eyebrow>`; the old `H1`, `H2`, `Eyebrow`, `Muted` names stay as thin aliases (`H1` → Title, `H2` → Heading, `Muted` → Body in ink2, `Muted small` → Caption in ink3).

---

## 4. Material and the Scene

**One material, smoke:** `rgba(255,255,255,0.04)` fill, 1 px `hairline` border, radius 24 (cards, tiles), 18 (buttons), 999 (pills, segments). Pressed: `smokePressed`. Selected: `lampDeep` border + lamp label. No shadows on phone. Depth is a 1 px `hairlineLit` top edge on the tab bar and on sheets.

**Blur appears in exactly two places:** the phone tab bar (`expo-blur` `BlurView` tint `dark` intensity 18 over `rgba(14,16,22,0.72)`) and the desktop sidebar (same component; on web expo-blur maps to `backdrop-filter`). Android defaults to `solid` with no blur. `useReducedTransparency()` true → every material becomes `solid` at 0.96 with blur off. Never place a translucent surface over another: when the check-in sheet rises, the tab bar's opacity interpolates to 0.6 and scale to 0.98 with the sheet position rather than being blurred twice.

**`<Scene texture depth playing softer />`** (`src/components/Scene.tsx`) sits behind every screen at `z.scene`, `pointerEvents="none"`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`, `aria-hidden`. It renders:

1. **Sky**: `LinearGradient` `scene[texture].sky`, full viewport, static after mount.
2. **Floor**: `LinearGradient` `scene[texture].floor`, anchored to the bottom 45% of the viewport, its top edge at `horizonY`.
3. **Tint**: a `LinearGradient` from `night` at 0 to `black` at 1, same bounds as the floor, opacity = `0.0` at Full, `0.12` at Gentle, `0.25` at Hushed, plus `0.10` while Softer plays, plus a permanent `0.10` after "making it worse" this visit (capped 0.35). Opacity animates with `timing.luminance` (1800 ms). Colours never interpolate at runtime; Reanimated on web cannot animate gradient colour props, so stacked opacity is the only path.
4. **Horizon**: a 1 px `hairlineLit` line at `horizonY` for ocean only. `horizonY = 55% of height − 24 pt × depthStep` (Full 0, Gentle 1, Hushed 2; Softer adds one). While sound fades in, the floor's opacity rises 0.94 → 1.0 and the horizon rises 24 pt over `fadeMirror`.

Textures map from the saved profile: `rain`, `ocean`, `fan`, `none` → `hush`. The Journal always shows `hush` at depth 1; My sound shows the saved texture at depth 1. Under reduced motion the Scene still exists but every change is a 240 ms opacity cross-fade and the fade-mirror horizon move is dropped.

---

## 5. Motion system (`src/lib/motion.ts`)

The file opens with two comment lines that are the whole philosophy:

> Springs are only for things a finger moves. Every luminance change is `withTiming` with `Easing.inOut(Easing.cubic)`, never a spring, because an overshoot in brightness is a flash.

```ts
export const spring = {           // Reanimated 4.7: withSpring(to, { duration, dampingRatio, velocity })
  settle: { duration: 400, dampingRatio: 1.0 },   // any UI retarget: tab pill, selected tile, segment
  press:  { duration: 180, dampingRatio: 1.0 },   // scale 1 -> 0.97 on touch-down, back on release
  sheet:  { duration: 450, dampingRatio: 1.0 },   // check-in sheet; velocity from the gesture, no bounce
  dial:   { duration: 320, dampingRatio: 0.82 },  // click-stop snap; the ONLY overshoot, because the finger carried momentum
};
export const timing = {           // all withTiming + Easing.inOut(Easing.cubic) unless noted
  darker: 900,       // minimum for anything getting darker
  brighter: 700,     // minimum for anything getting brighter
  luminance: 1800,   // depth tint, Softer tint, 'worse' tint
  dim: 1600,         // auto-dim veil in
  wake: 700,         // veil out
  dark: 900,         // Dark screen to #000
  undark: 700,
  glowFall: 3000,    // matches player.stop(3)
  fadeMirror: null,  // = recipe.fadeInS * 1000, read at play time, linear easing to match the gain ramp
  crossfadeIn: 240,  // Easing.out(cubic)
  crossfadeOut: 160, // exits are ~70% of entrances
  status: 220,
  arc: 350,          // Recipe Arc retarget, same debounce as usePreview
};
export const breath = { lo: 0.22, hi: 0.42, inMs: 4500, outMs: 5500, easing: Easing.inOut(Easing.sin) }; // opacity ONLY, 6/min
```

Rules, each one enforced by the primitives rather than by memory:

- `cancelAnimation(sv)` before every retarget, so quick re-taps on the lamp never jump.
- Gesture → spring: pass release velocity straight into `withSpring` (`velocity`); choose the landing detent from Apple's projection `project(v) = (v/1000) × 0.998 / (1 − 0.998)` added to the current position.
- Rubber-band past bounds: `over × 0.55 × dim / (dim + 0.55 × |over|)`.
- Exits shorter than entrances; nothing on screen ever changes luminance faster than 700 ms except 160–240 ms cross-fades of small text and chips, which move no large surface.
- Large surfaces (the sheet) are semi-transparent (0.92) while they travel.
- Haptics (`expo-haptics`) fire on the same frame as the visual: `Light` on every touch-down (`tap()`), `selectionAsync` on each dial click-stop and each timer cycle (`tick()`), `Success` once when onboarding saves. **Nothing buzzes during dim, wake, or while sound plays, except the stop and worse presses.**

**Reduced motion.** One hook, `useReducedMotion()`: `AccessibilityInfo.isReduceMotionEnabled` + `reduceMotionChanged` on native, `matchMedia('(prefers-reduced-motion: reduce)')` + its change event on web. Every animated component consumes it. Under it: every translate and scale becomes a 200 ms opacity cross-fade; the breath loop is off (ring held at 0.32); the Scene never moves (no horizon rise); sheets fade in place; the dial still turns 1:1 under the finger (direct manipulation is not vestibular) but snaps with `withTiming(150)`; journal bars render at final width; the landing wraps in `<MotionConfig reducedMotion="user">` **and** gates `useScroll` with `useReducedMotion()` from `motion/react`. Brightness eases (dim, wake, dark, depth) are **kept** under reduced motion: they are not motion and they protect the eye.

**Reduced transparency.** `useReducedTransparency()`: `AccessibilityInfo.isReduceTransparencyEnabled` on iOS, `prefers-reduced-transparency` on web, always true on Android. Materials go `solid`, blur off.

---

## 6. Shared primitives (`src/lib/ui.tsx`, `src/lib/sheet.tsx`)

- **`Screen`** `{ children, scrollRef, overlay, center, texture, depth, playing, softer }`: renders `<Scene>` then `SafeAreaView` (top) then `ScrollView` (`contentContainerStyle` gap 16, horizontal padding 20 / 32 / 56, max width 520 phone-web, 1160 desktop) then `overlay`. Children sit in the font-ready fader.
- **`Press`**: the base pressable. `onPressIn` → `tap()` + scale to 0.97 with `spring.press`; release → back. Accepts `accessibilityRole`, label, state. On web it reads `focusVisible` from react-native-web's style callback and draws `outlineStyle: 'solid', outlineWidth: 2, outlineColor: lamp @ 70%, outlineOffset: 3`; if `focusVisible` is unavailable in RN-web 0.21, the fallback is `onFocus`/`onBlur` state plus a `:focus-visible` rule in `+html.tsx`. Minimum hit 44 × 44 via `hitSlop` when the visual is smaller.
- **`Button`** `{ label, onPress, kind: 'primary' | 'smoke' | 'quiet' | 'rose', icon, disabled, hint }`: 56 pt tall (52 for `rose`). `primary` = lamp fill, `onLamp` Inter 500 16; `smoke` = material; `quiet` = text only in ink2; `rose` = text in ink2 with a 2 px rose hairline on the left and a `rose @ 0.35` border. Disabled opacity 0.38 with `accessibilityState.disabled`.
- **`Segmented`** `{ options, value, onChange }`: 48 pt radiogroup; selected segment `smokePressed` + `lampDeep` border + lamp label; commits on tap only.
- **`Chip`**: 48 pt, radius 14, material.
- **`Tile`** `{ icon | scene, label, sub, on, onPress, wide }`: radius 24; when `scene` is a texture, the tile background is that scene's `floor` gradient (a "miniature scene"); selected → `lampDeep` border, lamp check icon top-right. Press spring via `Press`.
- **`Row`**: 60–64 pt hairline-separated list item (icon 20, Control label, Label sub, optional chevron, `expanded` state). Expansion is **fade-only**: content mounts at opacity 0 and crosses in 240 ms; no layout animation.
- **`Status`**: Body in ink2, `accessibilityLiveRegion="polite"`, `aria-live="polite"`, `minHeight` 48 so the column never jumps; text cross-fades 220 ms.
- **`Sheet`** (`src/lib/sheet.tsx`) `{ open, onClose, height, children, scrim }`: Gesture Handler `Pan`, translateY 1:1 with the finger, rubber-band above its rest, dismiss when the projected endpoint passes 60% of its height or release velocity > 600 px/s, `spring.sheet` with the gesture velocity; opacity 0.92 while moving; scrim `rgba(0,0,0,0.5)` (or none when `scrim={false}`) tracks position; closes on Escape (web), on the scrim, and on a 36 × 4 handle tap; moves focus to its title on open and returns it to the opener on close; under reduced motion it fades in place. Never used on desktop (`useWide()` → the caller renders an inline card).
- **`Mark`** (`src/components/Mark.tsx`): the app mark, a react-native-svg circle resting on a horizon line, 1.5 px stroke, used in onboarding, the sidebar and the landing.
- Exports kept: `tap`, `tick`, `confirmAction`, `useWide`, `Columns`, `Ionicons`, `IconName`, `styles` (the `card` style stays for the untouched cards).

---

## 7. Screens

### 7.1 Quiet room (`/`)

**Phone 375, top to bottom** (all inside `Screen` with the saved texture's scene, `depth` from `state`):

1. Safe area.
2. Header row, 44 pt: `Greeting` "Rest here." left in ink2; the **timer pill** right (44 pt, Ionicons `timer-outline` 16 + Label "30 min"); tap cycles 30 → 1 hour → 15 → No timer with `tick()`; label cross-fades 220 ms. Hidden (cross-fade out) while sound plays.
3. **The Lamp** (`src/components/room/Lamp.tsx`), 232 pt (208 on viewports under 700 pt tall; 280 at 768; 320 on desktop), centred. An SVG: a disc filled with the scene's floor-bottom colour; a 2 pt ring in lamp at opacity 0.35 idle; inside, Ionicons `play` 40 in lamp (offset 3 pt right) or `pause` while playing; a `Control` caption beneath the glyph: "Play my sound" / "Getting ready…" / "Tap to fade out". `accessibilityRole="button"`, label "Play my sound" / "Getting ready" / "Fade to silence". Touch-down: scale 0.97 + Light haptic on the same frame.
4. **`Status`** line (polite live region), one sentence: "Press when you are ready. It starts in silence." idle; "Fading in. It keeps playing if you lock the phone." playing; the existing stop/worse/check-in sentences otherwise. While playing, this line also carries "Rain · Hushed · fades after 30 min" as a second Caption beneath.
5. **Loudness** `Segmented` (Hushed / Gentle / Full, Ionicons `moon-outline` / `cloudy-outline` / `sunny-outline` 16) and a Caption beneath: the helped-most sentence in moss, else `mode.short`. **Cross-fades out while sound plays** and returns on stop.
6. **Two 56 pt smoke buttons** side by side: `moon` "Dark screen" / sub "Silence"; `water-outline` "Softer" / sub "Quieter, darker". Softer shows a `lampDeep` border while it plays and reads "Playing softer".
7. Caption disclaimer in ink3: "For comfort, not treatment. A sudden, new or worst-ever headache: get medical help."
8. Floating tab bar.

**Pinned above the tab bar while sound plays** (outside the ScrollView, `z.worseBar`): the 52 pt full-width `rose` Button "This is making it worse" (Ionicons `hand-left-outline`). It never scrolls away and is one tap on any scroll offset. It enters with a 240 ms cross-fade when `playing` flips; the ScrollView's bottom padding grows by 64 pt at the same time so nothing hides behind it.

**Behaviour, mapped to today's code:** `STATES` drive the segments; `TIMERS` the pill; `playSound`, `stopSound`, `darkOnly`, `worse`, `answer`, `changeState`, `armDim`, `end`, `begin` unchanged. The only logic additions: `useWelcomeRedirect()` (one call at the top, web only; see §8), and the glow/scene values derived from `playing`, `preparing`, `state`.

**Seeing the sound arrive** (signature moment): on play, `cancelAnimation(ring)`, then ring opacity `withTiming(0.9, { duration: recipe.fadeInS * 1000, easing: Easing.linear })` and the Scene's floor opacity 0.94 → 1.0 and horizon +24 pt over the same duration. The screen brightens at exactly the rate the gain ramps. On stop, ring → 0.35 over `glowFall` 3000 ms (matching `player.stop(3)`), scene settles over 1800. Once the fade-in completes, the ring breathes (opacity 0.42 → 0.22 → 0.42, 10 s cycle) until stop, dim, or reduced motion.

**Auto-dim** (15 s without a touch while playing): a `night` veil at `z.veil` eases to 0.94 over 1600 ms; the tab bar fades with it; the ring keeps breathing above the veil at 0.28 peak; the lamp caption and the worse bar remain *visible* at 28% through the veil (they are rendered above it with `pointerEvents="none"`). The veil is one `Pressable` labelled "Screen dimmed. Tap to brighten."; **any touch wakes over 700 ms and nothing else happens**. The sound never stops from a dim-state touch.

**Dark screen**: `black` layer at `z.dark` eases in over 900 ms (the ring's opacity goes last, 1200 ms, so the lamp is the last thing to leave); status bar hidden; the whole screen is one button "Dark screen. Tap to come back." First use only: a Caption "Tap to come back" in ink3 on black (4.3:1) for three seconds, then never again (`still.darkHintShown` in storage). Leaving eases back over 700 ms.

**The room backs off**: `worse()` keeps its 1.5 s stop and `lowerState`; the Scene adds a permanent +0.10 tint for the rest of the visit (1800 ms); the status sentence shows in ink2 with a 2 px rose hairline on its left. Nothing turns red; nothing pulses.

**Check-in** (`src/components/room/CheckIn.tsx`): only after a stop, never while playing. Phone: a non-modal `Sheet` (no scrim) 236 pt tall, title "Optional: how did that go?", four 52 pt chips in 2 × 2 (A bit easier / About the same / Worse / Skip), drag-down or Skip or the handle to dismiss, auto-dismiss at 90 s (counts as `skipped` without writing a follow-up). The lamp remains above it and tappable; tapping play dismisses the sheet. Desktop: an inline smoke card in the right column.

**Tablet 768:** one column, max 520, lamp 280. **Desktop ≥ 960:** sidebar; the scene spans the viewport; two columns in max 1160, vertically centred: left = greeting, Lamp 320, Status; right 420 = loudness, the two buttons, the worse button (inline, not pinned), the check-in card, timer pill, disclaimer.

### 7.2 Onboarding (overlay on `/`, `src/components/Onboarding.tsx`)

Full-screen overlay at `z.setup` over a live `Scene` (texture `rain` until one is chosen, then the chosen one, cross-fading 240 ms). Top row 44 pt: Back chevron (step > 0), a four-segment 2 px progress hairline whose done segments fill lamp (`scaleX` with `spring.settle`; opacity under reduced motion), and "Skip" (hitSlop 12). Panes **cross-fade** 240 ms with a 12 pt rise (`spring.settle` on translateY) that reduced motion removes. No swipe pager.

- **Pane 0**: `Mark` 56, `Display` "Still", Body ink2 "A soft sound for migraine days. Made on your phone, just for you.", primary Button **"Make my sound"** (exact string; the deploy workflow greps it; it appears nowhere else in the app), quiet Button "Just play a gentle sound".
- **Pane 1**: Eyebrow "1 of 3", Title "What's hardest on your ears?", Body "During a headache. Pick one.", four 64 pt wide `Tile`s (existing `HARDEST`); choosing advances after 260 ms.
- **Pane 2**: "2 of 3", "Pick what feels restful", "Tap one to hear it. Use headphones if you can.", 2 × 2 miniature-scene `Tile`s; the first tap starts the preview (silence first, existing 0.8 s fade) and the Scene behind cross-fades to that texture; the Listen pill.
- **Pane 3**: "3 of 3", "Turn it to taste", "Drag the dial, or tap it. Deeper is usually calmer.", one `Dial` at 176 pt, Listen pill, primary "Save my sound" → `Success` haptic once; the overlay fades out over 500 ms revealing the Lamp already in place; the Status reads "Your sound is ready. Press play when you need it."

### 7.3 My sound (`/tune`)

`Screen` with the saved texture at depth 1. Title "Your sound", Body "Turn the dials while it plays. Changes save by themselves." Then the **Listen control**: a 112 pt round lamp-style button (the screen's only primary; lamp ring 0.35 idle, 0.9 playing; `play`/`pause` glyph; label "Listen" / "Playing" / "Tuning…") with the **Recipe Arc** around it (`src/components/RecipeArc.tsx`): a single continuous 3 pt SVG arc on a 150 pt circle, no ticks. Derived from `recipeFor(profile, 'normal').recipe`: sweep = 90° + 180° × `width` (Space; centred at the top); alpha falls linearly from the left end to the right end in proportion to `tiltDbPerOct` (−9 → steep fall to 0.08, −3 → nearly flat), and the reach of the brighter end follows `log(cutoffHz)`; peak alpha **0.35**, floor 0.08; `tonal` (Hum) does nothing visual (no grain, ever). Retargets with `withTiming(350)` after each dial release, the same debounce `usePreview` uses, so sight and sound change together. Decorative, hidden from assistive tech.

Texture `Tile`s 2 × 2 as miniature scenes (4 across at 768+). A smoke card with four **Dials** at 100 pt (110 at 768+) in 2 × 2 with Eyebrow labels. Hum stays disabled when the profile dislikes hum.

**Dial** (`src/components/Dial.tsx`, same props, rebuilt on Gesture Handler + Reanimated): `Gesture.Pan().minDistance(6)` on the knob only (`touchAction: 'none'` on web for the knob only); travel = `−dy + dx`, 26 px per stop, 1:1 rotation of the indicator between stops; `tick()` and `onChange` as each stop is crossed; past the end stops the rotation rubber-bands (0.55); on release `withSpring(angleOf(stop), { ...spring.dial, velocity })` with the gesture's angular velocity, then `onRelease`; a tap without movement steps one stop (wrapping) as today. Face: smoke disc with `hairline` border, inner ring, a 4 × 20% lamp indicator, the stop word in Label inside, and five-to-seven ring dots in `hairlineLit` lit to lamp up to the current stop (these are the existing dots, 5–7 of them, not a 48-tick ring). `accessibilityRole="adjustable"`, `accessibilityValue.text`, increment/decrement actions kept; on web arrow keys map to the same actions. Angle-around-centre tracking is **not** in v1.

Below: `Row` "Let Still choose by ear" (sub "Pick the calmer of two, a few times · 3 min") expanding to the restyled **Tests**; `Row` "Account and privacy" (sub "Optional sign-in, sharing, AI suggestions") expanding to `AiReviewCard`, `AccountCard`, `SharingCard`, `SupportCard` (content unchanged); quiet Button "Start over" with the existing confirm; Caption disclaimer. Desktop: mixer left, rows right 440, "Account and privacy" open by default as today.

**Tests as a ritual** (`src/components/build/Tests.tsx` + `RoundPad.tsx`): Eyebrow "Test 1 of 3 · round 2 of 6"; Heading `test.title`; Body "Two versions play, A then B. Pick the calmer one." Two **round pads** 128 pt (A, B) in Title 26 with 3 pt SVG arc rims; "Play A then B" (primary, Ionicons `play`) fills A's rim in lamp linearly across the 6 s clip (12 s for Motion), then B's; both rest; the question cross-fades in and the pads become the answer buttons ("A felt calmer" / "B felt calmer" as their labels). "About the same" and "Both unpleasant" are 48 pt smoke chips; "Stop" (Ionicons `stop`) is a quiet button always present. Round ticks under the Eyebrow fill as rounds complete (small 6 pt dots, lampDeep → lamp). The chosen pad's fill glows once (lampGlow, 400 ms in, 700 ms out). Prewarm stays.

### 7.4 Journal (`/journal`)

`Screen` with `hush` at depth 1. Title "Your journal", Body "Still notes each time you use it. It stays on this device." Two stat tiles (`Numeral` 44 tabular; em dash when empty; Caption label). Helped-most line in moss. Smoke card "How it felt afterwards": three bar rows (label 130 pt, 8 pt track in `lampDeep @ 0.35`, fill moss / ink3 / rose for easier / same / worse, tabular count right); widths animate `scaleX` from 0 once over 500 ms on first focus (`transformOrigin` left; static under reduced motion). Caption "Feeling better afterwards doesn't mean the sound caused it." Smoke card "Headache without Still?" with Body "One tap, no details." and three 48 pt chips Today / Yesterday / 2 days ago; the confirmation note is a `Status`. Episodes as a **timeline**: a 1 px hairline on the left, a lamp dot per episode sized 6–12 pt by listening minutes (`6 + 6 × min(minutes, 60) / 60`), Label date in ink, Caption details in ink2, "made it worse once" in rose Caption. Empty state in Body ink2 with "Open the quiet room" as a quiet button. "Clear journal" quiet with the existing confirm. Desktop: stats and bars left, episodes right 460.

### 7.5 Navigation (`_layout.tsx`, `TabBar.tsx`, `Sidebar.tsx`)

**Phone:** a floating smoke tab bar (`src/components/TabBar.tsx` as the Tabs `tabBar`), inset 12 pt from the sides and from `env(safe-area-inset-bottom)` / the home indicator, 64 pt + inset, radius 24, blur-or-solid material, 1 px `hairlineLit` top edge, three items: Ionicons 24 (`moon-outline` / `book-outline` / `options-outline`, the active one filled) and Label 11.5; a lamp pill indicator (`lampGlow`) moves by translateX with `spring.settle` (fades under reduced motion). The bar fades out over 900 ms with dark screen, dim and setup (replacing `display: none`), and back over 700 ms. Existing `tabBarButtonTestID`s preserved. Routes cross-fade 240 ms (`animation: 'fade'`). **Tablet:** same bar, content max 520. **Desktop ≥ 960:** a 268 pt translucent `Sidebar` with `Mark` + "Still" (Title 30), three 52 pt rows (active `lampGlow` fill), and the privacy lines, a Privacy link (opens `PrivacySheet`) and "About Still" (→ `/welcome`). `_layout.tsx` wraps everything in `GestureHandlerRootView`, calls `useAppFonts()`, and registers `<Tabs.Screen name="welcome" options={{ href: null }} />`.

**PrivacySheet** restyle: same `Modal`, `night` panel with `hairline` border, radius 28, Title/Heading/Body typography, primary Button "Close". The four cards (`AccountCard`, `AiReviewCard`, `SupportCard`, `SharingCard`) get only typography and token updates, no structural change.

**Web shell** (`src/app/+html.tsx`, new): `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`; `<meta name="theme-color" content="#0B0D12">`; `color-scheme: dark`; `html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; overscroll-behavior: none; background: #0B0D12 }`; `#root { min-height: 100dvh }`; `input, textarea { font-size: 16px }`; `button, a, [role=button] { touch-action: manipulation; user-select: none }`; `:focus-visible { outline: 2px solid rgba(194,154,98,0.7); outline-offset: 3px }`; all `:hover` rules under `@media (hover: hover) and (pointer: fine)`; `@media (prefers-reduced-transparency: reduce)` switches the shell's material class to solid.

---

## 8. Landing page (`/welcome`, web only)

**Where and why.** A **new route**, not a first-visit state on `/`: a person mid-migraine who opens `/` must never meet marketing; a route is linkable, has a working back button, and can be sent to someone. `src/app/welcome.tsx` is a shared file that renders `<Landing />` from `src/components/landing/Landing` (Metro resolves `Landing.web.tsx` on web; `Landing.tsx` on native returns `<Redirect href="/" />`). It is registered in the Tabs with `href: null` so no tab appears. **Redirect:** `useWelcomeRedirect()` (`src/lib/welcome.ts`), called once at the top of the Quiet room, runs only on web: if `onboarded` is false **and** `localStorage['still.welcomed']` is unset, `router.replace('/welcome')`. Every CTA on the landing sets `still.welcomed = '1'` before navigating. Anyone who chose "Just play a gentle sound" has `onboarded = true` and never sees the landing again. **Deploy:** add `welcome` to `for route in tune journal` in both `.github/workflows/web.yml` and `scripts/deploy-web.sh`.

**Stack.** Plain DOM + CSS (`src/components/landing/landing.css`, imported from `Landing.web.tsx`) + `motion/react` v14 inside `<MotionConfig reducedMotion="user">`. Body `#0B0D12`. Reading column 720 px, max width 1120, gutters 20 / 32 / 56. Hero `min-height: 100svh`. No sound. No interactive knob.

**Scroll model.** Two `position: fixed; inset: 0` gradient layers behind the page: `dusk` (`#141826` → `#0B0D12`, the brightest pixel on the page at 0.0094 luminance) above `night` (`#0B0D12` flat). `useScroll()` → `useTransform(scrollYProgress, [0, 0.85], [1, 0])` drives the **opacity** of `dusk` (composite-only, no repaint). Reading the page is descending into the room; the last section sits on exactly `#0B0D12`, the app's own floor, so "Open the quiet room" is a 240 ms cross-fade with no seam. `useReducedMotion()` from `motion/react` true → `dusk` is removed and every section has a static background.

**Reveals.** `whileInView={{ opacity: 1, y: 0 }}` from `{ opacity: 0, y: 12 }`, `transition={{ type: 'spring', bounce: 0, visualDuration: 0.55 }}`, `viewport={{ once: true, margin: '-10%' }}`. Stagger 80 ms within a group. Nothing loops except the hero ring's opacity breath (CSS `@keyframes`, 10 s, 0.22 → 0.42, off under `prefers-reduced-motion`).

**Sections, in order, with copy direction:**

0. **Headache-now bar** (first in DOM and tab order, Lamplight graft): one line "Headache right now? Skip all this." with a lamp-outlined link **"Open the quiet room"**. It is a static strip at the very top, above the masthead, 52 px tall.
1. **Masthead**, sticky, translucent (`backdrop-filter: blur(18px)` over `rgba(11,13,18,0.72)`; solid under reduced transparency): `Mark`, "Still", links "How it works", "Privacy" (→ `/privacy.html`), pill "Open the quiet room".
2. **Hero**: Eyebrow "For migraine days"; `h1` in Fraunces 300, `clamp(40px, 7vw, 76px)`, line-height 1.05, tracking −0.02em: **"A quiet room, with one soft sound in it."**; Body 18/28 in ink2: the README's opening, rewritten as three short sentences ("Still opens on a dark room with three choices: a dark screen, your own comfort sound, and a softer version of it. Sound starts quietly and fades in slowly. It keeps playing with the phone locked."); the CSS lamp (a 200 px ring breathing by opacity); primary "Open the quiet room", quiet "How it works" (anchor); a 1 px hairline scroll hint that lengthens 24 → 48 px once.
3. **Three choices** (`id="how"`): three smoke cards with miniature-scene headers: *Dark screen* ("Black and silent. One tap comes back."), *Your sound* ("Made from a few choices you make by ear. It starts in silence."), *Softer* ("The same sound, quieter and darker."). Staggered 80 ms.
4. **It starts in silence**: Heading, Body on the fade-in and the never-louder rule; a 2 px track that fills in lamp over exactly **6000 ms** once in view (no loop; full and static under reduced motion), labelled at its ends "silence" and "your level", with two Captions beneath: "14 dB below a normal day during a headache" and "never louder than you chose".
5. **Made on your device, kept on your device**: the darkest point of the page; one Fraunces italic line "No account. No analytics. No ads."; Hearth's picture of the privacy sentence: a lamp line travels across a strip labelled "your phone" and **stops dead at a hairline wall labelled "nothing leaves it"** (`pathLength` 0 → 1 over 1.8 s once in view; static under reduced motion); three Body rows from the README (sound made on the phone; answers and journal stored only on the device; fully offline after install); one dimmer row in ink3 for the optional AI review with "you can preview the exact data first".
6. **Tuned by ear**: Heading, Body on textures, dials and "which felt calmer?"; a static SVG of the dial and two A / B pills. No sound, nothing interactive.
7. **For comfort, not treatment**: the medical line alone between two hairlines, with a 2 px rose hairline on the left: "Still does not diagnose, treat or prevent migraine. A new, sudden or worst-ever headache needs medical care." Never collapsed, never animated.
8. **Enter**: Title "The room is ready when you need it."; primary **"Open the quiet room"** (not "Make my sound"); footer: "Add to Home Screen" hints for iOS and Android, Privacy, Source (GitHub), and "Made on your device. Nothing leaves it."

Accessibility: one `h1`, sequential headings, a skip link to `main`, focus moves to `main` on route change, every control ≥ 44 px, `:focus-visible` ring, hover only under `(hover: hover) and (pointer: fine)`, images decorative (`aria-hidden`) with the words carried by text.

---

## 9. Immersive moments to build (in priority order)

1. **Arrival without a cut.** Splash, `theme-color` and page background are all `#0B0D12`; the Scene for the saved texture is the first paint; the lamp ring brightens 0 → 0.35 over 900 ms; text fades in at 240 ms once fonts resolve. No logo, no white frame, no Georgia flash.
2. **Seeing the sound arrive.** Ring 0.35 → 0.9 and the floor/horizon rise over exactly `recipe.fadeInS`, linear, in step with the gain ramp; fall over 3000 ms on stop to match `player.stop(3)`; `cancelAnimation` before each retarget.
3. **Sinking into Hushed.** Choosing Hushed (idle only) tints the floor 0.25 and lowers the horizon 48 pt over 1800 ms with a selection haptic. The sky never changes.
4. **The chrome dissolves.** 15 s after the last touch while playing, everything eases to a 0.94 veil over 1600 ms; only the breathing ring (0.28 peak) and two faint, non-interactive landmarks remain. Any touch wakes in 700 ms and never stops the sound.
5. **Softer is deeper.** Softer adds one depth step (tint +0.10, horizon −24 pt) over 1800 ms, so "quieter, darker" is shown by the room, and returns the same way.
6. **Lights out.** Dark screen eases to `#000` over 900 ms with the ring leaving last; one tap on the whole screen returns over 700 ms; a 4.3:1 hint for three seconds, the first time only.
7. **The room backs off, calmly.** "Making it worse" darkens the room one step for the rest of the visit; the message is ink2 with a rose hairline; nothing flashes.
8. **A/B as a ritual.** Pad rims fill across the clip, the pads become the answers, a round tick fills, the next pair is already prepared.
9. **The Recipe Arc.** On /tune only, a soft arc around Listen re-shapes 350 ms after each dial release, so the sound you shaped has a face.
10. **Descending on the web.** The landing sinks from dusk to the app's own floor by scroll, and entering is a seamless cross-fade.

---

## 10. Accessibility summary

Contrast as in §2 (ink ≥ 12.9:1, ink2 ≥ 6.6:1, lamp and rose ≥ 6.3:1 on every surface; ink3 3.4–4.0:1 and caption-only; the Dark screen hint 4.3:1 for three seconds). Peak full-bleed luminance 0.0083 in the app, 0.0094 on the landing. Reduced motion and reduced transparency through the two hooks in §5 on both platforms; brightness eases kept under reduced motion. No loop faster than 0.1 Hz; no luminance change on a large surface faster than 700 ms; the per-frame delta of the breath is under 0.2% of full scale. Roles: lamp and buttons are `button` with state labels; loudness, textures and the check-in chips are `radiogroup` / `radio` with `checked`; dials `adjustable` with value text and increment/decrement; the tab bar `tablist` / `tab` with `selected`; scenes, arcs, rims and the mark are decorative and hidden. The Status line and journal confirmations are polite live regions; the worse message is assertive. Sheets move focus to their title and return it. Web: Tab order equals visual order, `:focus-visible` ring everywhere, Space/Enter activate, arrows drive dials and segments, Escape closes sheets. Targets ≥ 44 pt with ≥ 8 pt gaps; `hitSlop` where visuals are smaller (timer pill, Skip, Back). Dynamic Type honoured with wrapping layouts. Colour is never the only signal: selected states pair colour with a border and a filled glyph; "worse" pairs rose with the hand glyph and words; journal bars carry labels and counts.

---

## 11. Do not do

- No colour literals in components; no `ink3` on a sentence; no text in `lampDeep` or `hairline*`.
- No white, no `#FFF` text, no filled surface brighter than the lamp button; at most one lamp-filled surface per screen.
- No grain, noise, streaks, rotating or drifting scene detail, breathing points, or any repeating fine pattern, in any mode.
- No tick rings; the Recipe Arc is continuous, ≤ 0.35 alpha, and never on the Quiet room.
- No spring on opacity, colour or any luminance; no `dampingRatio < 1` except `spring.dial`.
- No brightening faster than 700 ms, no darkening faster than 900 ms, no veil or dark-screen jump.
- No full-viewport luminance change from a routine control: depth touches the floor layer only.
- No controls that act while dimmed; the first touch only wakes.
- No question, sheet, prompt or decision while `playing` is set; the check-in appears only after a stop.
- No loudness or timer control reachable while sound plays (changing them would stop the sound by surprise); Softer is the in-session quieter path.
- No draggable loudness; segments commit on tap.
- No texture picker on the Quiet room.
- No swipe-only interaction: every sheet also opens and closes by tap; every dial also steps by tap and by accessibility action.
- No blur anywhere except the tab bar and the desktop sidebar; no animated blur; no two translucent layers stacked.
- No sheets on desktop.
- No Google Fonts CSS, no network font loading, no splash hold for fonts, no Georgia fallback flash.
- No `babel.config.js`; no re-registering the worklets plugin.
- No `welcome.web.tsx` route file; platform split lives in the component, not the route.
- No "Make my sound" string outside the onboarding primary button.
- No sound on the landing page; no interactive knob on the landing; no `useScroll`-driven gradient repaint; no scroll-linked motion under reduced motion.
- No `user-scalable=no`, no `100vh` on the shell, no ungated `:hover`, no `user-select: none` on body text.
- No emoji or text glyphs as icons (`▶`, `■` go); Ionicons or react-native-svg only.
- No haptics during dim, wake, scene changes, or while sound plays (except the stop and worse presses).
- No changes to anything under `src/engine`, `src/recipe`, or the audio/storage/profile/activity/account/sharing/ai files.

---

## 12. Build plan: seven parallel streams with exclusive file ownership

Foundation (stream 1) ships its exported API first and the other streams build against it; until it lands, streams 2–7 compile against the alias tokens that already exist. **No two streams edit the same file.** Where a stream needs a one-line hook into another stream's file, the owner adds it, and that line is named here.

### Stream 1: Foundation
Owns: `src/lib/theme.ts` (tokens + aliases + scene palettes), `src/lib/motion.ts` (new: `spring`, `timing`, `breath`, `useReducedMotion`, `useReducedTransparency`, `project`, `rubberband`), `src/lib/fonts.ts` (new: `fonts`, `useAppFonts`), `src/lib/ui.tsx` (type components, `Press`, `Button`, `Segmented`, `Chip`, `Tile`, `Row`, `Status`, `Screen`, `Columns`, aliases), `src/lib/sheet.tsx` (new: `Sheet`), `src/components/Scene.tsx` (new), `src/components/Mark.tsx` (new), `package.json` / `package-lock.json` (`npx expo install react-native-gesture-handler @expo-google-fonts/fraunces @expo-google-fonts/inter`), `app.json` colours. Exports the API exactly as named in §3, §5 and §6.

### Stream 2: Landing
Owns: `src/app/welcome.tsx` (new), `src/components/landing/Landing.web.tsx` (new), `src/components/landing/Landing.tsx` (new, native `Redirect`), `src/components/landing/landing.css` (new), `src/lib/welcome.ts` (new: `useWelcomeRedirect`, `markWelcomed`), `.github/workflows/web.yml` (add `welcome` to the loop), `scripts/deploy-web.sh` (same), `README.md` (landing and behaviour-change notes). Depends on stream 7 adding the `welcome` Tabs.Screen and on stream 3 adding the `useWelcomeRedirect()` call.

### Stream 3: Quiet room
Owns: `src/app/index.tsx`, `src/components/room/Lamp.tsx` (new), `src/components/room/CheckIn.tsx` (new), `src/components/room/WorseBar.tsx` (new), `src/components/room/DimVeil.tsx` (new), `src/components/room/DarkScreen.tsx` (new). Adds the single `useWelcomeRedirect()` call (import from `src/lib/welcome.ts`; stub returns nothing until stream 2 lands). Keeps `textureName` import from `Studio.tsx` and `tabBarStyle` from `theme.ts`.

### Stream 4: Onboarding
Owns: `src/components/Onboarding.tsx`, `src/components/onboarding/Panes.tsx` (new, the four panes), `src/components/onboarding/ProgressRail.tsx` (new). Uses `Dial`, `TextureTiles`, `PreviewButton`, `usePreview`, `withHardest` from `Studio.tsx`/`Dial.tsx` **as exported today**; stream 5 keeps those signatures.

### Stream 5: My sound
Owns: `src/app/tune.tsx`, `src/components/Studio.tsx`, `src/components/Dial.tsx`, `src/components/RecipeArc.tsx` (new), `src/components/build/Tests.tsx`, `src/components/build/RoundPad.tsx` (new). Must keep the exported signatures of `Dial`, `ProfileDial`, `TextureTiles`, `Tile`, `PreviewButton`, `usePreview`, `withDial`, `withHardest`, `textureName`, `TEXTURES`, `DIALS` so streams 3 and 4 compile unchanged.

### Stream 6: Journal
Owns: `src/app/journal.tsx`, `src/components/journal/Stat.tsx` (new), `src/components/journal/Bars.tsx` (new), `src/components/journal/Timeline.tsx` (new).

### Stream 7: Navigation and shell
Owns: `src/app/_layout.tsx` (`GestureHandlerRootView`, `useAppFonts`, `TabBar`, `Sidebar`, fade route animation, `<Tabs.Screen name="welcome" options={{ href: null }} />`), `src/components/TabBar.tsx` (new), `src/components/Sidebar.tsx`, `src/components/PrivacySheet.tsx`, `src/components/AccountCard.tsx`, `src/components/AiReviewCard.tsx`, `src/components/SupportCard.tsx`, `src/app/+html.tsx` (new web shell and baseline CSS).

### Sequence and QA
Day 1: stream 1 lands tokens, fonts, motion, primitives, Scene; stream 7 lands the root (`GestureHandlerRootView`, fonts, `+html.tsx`) and verifies `npx expo export --platform web` and a device build once before any Pan-based component is built. Days 2–5: streams 2–6 in parallel. Day 6: integration, `npx tsc --noEmit`, `npm test`, README. Day 7: QA at 375 / 768 / 1440; reduced motion and reduced transparency on iOS, Android and web; VoiceOver and TalkBack on the lamp, segments, dial, sheet; banding check of all four scenes at 25% brightness on an OLED iPhone and a mid-range Android LCD; a slow-motion review of every brightness ease; the deploy loop and the "Make my sound" live check.

### New dependencies
`react-native-gesture-handler` (promote from transitive to direct, via `npx expo install`), `@expo-google-fonts/fraunces`, `@expo-google-fonts/inter`. Everything else named in this spec (`react-native-reanimated`, `react-native-worklets`, `react-native-svg`, `expo-blur`, `expo-haptics`, `expo-linear-gradient`, `expo-font`, `motion`, `@expo/vector-icons`) is already a direct dependency.
