// "Help improve Still": opt-in sharing of the on-device activity log. Off by default. When on,
// new events are uploaded with the day only (never the time), no name and no free text. Without
// an account, an anonymous Supabase session is used, so shared rows are not linked to anyone.
// Turning it off stops uploads; "delete what I've shared" removes every shared row.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { loadActivity, type ActivityEvent } from './activity';
import { supabase } from './supabase';

const ON_KEY = 'still.share.on';
const SYNCED_KEY = 'still.share.syncedAt';

export async function sharingOn(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ON_KEY)) === '1'; } catch { return false; }
}

async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  const { error } = await supabase.auth.signInAnonymously();
  return !error;
}

export async function setSharing(on: boolean): Promise<string | null> {
  if (on && !(await ensureSession())) return 'Could not turn on sharing right now. Check your connection.';
  try {
    await AsyncStorage.setItem(ON_KEY, on ? '1' : '0');
    // Share from now on, not the history from before the person agreed.
    if (on) await AsyncStorage.setItem(SYNCED_KEY, new Date().toISOString());
  } catch {}
  if (on) syncNow();
  return null;
}

/** Only short, simple values: no free text ever leaves the device. */
function clean(e: ActivityEvent) {
  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k === 't' || k === 'type' || v === null || v === undefined) continue;
    if (typeof v === 'number' || typeof v === 'boolean') props[k] = v;
    else if (typeof v === 'string' && v.length <= 32) props[k] = v;
  }
  return props;
}

let syncing = false;
/** Upload events recorded since the last upload. Safe to call often; does nothing when off. */
export async function syncNow() {
  if (syncing || !(await sharingOn())) return;
  syncing = true;
  try {
    if (!(await ensureSession())) return;
    const since = (await AsyncStorage.getItem(SYNCED_KEY)) || new Date().toISOString();
    const fresh = (await loadActivity()).filter(e => e.t > since && /^[a-z_]{2,32}$/.test(e.type));
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      const rows = chunk.map(e => ({
        day: e.t.slice(0, 10), type: e.type, props: clean(e),
        app_version: String(Constants.expoConfig?.version || '').slice(0, 20), platform: Platform.OS,
      }));
      const { error } = await supabase.from('usage_events').insert(rows);
      if (error) return;
      await AsyncStorage.setItem(SYNCED_KEY, chunk[chunk.length - 1].t);
    }
  } catch {} finally { syncing = false; }
}

/** Remove every event this person has shared. */
export async function deleteShared(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const { error } = await supabase.from('usage_events').delete().gte('id', 0);
  return error ? 'Could not delete shared data right now. Please try again.' : null;
}
