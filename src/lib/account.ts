// Optional account: sign in with a 6-digit code sent by email (no password), sign out, and delete
// the account with everything linked to it. Still works fully without an account.
import { useEffect, useState } from 'react';
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
  /rate limit|too many/i.test(message) ? 'Too many codes asked for. Please wait a few minutes and try again.'
  : /expired|invalid/i.test(message) ? 'That code did not work. Check it, or ask for a new one.'
  : 'Could not reach the sign-in service. Check your connection and try again.';

export async function sendCode(email: string): Promise<string | null> {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email address.';
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? words(error.message) : null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  return error ? words(error.message) : null;
}

export async function signOut() { await supabase.auth.signOut().catch(() => {}); }

/** Deletes the account and everything stored with it on the server (shared usage, review history). */
export async function deleteAccount(): Promise<string | null> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return 'Could not delete the account right now. Please try again.';
  await supabase.auth.signOut().catch(() => {});
  return null;
}
