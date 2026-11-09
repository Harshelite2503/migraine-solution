// Phone storage for rendered sounds: WAV files in the app's cache folder, reused across launches.
// The web build uses soundCache.web.ts instead (samples kept in memory).
import { File, Paths } from 'expo-file-system';
import { encodeWav } from '../engine/wav.js';

type Rendered = { left: Float32Array; right: Float32Array; rate: number };

/** The playable URI of a sound already rendered under this name, or null. */
export function cachedUri(name: string): string | null {
  const file = new File(Paths.cache, name);
  return file.exists ? file.uri : null;
}

/** Store a rendered sound under this name and return a playable URI. */
export async function storeSound(name: string, s: Rendered): Promise<string> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(encodeWav(s.left, s.right, s.rate));
  return file.uri;
}
