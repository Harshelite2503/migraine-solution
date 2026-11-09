// Activity log: what a person tapped and played, kept only on this device (AsyncStorage), never
// sent anywhere. It powers "Your activity" in the journal and small personal hints (which sound
// helped most). Because nothing leaves the device, the App Store privacy label stays "Data Not
// Collected". Clearing the journal clears this too.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ActivityEvent = { t: string; type: string } & Record<string, string | number | boolean | null | undefined>;

const KEY = 'still.activity.v1';
const MAX_EVENTS = 3000;
const MAX_DAYS = 180;

let events: ActivityEvent[] | null = null;
let loading: Promise<ActivityEvent[]> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function prune(list: ActivityEvent[]) {
  const cutoff = Date.now() - MAX_DAYS * 864e5;
  return list.filter(e => Date.parse(e.t) >= cutoff).slice(-MAX_EVENTS);
}

export function loadActivity(): Promise<ActivityEvent[]> {
  if (events) return Promise.resolve(events);
  if (!loading) {
    loading = AsyncStorage.getItem(KEY)
      .then(raw => { const parsed = JSON.parse(raw || '[]'); return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.t === 'string' && typeof e.type === 'string') : []; })
      .catch(() => [])
      .then(list => { events = prune([...list, ...(events || [])]); return events; });
  }
  return loading;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (events) AsyncStorage.setItem(KEY, JSON.stringify(prune(events))).catch(() => {});
  }, 1000);
}

/** Record one thing the person did. Cheap and never throws. */
export function track(type: string, props: Record<string, string | number | boolean | null | undefined> = {}) {
  try {
    const e = { t: new Date().toISOString(), type, ...props } as ActivityEvent;
    if (events) events.push(e); else { events = [e]; loadActivity(); }
    scheduleSave();
  } catch {}
}

export async function clearActivity() {
  events = []; loading = null;
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

export type SoundName = 'normal' | 'warning' | 'attack';
export const SOUND_LABEL: Record<string, string> = { normal: 'Full', warning: 'Gentle', recovering: 'Gentle', attack: 'Hushed' };

/** What the activity log says, for the journal and for personal hints. */
export function summarize(list: ActivityEvent[], sinceDays = 30) {
  const since = Date.now() - sinceDays * 864e5;
  const recent = list.filter(e => Date.parse(e.t) >= since);
  const minutes: Record<string, number> = {};
  const textures: Record<string, number> = {};
  const outcomes: Record<string, { better: number; same: number; worse: number }> = {};
  let plays = 0, listeningS = 0, darkScreens = 0, softer = 0, worseTaps = 0;
  for (const e of recent) {
    const sound = SOUND_LABEL[String(e.state)] || null;
    if (e.type === 'play') { plays++; if (e.choice === 'softer') softer++; }
    if (e.type === 'stop' && typeof e.durationS === 'number' && e.durationS > 0) {
      listeningS += e.durationS;
      if (sound) minutes[sound] = (minutes[sound] || 0) + e.durationS / 60;
      const tex = typeof e.texture === 'string' && e.texture !== 'none' ? e.texture : 'plain';
      textures[tex] = (textures[tex] || 0) + e.durationS / 60;
    }
    if (e.type === 'dark_screen') darkScreens++;
    if (e.type === 'worse') worseTaps++;
    if (e.type === 'check_in' && sound && (e.answer === 'better' || e.answer === 'same' || e.answer === 'worse')) {
      const o = (outcomes[sound] ||= { better: 0, same: 0, worse: 0 });
      o[e.answer] += 1;
    }
  }
  // The sound that most often left the person feeling "a bit easier" (at least two answers).
  let helpedMost: { sound: string; better: number; total: number } | null = null;
  for (const [sound, o] of Object.entries(outcomes)) {
    const total = o.better + o.same + o.worse;
    if (total >= 2 && o.better > 0 && (!helpedMost || o.better / total > helpedMost.better / helpedMost.total)) helpedMost = { sound, better: o.better, total };
  }
  return { days: sinceDays, plays, listeningMin: listeningS / 60, minutes, textures, outcomes, darkScreens, softer, worseTaps, helpedMost };
}
