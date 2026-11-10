// Still's palette: one dark room, one lamp. Dark-only on purpose: the app is used in dark rooms
// during headaches. Every full-bleed surface sits between 0.004 and 0.0083 relative luminance, and the
// lamp fill is the only bright thing on a screen. Components import these names; nothing hard-codes a colour.
import { Platform } from 'react-native';

/** The four room scenes. The profile's `none` texture maps to `hush`; see `sceneFor`. */
export type SceneTexture = 'rain' | 'ocean' | 'fan' | 'hush';
/** Loudness depth: Full 0, Gentle 1, Hushed 2. Softer adds one step on top. */
export type Depth = 0 | 1 | 2;

export const colors = {
  // floors
  night: '#0B0D12',        // app base, splash, theme-color, landing end colour
  black: '#000000',        // Dark screen only, reached by a 900 ms ramp
  solid: '#0E1016',        // reduce-transparency and Android material fallback
  // scenes: [skyTop, skyBottom] and [floorTop, floorBottom]; the floor is the lower 45%
  scene: {
    rain:  { sky: ['#0B0C14', '#101019'] as const, floor: ['#12111B', '#15141F'] as const, horizon: false },
    ocean: { sky: ['#070B12', '#0A111B'] as const, floor: ['#0B1420', '#0D1724'] as const, horizon: true },
    fan:   { sky: ['#0E0C0B', '#120F0D'] as const, floor: ['#15110E', '#18130F'] as const, horizon: false },
    hush:  { sky: ['#090B08', '#0D110B'] as const, floor: ['#10140C', '#12170E'] as const, horizon: false },
  } satisfies Record<SceneTexture, { sky: readonly [string, string]; floor: readonly [string, string]; horizon: boolean }>,
  // the one material
  smoke: 'rgba(255,255,255,0.04)',
  smokePressed: 'rgba(255,255,255,0.07)',
  hairline: 'rgba(255,255,255,0.07)',
  hairlineLit: 'rgba(255,255,255,0.11)',
  // text
  ink: '#E7E2D8',          // 12.9:1 to 15.1:1 on every surface
  ink2: '#A8A399',         // 6.6:1 to 7.7:1; body-eligible
  ink3: '#8A857C',         // 4.5:1 to 5.3:1: the dimmest text that still reads clearly (the design audit's floor); captions, disclaimers, disabled
  // the single accent
  lamp: '#C29A62',         // 6.4:1 to 7.5:1 as text; the only filled bright surface
  lampDeep: '#7A6140',     // tracks, selected borders, arc at rest (decoration only, 3.1:1)
  lampGlow: 'rgba(194,154,98,0.14)',   // maximum glow fill
  onLamp: '#0B0D12',       // text on a lamp button, 7.5:1
  // meaning colours, always paired with a word
  rose: '#D28E7C',         // 'worse', destructive confirms, 6.3:1 to 7.3:1
  moss: '#9DB08A',         // 'easier' journal bar, helped-most line, 7.1:1 to 8.3:1
  // derived alphas, so no component writes an rgba() literal
  roseLine: 'rgba(210,142,124,0.35)',  // the rose button border
  lampTrack: 'rgba(122,97,64,0.35)',   // journal bar tracks (lampDeep @ 0.35)
  focusRing: 'rgba(194,154,98,0.7)',   // web :focus-visible outline (lamp @ 70%)
  scrim: 'rgba(0,0,0,0.5)',            // behind a modal sheet
  glass: 'rgba(14,16,22,0.72)',        // under the tab bar / sidebar blur
  veil: 'rgba(11,13,18,0.94)',         // the auto-dim veil at full strength
  // aliases for one release, so untouched files compile (Lamplight graft)
  bg: '#0B0D12', bgTop: '#0B0D12', bgBottom: '#0B0D12',
  surface: 'rgba(255,255,255,0.04)', surfaceStrong: 'rgba(255,255,255,0.07)', raised: 'rgba(255,255,255,0.10)',
  line: 'rgba(255,255,255,0.07)', muted: '#A8A399', faint: '#8A857C',
  accent: '#C29A62', accentDeep: '#7A6140', moon: '#C29A62', warn: '#D28E7C',
};

export const radius = { card: 24, tile: 24, button: 18, chip: 14, pill: 999, sheet: 28 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 36, xxxl: 56 };
export const z = { scene: 0, content: 1, worseBar: 5, tabBar: 6, sheet: 8, veil: 10, dark: 11, setup: 20 };

/** Floor tint per depth step. Softer adds 0.10, "making it worse" adds a permanent 0.10; capped at 0.35. */
export const depthTint: Record<Depth, number> = { 0: 0, 1: 0.12, 2: 0.25 };
export const tintStep = 0.10;
export const tintMax = 0.35;
/** The horizon moves 24 pt per depth step. */
export const horizonStep = 24;

/** Map a saved profile texture (`rain` / `ocean` / `fan` / `none` / undefined) to a scene. */
export function sceneFor(texture: string | null | undefined): SceneTexture {
  return texture === 'rain' || texture === 'ocean' || texture === 'fan' ? texture : 'hush';
}

// Font family names live in fonts.ts; re-exported here so files that import `fonts` from the theme compile.
export { fonts } from './fonts';

/** The tab bar's look, shared by the layout and by screens that hide it (so it comes back styled). */
export const tabBarStyle = {
  backgroundColor: colors.solid, borderTopColor: colors.hairlineLit,
  ...(Platform.OS === 'web' ? { height: 60, paddingBottom: 6 } : {}),
};
