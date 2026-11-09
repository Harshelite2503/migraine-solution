// Two families, bundled on every platform through @expo-google-fonts, so the offline promise holds.
// Nothing waits on them: the scene paints first and text fades in once they resolve (see Screen).
// The per-weight subpaths matter: the package roots require all 18 cuts of each family into the bundle.
import { useFonts } from 'expo-font';
import { Fraunces_300Light } from '@expo-google-fonts/fraunces/300Light';
import { Fraunces_300Light_Italic } from '@expo-google-fonts/fraunces/300Light_Italic';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';

export const fonts = {
  display: 'Fraunces_300Light',
  displayItalic: 'Fraunces_300Light_Italic',
  title: 'Fraunces_400Regular',
  body: 'Inter_400Regular',
  ui: 'Inter_500Medium',
} as const;

const FILES = { Fraunces_300Light, Fraunces_300Light_Italic, Fraunces_400Regular, Inter_400Regular, Inter_500Medium };

/**
 * Loads the five font files. `ready` is true as soon as they are cached (instant after the first run).
 * A load failure also reads as ready, so text never stays invisible on a broken device.
 */
export function useAppFonts(): { ready: boolean } {
  const [loaded, error] = useFonts(FILES);
  return { ready: loaded || error != null };
}
