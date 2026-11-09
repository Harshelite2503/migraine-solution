// Browser storage for rendered sounds: blob URLs kept in memory for this visit.
// Nothing is uploaded; the sound is generated and played inside the browser tab.
const urls = new Map<string, string>();
const MAX = 24; // rendered loops are ~2 MB each; keep memory bounded

export function cachedUri(name: string): string | null {
  return urls.get(name) ?? null;
}

export async function storeWav(name: string, bytes: Uint8Array): Promise<string> {
  const old = urls.get(name);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }));
  urls.set(name, url);
  while (urls.size > MAX) {
    const [first, u] = urls.entries().next().value as [string, string];
    URL.revokeObjectURL(u); urls.delete(first);
  }
  return url;
}
