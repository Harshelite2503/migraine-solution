// Optional account: sign in with a link sent by email (no password), sign out, and delete the
// account with everything linked to it. Still works fully without an account.
// The link opens on the same device: in a browser it returns to the website; on a phone it opens
// the Still app (still://auth), which reads the sign-in from the link.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

/** Signed in with an email (not just the anonymous session used for sharing). */
export const isSignedIn = (s: Session | null) => !!s && !s.user.is_anonymous && !!s.user.email;

const words = (message: string) =>
  /rate limit|too many/i.test(message) ? 'Too many sign-in emails asked for. Please wait a while and try again.'
  : /expired|invalid/i.test(message) ? 'That sign-in link did not work. Ask for a new one.'
  : 'Could not reach the sign-in service. Check your connection and try again.';

const returnTo = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/tune` : Linking.createURL('auth'));

export async function sendLink(email: string): Promise<string | null> {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email address.';
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: returnTo() } });
  return error ? words(error.message) : null;
}

/** On phones: finish signing in when the email link opens the app (still://auth#access_token=…). */
async function fromLink(url: string | null) {
  if (!url || !url.includes('access_token=')) return;
  const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1] || '');
  const access_token = params.get('access_token'), refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token }).catch(() => {});
}
export function listenForSignInLinks() {
  if (Platform.OS === 'web') return () => {}; // the website reads the link itself
  Linking.getInitialURL().then(fromLink).catch(() => {});
  const sub = Linking.addEventListener('url', e => { fromLink(e.url); });
  return () => sub.remove();
}

export async function signOut() { await supabase.auth.signOut().catch(() => {}); }

/** Deletes the account and everything stored with it on the server (shared usage, review history). */
export async function deleteAccount(): Promise<string | null> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return 'Could not delete the account right now. Please try again.';
  await supabase.auth.signOut().catch(() => {});
  return null;
}
