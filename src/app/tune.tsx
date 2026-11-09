// My sound: a small mixer. Pick a texture and turn four dials while your sound plays; each change
// saves at once. Choosing by ear (A/B) and account settings sit behind one tap each.
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { freshProfile, type Profile } from '../lib/profile';
import { loadProfile, saveOnboarded, saveProfile } from '../lib/storage';
import * as player from '../lib/player';
import { Tests } from '../components/build/Tests';
import { PreviewButton, ProfileDial, TextureTiles, usePreview } from '../components/Studio';
import { AiReviewCard } from '../components/AiReviewCard';
import { SupportCard } from '../components/SupportCard';
import { AccountCard, SharingCard } from '../components/AccountCard';
import { Button, Columns, confirmAction, H1, Ionicons, Muted, Screen, styles, tap, useWide, type IconName } from '../lib/ui';
import { colors } from '../lib/theme';
import { track } from '../lib/activity';

const EAR_TESTS = ['tilt', 'cutoff', 'tonal'];

export default function MySound() {
  const [profile, setProfile] = useState<Profile>(freshProfile());
  const [open, setOpen] = useState<'ear' | 'more' | null>(null);
  const preview = usePreview();
  const wide = useWide();
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <H1>Your sound</H1>
          <Muted>Turn the dials while it plays. Changes save by themselves.</Muted>
        </View>
      </View>
      <PreviewButton on={preview.on} busy={preview.busy} onPress={() => preview.toggle(profile)} />

      <TextureTiles value={profile.intake.texture} onPick={t => {
        const next = { ...profile, intake: { ...profile.intake, texture: t } };
        update(next);
        if (!preview.on) preview.start(next);
      }} />

      <View style={[styles.card, { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 18, paddingVertical: 22 }]}>
        {(['tone', 'hum', 'motion', 'space'] as const).map(k => (
          <View key={k} style={{ flexBasis: '45%', alignItems: 'center' }}>
            <ProfileDial which={k} profile={profile} onChange={update} size={wide ? 118 : 100} disabled={k === 'hum' && hatesHum} />
          </View>
        ))}
      </View>
    </>
  );

  const extras = (
    <>
      <Row icon="headset-outline" title="Let Still choose by ear" sub="Pick the calmer of two, a few times · 3 min" open={open === 'ear'} onPress={() => toggle('ear')}>
        <Tests profile={profile} onChange={update} keys={EAR_TESTS} />
      </Row>
      <Row icon="settings-outline" title="Account and privacy" sub="Optional sign-in, sharing, AI suggestions" open={open === 'more' || wide} onPress={() => toggle('more')}>
        <AiReviewCard profile={profile} onChange={update} />
        <AccountCard />
        <SharingCard />
        <SupportCard />
      </Row>
      <Button kind="quiet" icon="refresh-outline" label="Start over" onPress={startOver} />
      <Muted small>Still is for comfort. It does not diagnose, treat or prevent migraine.</Muted>
    </>
  );

  return (
    <Screen>
      <Columns left={mixer} right={extras} />
    </Screen>
  );
}

function Row({ icon, title, sub, open, onPress, children }: { icon: IconName; title: string; sub: string; open: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <View style={[styles.card, open && { borderColor: 'rgba(169,199,155,0.35)' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPressIn={tap} onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceStrong }}>
          <Ionicons name={icon} size={19} color={colors.moon} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 16 }}>{title}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{sub}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open && <View style={{ marginTop: 12, gap: 14 }}>{children}</View>}
    </View>
  );
}
