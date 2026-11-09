// First-visit routing for the web build. A browser that has neither finished setup nor seen the
// landing page is sent to /welcome once. Native never redirects: the app store listing is its landing.
// Safe to import anywhere: nothing here touches `window` unless it exists.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

const WELCOMED_KEY = 'still.welcomed';

/** True when the landing was seen, or when we cannot tell (no storage): never redirect on doubt. */
function hasBeenWelcomed(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(WELCOMED_KEY) === '1'; } catch { return true; }
}

/**
 * Call once in the Quiet room with its own `onboarded` state (null while it is still loading).
 * On web only, redirects to /welcome when the room has decided there is no sound set up yet
 * (strictly false: it already counts people who set up before the flag existed) and the landing
 * has not been seen. Anyone who finished or skipped setup never sees the landing again.
 */
export function useWelcomeRedirect(onboarded: boolean | null): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || onboarded !== false || hasBeenWelcomed()) return;
    router.replace('/welcome');
  }, [onboarded]);
}

/** Remember that the landing was seen. Every landing CTA calls this before navigating. */
export function markWelcomed(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(WELCOMED_KEY, '1'); } catch {}
}
