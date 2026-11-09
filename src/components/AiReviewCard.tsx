// Optional AI review of your sound. Off unless you turn it on; it can only make small, safe changes.
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { Profile } from '../lib/profile';
import { aiAvailable, requestReview, reviewPayload, ReviewError } from '../lib/ai';
import { loadJournal } from '../lib/storage';
import { Button, H2, Muted } from '../lib/ui';
import { colors } from '../lib/theme';

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
    <View style={{ gap: 10 }}>
      <H2>AI suggestions</H2>
      <Muted small>An AI looks at your settings and journal counts (no name, dates or notes) and may suggest small changes. It can never make the sound louder or harsher.</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.ink, flex: 1 }}>Allow AI suggestions</Text>
        <Switch value={profile.consentAI} onValueChange={v => onChange({ ...profile, consentAI: v })} />
      </View>
      {profile.consentAI && <Button label={busy ? 'Reviewing…' : 'Suggest changes'} onPress={review} disabled={busy} />}
      {profile.consentAI && <Button kind="quiet" icon="eye-outline" label={preview ? 'Hide what is sent' : 'See what is sent'} onPress={async () => setPreview(preview ? null : JSON.stringify(reviewPayload(profile, await loadJournal()), null, 1))} />}
      {preview ? <Text selectable style={{ color: colors.muted, fontSize: 11, fontFamily: 'Courier' }}>{preview}</Text> : null}
      {profile.aiReview?.summary ? <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 12 }}>{profile.aiReview.summary}</Text> : null}
      {profile.aiReview ? <Button kind="quiet" label="Undo AI changes" onPress={() => onChange({ ...profile, aiReview: null })} /> : null}
      {note ? <Muted small>{note}</Muted> : null}
    </View>
  );
}
