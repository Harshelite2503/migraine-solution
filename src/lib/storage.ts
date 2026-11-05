// On-device storage. Nothing is sent anywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { freshJournal, sanitizeJournal, JOURNAL_KEY } from '../engine/journal-store.js';
import { freshProfile, sanitizeProfile, PROFILE_KEY, type Profile } from './profile';

export type Session = {
  id: string; at: string; state: 'attack' | 'warning' | 'recovering'; choice: 'silence' | 'comfort' | 'softer';
  durationS: number; levelDb: number | null; worse: boolean; followUp: 'better' | 'same' | 'worse' | 'skipped' | null;
};
export type Journal = { schema: string; sessions: Session[]; missed: { at: string }[] };

export async function loadJournal(): Promise<Journal> {
  try { return sanitizeJournal(JSON.parse((await AsyncStorage.getItem(JOURNAL_KEY)) || 'null')) as Journal; } catch { return freshJournal() as Journal; }
}
export async function saveJournal(journal: Journal): Promise<boolean> {
  try { await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(journal)); return true; } catch { return false; }
}
export async function clearJournal(): Promise<void> {
  try { await AsyncStorage.removeItem(JOURNAL_KEY); } catch {}
}

export async function loadProfile(): Promise<Profile> {
  try { return sanitizeProfile(JSON.parse((await AsyncStorage.getItem(PROFILE_KEY)) || 'null')); } catch { return freshProfile(); }
}
export async function saveProfile(profile: Profile): Promise<boolean> {
  try { await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; } catch { return false; }
}
