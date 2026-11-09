// My sound → Account (optional) and "Help improve Still" (opt-in sharing). Both are off until the
// person chooses them; Still works fully without either.
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, TextInput, View, type SwitchProps } from 'react-native';
import { PrivacySheet } from './PrivacySheet';
import { supabaseReady } from '../lib/supabase';
import { deleteAccount, isSignedIn, sendLink, signOut, useSession } from '../lib/account';
import { deleteShared, setSharing, sharingOn } from '../lib/sharing';
import { track } from '../lib/activity';
import { Body, Button, Caption, confirmAction, Heading, Label, styles as ui } from '../lib/ui';
import { colors, fonts, radius } from '../lib/theme';

/** Switch colours shared by the cards: a lamp thumb on a lampDeep track when on, quiet smoke when off. */
export function switchColors(on: boolean): Partial<SwitchProps> {
  const web = Platform.OS === 'web' ? { activeThumbColor: colors.lamp } : {}; // react-native-web reads the on-thumb from here
  return { trackColor: { false: colors.smokePressed, true: colors.lampDeep }, ios_backgroundColor: colors.smokePressed, thumbColor: on ? colors.lamp : colors.ink2, ...web };
}

export function AccountCard() {
  if (!supabaseReady) return null;
  return <AccountCardInner />;
}

function AccountCardInner() {
  const session = useSession();
  const signedIn = isSignedIn(session);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const ask = async () => {
    setBusy(true); setNote('');
    const err = await sendLink(email);
    setBusy(false);
    if (err) setNote(err); else { setSent(true); setNote(''); track('sign_in_link_sent'); }
  };
  const remove = () => confirmAction('Delete your account?', 'This deletes your account and everything stored with it on our server. Your sound and journal on this device stay.', 'Delete',
    async () => { setBusy(true); const err = await deleteAccount(); setBusy(false); setNote(err || 'Your account has been deleted.'); });

  return (
    <View style={[ui.card, styles.card]}>
      <Heading>Account (optional)</Heading>
      {signedIn ? (
        <>
          <Body>{`Signed in as ${session!.user.email}`}</Body>
          <Caption>Signed in, you can use the AI review (5 a day).</Caption>
          <View style={styles.pair}>
            <Button label="Sign out" onPress={() => { signOut(); setNote('Signed out.'); }} style={{ flex: 1 }} />
            <Button kind="quiet" label="Delete account" onPress={remove} disabled={busy} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          <Caption>Sign in to use the AI review. No password: we email you a sign-in link.</Caption>
          {!sent ? (
            <>
              <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.ink3} style={styles.input}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" accessibilityLabel="Email" />
              <Button kind="primary" label={busy ? 'Sending…' : 'Email me a sign-in link'} onPress={ask} disabled={busy || !email.trim()} />
            </>
          ) : (
            <>
              <Body>{`We sent a sign-in link to ${email.trim()}. Open it on this device and you're in.`}</Body>
              <Caption>No email after a few minutes? Check spam, or try again.</Caption>
              <Button kind="quiet" label="Use a different email" onPress={() => { setSent(false); setNote(''); }} />
            </>
          )}
        </>
      )}
      {note ? <Label accessibilityLiveRegion="polite">{note}</Label> : null}
    </View>
  );
}

export function SharingCard() {
  if (!supabaseReady) return null;
  return <SharingCardInner />;
}

function SharingCardInner() {
  const [on, setOn] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { sharingOn().then(setOn); }, []);
  const toggle = async (next: boolean) => {
    setOn(next); setNote('');
    const err = await setSharing(next);
    if (err) { setOn(!next); setNote(err); return; }
    track(next ? 'sharing_on' : 'sharing_off');
    setNote(next ? 'Thank you. Sharing is on.' : 'Sharing is off. Nothing more will be sent.');
  };
  const wipe = () => confirmAction('Delete what you have shared?', 'This removes every usage record you have shared with Still.', 'Delete',
    async () => setNote((await deleteShared()) || 'Deleted everything you had shared.'));
  return (
    <View style={[ui.card, styles.card]}>
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Heading>Help improve Still</Heading>
          <Label>Off unless you turn it on</Label>
        </View>
        <Switch value={on} onValueChange={toggle} accessibilityLabel="Share anonymous usage" {...switchColors(on)} />
      </View>
      <Caption>Shares what you play, for how long and how it felt, by day. Never your name, your notes or the time of day. It is used only to improve Still, never for ads, and never sold.</Caption>
      <View style={styles.pair}>
        <Button kind="quiet" label="Delete what I've shared" onPress={wipe} style={{ flex: 1 }} />
        <Button kind="quiet" label="Privacy" onPress={() => setPrivacy(true)} style={{ flex: 1 }} />
      </View>
      {note ? <Label accessibilityLiveRegion="polite">{note}</Label> : null}
      <PrivacySheet visible={privacy} onClose={() => setPrivacy(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  pair: { flexDirection: 'row', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  // 16 px keeps iOS Safari from zooming into the field.
  input: {
    minHeight: 48, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.chip, backgroundColor: colors.smoke,
    paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontFamily: fonts.body, fontSize: 16,
  },
});
