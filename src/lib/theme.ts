import { Platform } from 'react-native';
// Still's night palette: deep blue-black fading to forest green, sage and moonlight accents.
// Dark-only on purpose: the app is used in dark rooms during headaches. No flashing, no bright whites.
export const colors = {
  bgTop: '#070b10',
  bgBottom: '#0c1a16',
  bg: '#09120f',
  surface: 'rgba(255,255,255,0.045)',
  surfaceStrong: 'rgba(255,255,255,0.08)',
  raised: 'rgba(255,255,255,0.10)',
  line: 'rgba(255,255,255,0.09)',
  ink: '#dbe4d8',
  muted: '#8d9b92',
  faint: '#7d8a81',       // the dimmest text that still reads clearly (4.5:1)
  accent: '#a9c79b',       // sage
  accentDeep: '#3f5f4b',
  moon: '#cdbb8c',         // warm moonlight, used sparingly
  warn: '#e39b83',
  black: '#000000',
};

export const fonts = { display: 'Georgia' };
export const radius = { card: 20, pill: 999, button: 16 };

/** The tab bar's look, shared by the layout and by screens that hide it (so it comes back styled). */
export const tabBarStyle = {
  backgroundColor: colors.bgTop, borderTopColor: colors.line,
  ...(Platform.OS === 'web' ? { height: 60, paddingBottom: 6 } : {}),
};
