// Optional AI review of your sound. Off unless you turn it on; it can only make small, safe changes.
import { useState } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import type { Profile } from '../lib/profile';
import { aiAvailable, requestReview, reviewPayload, ReviewError } from '../lib/ai';
import { loadJournal } from '../lib/storage';
import { Body, Button, Caption, Control, Heading } from '../lib/ui';
import { colors } from '../lib/theme';
import { switchColors } from './AccountCard';

export function AiReviewCard({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  if (!aiAvailable) return null;

  const review = async () => {
    setBusy(true); setNote('Asking for a review. This takes a minute or two…');
    try {
      const ai = await requestReview(profile, await loadJournal());
      onChange({ ...profile, aiReview: ai });
      setNote(ai.rationale.length ? 'Done. Small changes were made to your sound.' : 'Done. No changes needed.');
    } catch (e) { setNote(e instanceof ReviewError ? e.message : 'The review could not be reached. Your sound still works without it.'); }
    setBusy(false);
  };

  return (
    <View style={styles.card}>
      <Heading>AI suggestions</Heading>
      <Caption>An AI looks at your settings and journal counts (no name, dates or notes) and may suggest small changes. It can never make the sound louder or harsher.</Caption>
      <View style={styles.switchRow}>
        <Control style={styles.switchLabel}>Allow AI suggestions</Control>
        <Switch value={profile.consentAI} onValueChange={v => onChange({ ...profile, consentAI: v })} accessibilityLabel="Allow AI suggestions" {...switchColors(profile.consentAI)} />
      </View>
      {profile.consentAI && <Button label={busy ? 'Reviewing…' : 'Suggest changes'} onPress={review} disabled={busy} />}
      {profile.consentAI && <Button kind="quiet" icon="eye-outline" label={preview ? 'Hide what is sent' : 'See what is sent'} onPress={async () => setPreview(preview ? null : JSON.stringify(reviewPayload(profile, await loadJournal()), null, 1))} />}
      {preview ? <Text selectable style={styles.preview}>{preview}</Text> : null}
      {profile.aiReview?.summary ? <Body style={styles.summary}>{profile.aiReview.summary}</Body> : null}
      {profile.aiReview ? <Button kind="quiet" label="Undo AI changes" onPress={() => onChange({ ...profile, aiReview: null })} /> : null}
      {note ? <Caption accessibilityLiveRegion="polite">{note}</Caption> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  switchLabel: { flex: 1 },
  // The exact payload, in a monospace face so the JSON lines up.
  preview: {
    color: colors.ink2, fontSize: 12, lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'ui-monospace, Menlo, monospace' }),
  },
  summary: { borderLeftWidth: 2, borderLeftColor: colors.lampDeep, paddingLeft: 12 },
});
