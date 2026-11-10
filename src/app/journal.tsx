// Journal: headache episodes, what was chosen and how it felt. Kept on this device. The room is always
// hush at depth 1, the quietest scene, because this page is read on better days than the quiet room.
import { useCallback, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { episodes, freshJournal, metrics, sanitizeJournal } from '../engine/journal-store.js';
import { clearJournal, loadJournal, saveJournal, type Journal } from '../lib/storage';
import { clearActivity, loadActivity, summarize } from '../lib/activity';
import { Body, Button, Card, Caption, Chip, Columns, confirmAction, Heading, Screen, Status, Title } from '../lib/ui';
import { colors } from '../lib/theme';
import { Stat } from '../components/journal/Stat';
import { Bars } from '../components/journal/Bars';
import { Timeline } from '../components/journal/Timeline';

const CHOICES = { silence: 'Dark screen', comfort: 'My sound', softer: 'Softer' } as const;
const FOLLOWS = { better: 'A bit easier', same: 'About the same', worse: 'Worse' } as const;
const BAR_COLORS: Record<keyof typeof FOLLOWS, string> = { better: colors.moss, same: colors.ink3, worse: colors.rose };
const DAY = 864e5;

export default function JournalScreen() {
  const { fontScale } = useWindowDimensions();
  const fit = fontScale <= 1.1;
  const [journal, setJournal] = useState<Journal>(freshJournal() as Journal);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [act, setAct] = useState(summarize([]));
  useFocusEffect(useCallback(() => {
    loadJournal().then(j => { setJournal(j); setLoaded(true); });
    loadActivity().then(a => setAct(summarize(a, 90))).catch(() => {});
  }, []));

  const m = metrics(journal);
  const eps = episodes(journal).reverse();
  const empty = m.usedEpisodes === 0;

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

  const timeline = eps.slice(0, 40).map(e => {
    const chose = Object.entries(e.choices).filter(([, n]) => n).map(([k, n]) => `${CHOICES[k as keyof typeof CHOICES].toLowerCase()}${Number(n) > 1 ? ` ×${n}` : ''}`).join(' · ');
    const felt = Object.entries(e.followUps).filter(([k, n]) => n && k in FOLLOWS).map(([k]) => FOLLOWS[k as keyof typeof FOLLOWS].toLowerCase());
    const minutes = e.listeningS ? Math.round(e.listeningS / 60) : 0;
    return {
      key: e.start,
      date: new Date(e.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
      details: [chose, e.listeningS ? `${minutes} min` : '', felt.length ? `felt ${felt.join(', ')}` : ''].filter(Boolean).join(' · '),
      minutes: e.listeningS / 60,
      worse: e.worse,
    };
  });

  return (
    <Screen texture="hush" depth={1}>
      <Columns rightWidth={460} left={<>
        <Title>Your journal</Title>
        <Body color={colors.ink2}>Still notes each time you use it. It stays on this device.</Body>

        <View style={styles.stats}>
          <Stat value={empty ? null : m.usedEpisodes} label="hard days with Still" />
          <Stat value={m.medianListeningMin === null ? null : Math.round(m.medianListeningMin)} label="usual minutes" />
        </View>
        {act.helpedMost ? <Body color={colors.moss}>{`${act.helpedMost.sound} has helped you most so far.`}</Body> : null}

        <Card>
          <Heading>How it felt afterwards</Heading>
          <Bars ready={loaded} rows={(Object.keys(FOLLOWS) as (keyof typeof FOLLOWS)[]).map(k => ({ key: k, label: FOLLOWS[k], count: m.followUps[k] || 0, color: BAR_COLORS[k] }))} />
          <Caption color={colors.ink3}>Feeling better afterwards doesn't mean the sound caused it.</Caption>
        </Card>

        <Card>
          <Heading>Headache without Still?</Heading>
          <Body color={colors.ink2}>One tap, no details.</Body>
          <View style={[styles.chips, !fit && styles.chipsWrap]}>
            <Chip fit={fit} label="Today" onPress={() => addMissed(0)} style={styles.chip} />
            <Chip fit={fit} label="Yesterday" onPress={() => addMissed(1)} style={styles.chip} />
            <Chip fit={fit} label="2 days ago" onPress={() => addMissed(2)} style={styles.chip} />
          </View>
        </Card>
        <Status>{note}</Status>

      </>} right={<>
        <Heading>{`Episodes (${eps.length})`}</Heading>
        <Timeline episodes={timeline} />
        {(eps.length > 0 || m.missedEpisodes > 0) ? <Button kind="quiet" label="Clear journal" onPress={clear} /> : null}
      </>} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 6 },
  // Three across on a 375 pt phone, each label on one line. Under large type they wrap instead of
  // shrinking past readable, so nothing is cut to "2 days a…".
  chip: { flex: 1, paddingHorizontal: 8 },
  chipsWrap: { flexWrap: 'wrap' },
});
