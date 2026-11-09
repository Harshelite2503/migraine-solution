// Still's Supabase project: optional sign-in, opt-in usage sharing and the AI review allowance.
// The publishable key is meant to be public; row-level security in the database decides what any
// request can do (see supabase/migrations). The session is kept on the device.
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

if (Platform.OS !== 'web') require('react-native-url-polyfill/auto');

// Still's own project, set at build time. Until it is set, sign-in and sharing stay hidden.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY || '';
export const supabaseReady = SUPABASE_URL.startsWith('https://') && SUPABASE_KEY.length > 0;

export const supabase = createClient(supabaseReady ? SUPABASE_URL : 'https://not-configured.invalid', supabaseReady ? SUPABASE_KEY : 'not-configured', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// On phones, refresh the session only while the app is in the foreground (Supabase's advice).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
  });
}
