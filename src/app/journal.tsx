// Journal: headache episodes, what was chosen, how it felt, and the privacy-minimal pilot summary.
import { useCallback, useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { episodes, freshJournal, metrics, pilotSummary, sanitizeJournal } from '../engine/journal-store.js';
import { clearJournal, loadJournal, saveJournal, type Journal } from '../lib/storage';
import { Button, confirmAction, Eyebrow, H1, H2, Muted, Screen, styles } from '../lib/ui';
import { colors, fonts } from '../lib/theme';

const CHOICES = { silence: 'Dark screen, no sound', comfort: 'My comfort sound', softer: 'Softer and darker' } as const;
const FOLLOWS = { better: 'A bit easier', same: 'About the same', worse: 'Worse' } as const;
const STATES: Record<string, string> = { attack: 'headache', warning: 'warning signs', recovering: 'recovering' };
const DAY = 864e5;

export default function JournalScreen() {
  const [journal, setJournal] = useState<Journal>(freshJournal() as Journal);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  useFocusEffect(useCallback(() => { loadJournal().then(setJournal); }, []));

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

  const sharePilot = async () => {
    let summary;
    try { summary = pilotSummary(journal, code); } catch { setNote('Enter the pilot code you were given (letters and numbers only).'); return; }
    const text = JSON.stringify(summary);
    try {
      await Share.share({ title: `Still pilot ${summary.participant}`, message: text });
    } catch {
      // Browsers without a share sheet: copy it instead.
      try { await navigator.clipboard.writeText(text); setNote('Copied your pilot summary. Paste it into an email to the study team.'); }
      catch { setNote('This browser cannot share or copy. Try it on your phone.'); }
    }
  };

  const clear = () => confirmAction('Clear your journal?', 'This removes every episode from this device. It cannot be undone.', 'Clear',
    async () => { await clearJournal(); setJournal(freshJournal() as Journal); setNote('Journal cleared.'); });

  return (
    <Screen>
        <Eyebrow>Still · journal</Eyebrow>
        <H1>Your hard days</H1>
        <Muted>Each time you use the quiet room, Still notes the date, what you chose and for how long. Sessions within 12 hours count as one episode. Nothing leaves this phone unless you share it.</Muted>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat value={m.usedEpisodes} label="episodes with Still, last 60 days" />
          <Stat value={m.missedEpisodes} label="headaches noted without Still" />
          <Stat value={m.medianListeningMin === null ? '–' : Math.round(m.medianListeningMin)} label="typical minutes of sound" />
          <Stat value={m.worseSessions} label="sessions that made it worse" warn={m.worseSessions > 0} />
        </View>

        <View style={styles.card}>
          <H2>What you chose</H2>
          <Bars counts={m.choices} labels={CHOICES} />
          <View style={{ height: 10 }} />
          <H2>How it felt afterwards</H2>
          <Bars counts={m.followUps} labels={FOLLOWS} />
          <Muted small>Feeling better afterwards does not show the sound caused it. Headaches also ease with time, rest and medicine.</Muted>
        </View>

        <View style={styles.card}>
          <H2>Episodes ({eps.length})</H2>
          {eps.length === 0 && <Muted>No episodes yet. When a headache starts, open the Quiet room.</Muted>}
          {eps.slice(0, 40).map(e => {
            const chose = Object.entries(e.choices).filter(([, n]) => n).map(([k, n]) => `${CHOICES[k as keyof typeof CHOICES].toLowerCase()}${Number(n) > 1 ? ` ×${n}` : ''}`).join(' · ');
            const felt = Object.entries(e.followUps).filter(([k, n]) => n && k in FOLLOWS).map(([k]) => FOLLOWS[k as keyof typeof FOLLOWS].toLowerCase());
            return (
              <View key={e.start} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 4, gap: 2 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{new Date(e.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {[...new Set(e.sessions.map((s: any) => STATES[s.state]))].join(', ')}</Text>
                <Muted small>{chose}</Muted>
                <Muted small>{[e.listeningS ? `${Math.round(e.listeningS / 60)} min of sound` : '', e.darkS ? `${Math.round(e.darkS / 60)} min dark` : '', felt.length ? `felt: ${felt.join(', ')}` : ''].filter(Boolean).join(' · ')}</Muted>
                {e.worse && <Text style={{ color: colors.warn, fontSize: 12 }}>made it worse once</Text>}
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <H2>Had a headache without opening Still?</H2>
          <Muted>Noting these keeps the picture honest. One tap, no details.</Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Button label="Today" onPress={() => addMissed(0)} style={{ flex: 1 }} />
            <Button label="Yesterday" onPress={() => addMissed(1)} style={{ flex: 1 }} />
            <Button label="2 days ago" onPress={() => addMissed(2)} style={{ flex: 1 }} />
          </View>
        </View>

        <View style={styles.card}>
          <H2>Taking part in the pilot?</H2>
          <Muted>Enter your pilot code and share a summary with the pilot team. It holds only day numbers counted from your first use, what you tapped and for how long. No dates, notes or sound settings.</Muted>
          <TextInput value={code} onChangeText={setCode} placeholder="Pilot code, e.g. P017" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} maxLength={24}
            style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, color: colors.ink, marginTop: 6 }} accessibilityLabel="Pilot code" />
          <Button kind="primary" label="Share pilot summary" onPress={sharePilot} style={{ marginTop: 6 }} />
          <Button kind="quiet" label="Clear journal" onPress={clear} />
        </View>
        {note ? <Muted>{note}</Muted> : null}
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
