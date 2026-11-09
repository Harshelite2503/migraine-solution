// My sound: a small mixer. Pick a texture and turn four dials while your sound plays; each change
// saves at once. Choosing by ear (A/B) and account settings sit behind one tap each.
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { freshProfile, type Profile } from '../lib/profile';
import { loadProfile, saveOnboarded, saveProfile } from '../lib/storage';
import * as player from '../lib/player';
import { Tests } from '../components/build/Tests';
import { PreviewButton, ProfileDial, TextureTiles, usePreview } from '../components/Studio';
import { AiReviewCard } from '../components/AiReviewCard';
import { SupportCard } from '../components/SupportCard';
import { AccountCard, SharingCard } from '../components/AccountCard';
import { Body, Button, Caption, Card, Columns, confirmAction, Row, Screen, Title, useTablet, useWide } from '../lib/ui';
import { colors, space } from '../lib/theme';
import { track } from '../lib/activity';

const EAR_TESTS = ['tilt', 'cutoff', 'tonal'];
const DIAL_KEYS = ['tone', 'hum', 'motion', 'space'] as const;

export default function MySound() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [open, setOpen] = useState<'ear' | 'more' | null>(null);
  const preview = usePreview();
  const wide = useWide();
  const tablet = useTablet();
  useFocusEffect(useCallback(() => {
    loadProfile().then(setProfile);
    return () => { preview.stop(); player.stop(0.3); };
  }, []));

  const update = (next: Profile) => { setProfile(next); saveProfile(next); preview.update(next); };
  const hatesHum = (profile.intake.dislikes || []).includes('hum');

  const startOver = () => confirmAction('Set up your sound again?', 'Your dials and choices go back to the start. Your journal stays.', 'Start over', async () => {
    preview.stop();
    const fresh = { ...freshProfile(), consentAI: profile.consentAI };
    await saveProfile(fresh); setProfile(fresh);
    await saveOnboarded(false);
    router.navigate('/');
  });

  const toggle = (k: 'ear' | 'more') => { preview.stop(); if (open !== k) track('step_open', { step: k }); setOpen(open === k ? null : k); };

  const mixer = (
    <>
      <View style={s.header}>
        <Title accessibilityRole="header">Your sound</Title>
        <Body color={colors.ink2}>Turn the dials while it plays. Changes save by themselves.</Body>
      </View>

      <PreviewButton on={preview.on} busy={preview.busy} arc={profile} onPress={() => preview.toggle(profile)} />

      <TextureTiles value={profile.intake.texture} onPick={t => {
        const next = { ...profile, intake: { ...profile.intake, texture: t } };
        update(next);
        if (!preview.on) preview.start(next);
      }} />

      <Card style={s.dials}>
        {DIAL_KEYS.map(k => (
          <View key={k} style={s.dial}>
            <ProfileDial which={k} profile={profile} onChange={update} size={tablet ? 110 : 100} disabled={k === 'hum' && hatesHum} />
          </View>
        ))}
      </Card>
    </>
  );

  const extras = (
    <>
      <View style={s.rows}>
        <Row icon="headset-outline" label="Let Still choose by ear" sub="Pick the calmer of two, a few times · 3 min"
          expanded={open === 'ear'} onPress={() => toggle('ear')}>
          <Tests profile={profile} onChange={update} keys={EAR_TESTS} />
        </Row>
        <Row icon="settings-outline" label="Account and privacy" sub="Optional sign-in, sharing, AI suggestions"
          expanded={open === 'more' || wide} onPress={() => toggle('more')}>
          <AiReviewCard profile={profile} onChange={update} />
          <AccountCard />
          <SharingCard />
          <SupportCard />
        </Row>
      </View>
      <Button kind="quiet" icon="refresh-outline" label="Start over" onPress={startOver} />
      <Caption color={colors.ink3}>Still is for comfort. It does not diagnose, treat or prevent migraine.</Caption>
    </>
  );

  return (
    <Screen texture={profile.intake.texture} depth={1}>
      <Columns left={mixer} right={extras} />
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { gap: space.xs },
  dials: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 18, paddingVertical: 22 },
  dial: { flexBasis: '45%', alignItems: 'center' },
  // Rows draw a hairline beneath themselves; this closes the list on top.
  rows: { borderTopWidth: 1, borderTopColor: colors.hairline },
});
