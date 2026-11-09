// Journal: headache episodes, what was chosen and how it felt. Kept on this device.
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { episodes, freshJournal, metrics, sanitizeJournal } from '../engine/journal-store.js';
import { clearJournal, loadJournal, saveJournal, type Journal } from '../lib/storage';
import { clearActivity, loadActivity, summarize } from '../lib/activity';
import { Button, Columns, confirmAction, H1, H2, Muted, Screen, styles } from '../lib/ui';
import { colors, fonts } from '../lib/theme';

const CHOICES = { silence: 'Dark screen', comfort: 'My sound', softer: 'Softer' } as const;
const FOLLOWS = { better: 'A bit easier', same: 'About the same', worse: 'Worse' } as const;
const DAY = 864e5;

export default function JournalScreen() {
  const [journal, setJournal] = useState<Journal>(freshJournal() as Journal);
  const [note, setNote] = useState('');
  const [act, setAct] = useState(summarize([]));
  useFocusEffect(useCallback(() => { loadJournal().then(setJournal); loadActivity().then(a => setAct(summarize(a, 90))).catch(() => {}); }, []));

  const m = metrics(journal);
  const eps = episodes(journal).reverse();

  const addMissed = async (daysAgo: number) => {
    const at = new Date(Date.now() - daysAgo * DAY); at.setHours(12, 0, 0, 0);
    const day = at.toISOString().slice(0, 10);
    const j = await loadJournal();
    if (j.missed.some(x => x.at.slice(0, 10) === day)) { setNote('That day is already noted.'); return; }
    j.missed.push({ at: at.toISOString() });
    const next = sanitizeJournal(j) as Journal;
    setNote((await saveJournal(next)) ? 'Noted. Thank you.' : 'The phone is not letting Still save.');
    setJournal(next);
  };

  const clear = () => confirmAction('Clear your journal?', 'This removes every entry from this device. It cannot be undone.', 'Clear',
    async () => { await clearJournal(); await clearActivity(); setJournal(freshJournal() as Journal); setAct(summarize([])); setNote('Journal cleared.'); });

  return (
    <Screen>
        <Columns rightWidth={460} left={<>
        <H1>Your journal</H1>
        <Muted>Still notes each time you use it. It stays on this device.</Muted>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat value={m.usedEpisodes} label="hard days with Still" />
          <Stat value={m.medianListeningMin === null ? '–' : Math.round(m.medianListeningMin)} label="usual minutes" />
        </View>
        {act.helpedMost && <Text style={{ color: colors.accent, fontSize: 14 }}>{`${act.helpedMost.sound} has helped you most so far.`}</Text>}

        <View style={styles.card}>
          <H2>How it felt afterwards</H2>
          <Bars counts={m.followUps} labels={FOLLOWS} />
          <Muted small>Feeling better afterwards doesn't mean the sound caused it.</Muted>
        </View>

        <View style={styles.card}>
          <H2>Headache without Still?</H2>
          <Muted>One tap, no details.</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Button fit label="Today" onPress={() => addMissed(0)} style={{ flex: 1, paddingHorizontal: 8 }} />
            <Button fit label="Yesterday" onPress={() => addMissed(1)} style={{ flex: 1, paddingHorizontal: 8 }} />
            <Button fit label="2 days ago" onPress={() => addMissed(2)} style={{ flex: 1, paddingHorizontal: 8 }} />
          </View>
        </View>
        {note ? <Muted>{note}</Muted> : null}

        </>} right={<>
        <View style={styles.card}>
          <H2>Episodes ({eps.length})</H2>
          {eps.length === 0 && <Muted>Nothing yet. When a headache starts, open the Quiet room.</Muted>}
          {eps.slice(0, 40).map(e => {
            const chose = Object.entries(e.choices).filter(([, n]) => n).map(([k, n]) => `${CHOICES[k as keyof typeof CHOICES].toLowerCase()}${Number(n) > 1 ? ` ×${n}` : ''}`).join(' · ');
            const felt = Object.entries(e.followUps).filter(([k, n]) => n && k in FOLLOWS).map(([k]) => FOLLOWS[k as keyof typeof FOLLOWS].toLowerCase());
            return (
              <View key={e.start} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4, gap: 2 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{new Date(e.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                <Muted small>{[chose, e.listeningS ? `${Math.round(e.listeningS / 60)} min` : '', felt.length ? `felt ${felt.join(', ')}` : ''].filter(Boolean).join(' · ')}</Muted>
                {e.worse && <Text style={{ color: colors.warn, fontSize: 12 }}>made it worse once</Text>}
              </View>
            );
          })}
        </View>
        {(eps.length > 0 || m.missedEpisodes > 0) && <Button kind="quiet" label="Clear journal" onPress={clear} />}
        </>} />
    </Screen>
  );
}

function Stat({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) {
  return (
    <View style={[styles.card, { flexBasis: '47%', flexGrow: 1 }]}>
      <Text style={{ color: warn ? colors.warn : colors.ink, fontFamily: fonts.display, fontSize: 34 }}>{value}</Text>
      <Muted small>{label}</Muted>
    </View>
  );
}

function Bars({ counts, labels }: { counts: Record<string, number>; labels: Record<string, string> }) {
  const max = Math.max(1, ...Object.keys(labels).map(k => counts[k] || 0));
  return (
    <View style={{ gap: 8, marginVertical: 6 }}>
      {Object.entries(labels).map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: colors.ink, fontSize: 13, width: 130 }}>{label}</Text>
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.raised }}>
            <View style={{ width: `${((counts[k] || 0) / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          </View>
          <Text style={{ color: colors.ink, width: 24, textAlign: 'right' }}>{counts[k] || 0}</Text>
        </View>
      ))}
    </View>
  );
}
