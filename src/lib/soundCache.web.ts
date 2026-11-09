// Browser storage for rendered sounds: the samples themselves, kept in memory for this visit, so
// they can be played gaplessly with Web Audio. Nothing is uploaded.
type Rendered = { left: Float32Array; right: Float32Array; rate: number };
const sounds = new Map<string, Rendered>();
const MAX = 24; // rendered loops are ~4 MB each as float samples; keep memory bounded

export function cachedUri(name: string): string | null {
  return sounds.has(name) ? `mem:${name}` : null;
}

export async function storeSound(name: string, s: Rendered): Promise<string> {
  sounds.delete(name);
  sounds.set(name, s);
  while (sounds.size > MAX) sounds.delete(sounds.keys().next().value as string);
  return `mem:${name}`;
}

/** The samples behind a key from cachedUri/storeSound. */
export function samplesFor(key: string): Rendered | null {
  return sounds.get(key.replace(/^mem:/, '')) ?? null;
}
