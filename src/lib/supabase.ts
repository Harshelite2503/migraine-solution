// Still's Supabase project: optional sign-in, opt-in usage sharing and the AI review allowance.
// The publishable key is meant to be public; row-level security in the database decides what any
// request can do (see supabase/migrations). The session is kept on the device.
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

if (Platform.OS !== 'web') require('react-native-url-polyfill/auto');

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jxalfqqykvrokovndbgh.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY || 'sb_publishable_eqlyAGAP4iT1gFbg9qqm4Q_Ym6YGhTF';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// On phones, refresh the session only while the app is in the foreground (Supabase's advice).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
  });
}
