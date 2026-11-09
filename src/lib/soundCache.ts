// Phone storage for rendered sounds: WAV files in the app's cache folder, reused across launches.
// The web build uses soundCache.web.ts instead (in-memory blob URLs).
import { File, Paths } from 'expo-file-system';

/** The playable URI of a sound already rendered under this name, or null. */
export function cachedUri(name: string): string | null {
  const file = new File(Paths.cache, name);
  return file.exists ? file.uri : null;
}

/** Store WAV bytes under this name and return a playable URI. */
export async function storeWav(name: string, bytes: Uint8Array): Promise<string> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(bytes);
  return file.uri;
}
