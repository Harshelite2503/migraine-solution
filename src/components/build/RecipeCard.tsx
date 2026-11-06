// Your sound recipe: every exact value for the chosen state, where it came from, and why.
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { EVIDENCE } from '../../recipe/evidence.js';
import { describeRecipe } from '../../recipe/recipe.js';
import { recipeFor, type AnyState, type Profile } from '../../lib/profile';
import { aiAvailable, requestReview } from '../../lib/ai';
import { loadJournal } from '../../lib/storage';
import * as player from '../../lib/player';
import { Button, H2, Muted, Segmented } from '../../lib/ui';
import { colors } from '../../lib/theme';

type Props = { profile: Profile; onChange: (p: Profile) => void };
const SOURCE: Record<string, string> = { measured: 'measured', learned: 'learned', estimated: 'from your answers', default: 'default', rule: 'safety rule', ai: 'AI review' };
const LABEL: Record<string, string> = {
  tiltDbPerOct: 'Darkness (spectral tilt)', cutoffHz: 'Top-end softening', tonal: 'Hum share', humHz: 'Hum pitch', harmonics: 'Hum harmonics',
  swellDb: 'Swell depth', swellPeriodS: 'Swell period', width: 'Stereo width', eq: 'Personal EQ', levelDb: 'Level', fadeInS: 'Fade-in', timerMin: 'Timer',
};

export function RecipeCard({ profile, onChange }: Props) {
  const [state, setState] = useState<AnyState>('attack');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const { recipe: r, why } = recipeFor(profile, state);
  const d = describeRecipe(r);
  const rows: [string, string][] = [
    ['Darkness', `${r.tiltDbPerOct.toFixed(1)} dB per octave · ${d.tilt}`],
    ['Top end', `softened above ${Math.round(r.cutoffHz)} Hz`],
    ['Texture', d.texture],
    ['Hum', r.tonal < 0.05 ? 'none' : `${r.humHz.toFixed(1)} Hz with ${r.harmonics} harmonics (up to ${Math.round(r.humHz * r.harmonics)} Hz)`],
    ['Movement', r.swellDb < 0.1 ? 'steady' : `${r.swellDb.toFixed(1)} dB swell every ${r.swellPeriodS.toFixed(0)} s (${(1 / r.swellPeriodS).toFixed(2)} Hz)`],
    ['Width', `${Math.round(r.width * 100)}%`],
    ['EQ cuts', r.eq.filter((e: any) => e.gainDb < -0.5).map((e: any) => `${e.hz >= 1000 ? `${e.hz / 1000}k` : e.hz} ${e.gainDb.toFixed(0)} dB`).join(' · ') || 'none'],
    ['Level', `${r.levelDb.toFixed(0)} dB vs your reference`],
    ['Fade', `in over ${r.fadeInS.toFixed(0)} s · timer ${r.timerMin} min`],
  ];

  const listen = async () => { const uri = await player.recipeFile(r); await player.play(uri, { levelDb: r.levelDb, fadeIn: r.fadeInS, title: 'My sound' }); };
  const review = async () => {
    setBusy(true); setNote('Asking for a review. This usually takes 1–2 minutes…');
    try {
      const ai = await requestReview(profile, await loadJournal());
      onChange({ ...profile, aiReview: ai });
      setNote(ai.rationale.length ? 'Review added. Changes marked "AI review" below; the safety limits still apply.' : 'The review suggested no changes.');
    } catch { setNote('The review could not be reached. Your recipe still works without it.'); }
    setBusy(false);
  };

  return (
    <View style={{ gap: 10 }}>
      <Segmented options={[{ value: 'normal', label: 'Normal' }, { value: 'warning', label: 'Warning' }, { value: 'attack', label: 'Headache' }, { value: 'recovering', label: 'Recovery' }]} value={state} onChange={setState} />
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
          <Text style={{ color: colors.muted, width: 92, fontSize: 13 }}>{k}</Text>
          <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }}>{v}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="▶  Listen" onPress={listen} style={{ flex: 1 }} />
        <Button label="■  Stop" onPress={() => player.stop(2)} style={{ flex: 1 }} />
      </View>

      <H2>Why each setting</H2>
      {why.map((w: any, i: number) => (
        <View key={i} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 }}>
          <Text style={{ color: colors.ink, fontSize: 13 }}>{LABEL[w.param] || w.param} · <Text style={{ color: colors.muted }}>{SOURCE[w.source] || w.source}</Text></Text>
          <Muted small>{w.text}</Muted>
          {w.evidence.filter((e: string) => e !== 'personal').map((e: string) => (
            <Muted key={e} small>↳ {EVIDENCE[e as keyof typeof EVIDENCE]?.citation} ({EVIDENCE[e as keyof typeof EVIDENCE]?.strength})</Muted>
          ))}
        </View>
      ))}

      <H2>AI review (optional)</H2>
      <Muted small>An AI model reads a summary of your answers, test results and journal counts (no name, no dates, no notes), compares it with the research above, and may suggest small changes. Your safety limits always win: a review can never make a sound louder or harsher. It is not medical advice.</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.ink, flex: 1 }}>Allow AI review of my sound</Text>
        <Switch value={profile.consentAI} onValueChange={v => onChange({ ...profile, consentAI: v })} />
      </View>
      {aiAvailable
        ? <Button kind="primary" label={busy ? 'Reviewing…' : 'Ask AI to review my sound'} onPress={review} disabled={!profile.consentAI || busy} />
        : <Muted small>AI review is not set up in this build of the app.</Muted>}
      {profile.aiReview?.cautions?.map((c, i) => <Muted key={`c${i}`} small>Note: {c}</Muted>)}
      {profile.aiReview?.questions?.length ? <Muted small>Worth thinking about: {profile.aiReview.questions.join(' ')}</Muted> : null}
      {profile.aiReview ? <Button kind="quiet" label="Remove the AI review" onPress={() => onChange({ ...profile, aiReview: null })} /> : null}
      {note ? <Muted>{note}</Muted> : null}
    </View>
  );
}
