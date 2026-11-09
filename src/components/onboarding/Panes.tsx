// The four onboarding panes. Each is a plain column that fills the stage; the shell (Onboarding.tsx)
// owns the step, the preview and the cross-fade between panes. Copy here is the spec's, word for word.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Profile } from '../../lib/profile';
import { colors, space } from '../../lib/theme';
import { Body, Button, Display, Eyebrow, Tile, Title, type IconName } from '../../lib/ui';
import { Mark } from '../Mark';
import { PreviewButton, ProfileDial, TextureTiles, usePreview, type Hardest, type Texture } from '../Studio';

export type Preview = ReturnType<typeof usePreview>;

/** The first-run question: which sounds are hardest during a headache. One tap. */
export const HARDEST: { value: Hardest; label: string; sub: string; icon: IconName }[] = [
  { value: 'high', label: 'Hiss and high sounds', sub: 'Kettles, static, squeaks', icon: 'sparkles-outline' },
  { value: 'low', label: 'Low rumble', sub: 'Traffic, fridges, engines', icon: 'pulse-outline' },
  { value: 'sudden', label: 'Sudden noises', sub: 'Doors, alerts, dropped things', icon: 'flash-outline' },
  { value: 'unsure', label: 'Not sure', sub: 'Start with something gentle', icon: 'ellipse-outline' },
];

/** Eyebrow, Title and one Body line, shared by panes 1 to 3. */
export function PaneHeader({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <View style={styles.header}>
      <Eyebrow>{kicker}</Eyebrow>
      <Title>{title}</Title>
      <Body color={colors.ink2}>{sub}</Body>
    </View>
  );
}

/** Actions sit at the foot of the pane so the thumb finds them in the same place on every step. */
function Foot({ children }: { children: ReactNode }) {
  return <View style={styles.foot}>{children}</View>;
}

// Pane 0: the mark, the name, one sentence, and the primary whose label the deploy workflow greps for (it appears nowhere else).
export function WelcomePane({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <View style={styles.pane}>
      <View style={styles.welcome}>
        <Mark size={56} />
        <Display center>Still</Display>
        <Body center color={colors.ink2} style={styles.welcomeBody}>A soft sound for migraine days. Made on your phone, just for you.</Body>
      </View>
      <Foot>
        <Button kind="primary" label="Make my sound" onPress={onStart} />
        <Button kind="quiet" label="Just play a gentle sound" onPress={onSkip} />
      </Foot>
    </View>
  );
}

// Pane 1: one question, four wide tiles. Choosing advances by itself; Continue is the no-pick path.
export function HardestPane({ value, onPick, onContinue }: { value: Hardest | null; onPick: (h: Hardest) => void; onContinue: () => void }) {
  return (
    <View style={styles.pane}>
      <PaneHeader kicker="1 of 3" title="What's hardest on your ears?" sub="During a headache. Pick one." />
      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="What's hardest on your ears">
        {HARDEST.map(h => (
          <Tile key={h.value} wide icon={h.icon} label={h.label} sub={h.sub} on={value === h.value} onPress={() => onPick(h.value)} />
        ))}
      </View>
      <Foot>
        <Button kind="primary" label="Continue" onPress={onContinue} />
      </Foot>
    </View>
  );
}

// Pane 2: the texture, chosen by ear. The first tap starts the preview; the room behind follows.
// Listen is the compact pill here (§7.2): the 112 pt round control is My sound's, and these panes are tight at 375 × 667.
export function TexturePane({ profile, preview, onPick, onContinue }: {
  profile: Profile; preview: Preview; onPick: (t: Texture) => void; onContinue: () => void;
}) {
  return (
    <View style={styles.pane}>
      <PaneHeader kicker="2 of 3" title="Pick what feels restful" sub="Tap one to hear it. Use headphones if you can." />
      <TextureTiles value={profile.intake.texture} onPick={onPick} />
      <PreviewButton compact on={preview.on} busy={preview.busy} onPress={() => preview.toggle(profile)} />
      <Foot>
        <Button kind="primary" label="Continue" onPress={onContinue} />
      </Foot>
    </View>
  );
}

// Pane 3: one dial, then save.
export function DialPane({ profile, preview, onChange, onSave }: {
  profile: Profile; preview: Preview; onChange: (p: Profile) => void; onSave: () => void;
}) {
  return (
    <View style={styles.pane}>
      <PaneHeader kicker="3 of 3" title="Turn it to taste" sub="Drag the dial, or tap it. Deeper is usually calmer." />
      <View style={styles.dial}>
        <ProfileDial which="tone" profile={profile} onChange={onChange} size={176} />
        <PreviewButton compact on={preview.on} busy={preview.busy} onPress={() => preview.toggle(profile)} />
      </View>
      <Foot>
        <Button kind="primary" label="Save my sound" onPress={onSave} />
      </Foot>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, gap: space.l, paddingTop: space.l },
  header: { gap: 6, alignSelf: 'stretch' },
  welcome: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xl, paddingVertical: space.xl },
  welcomeBody: { maxWidth: 320 },
  tiles: { gap: space.m },
  dial: { alignItems: 'center', gap: space.xl, paddingTop: space.s },
  foot: { marginTop: 'auto', gap: 6, paddingTop: space.s },
});
