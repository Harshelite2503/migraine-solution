// My sound → Account (optional) and "Help improve Still" (opt-in sharing). Both are off until the
// person chooses them; Still works fully without either.
import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { PrivacySheet } from './PrivacySheet';
import { supabaseReady } from '../lib/supabase';
import { deleteAccount, isSignedIn, sendCode, signOut, useSession, verifyCode } from '../lib/account';
import { deleteShared, setSharing, sharingOn } from '../lib/sharing';
import { track } from '../lib/activity';
import { Button, confirmAction, H2, Muted, styles } from '../lib/ui';
import { colors } from '../lib/theme';

const input = { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, color: colors.ink, fontSize: 15 } as const;

export function AccountCard() {
  if (!supabaseReady) return null;
  return <AccountCardInner />;
}

function AccountCardInner() {
  const session = useSession();
  const signedIn = isSignedIn(session);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const ask = async () => {
    setBusy(true); setNote('');
    const err = await sendCode(email);
    setBusy(false);
    if (err) setNote(err); else { setSent(true); setNote(`We sent a 6-digit code to ${email.trim()}.`); }
  };
  const confirm = async () => {
    setBusy(true); setNote('');
    const err = await verifyCode(email, code);
    setBusy(false);
    if (err) setNote(err); else { setSent(false); setCode(''); setNote('Signed in.'); track('sign_in'); }
  };
  const remove = () => confirmAction('Delete your account?', 'This deletes your account and everything stored with it on our server. Your sound and journal on this device stay.', 'Delete',
    async () => { setBusy(true); const err = await deleteAccount(); setBusy(false); setNote(err || 'Your account has been deleted.'); });

  return (
    <View style={[styles.card, { gap: 10 }]}>
      <H2>Account (optional)</H2>
      {signedIn ? (
        <>
          <Text style={{ color: colors.ink, fontSize: 14 }}>{`Signed in as ${session!.user.email}`}</Text>
          <Muted small>Signed in, you can use the AI review (5 a day).</Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Sign out" onPress={() => { signOut(); setNote('Signed out.'); }} style={{ flex: 1 }} />
            <Button kind="quiet" label="Delete account" onPress={remove} disabled={busy} style={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          <Muted small>Sign in to use the AI review. No password: we email you a 6-digit code.</Muted>
          {!sent ? (
            <>
              <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} style={input}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" accessibilityLabel="Email" />
              <Button kind="primary" label={busy ? 'Sending…' : 'Email me a code'} onPress={ask} disabled={busy || !email.trim()} />
            </>
          ) : (
            <>
              <TextInput value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 8))} placeholder="6-digit code" placeholderTextColor={colors.muted} style={input}
                keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" accessibilityLabel="Code from the email" />
              <Button kind="primary" label={busy ? 'Checking…' : 'Sign in'} onPress={confirm} disabled={busy || code.length < 6} />
              <Button kind="quiet" label="Use a different email" onPress={() => { setSent(false); setCode(''); setNote(''); }} />
            </>
          )}
        </>
      )}
      {note ? <Text style={{ color: colors.muted, fontSize: 13 }}>{note}</Text> : null}
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
    <View style={[styles.card, { gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <H2>Help improve Still</H2>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Off unless you turn it on</Text>
        </View>
        <Switch value={on} onValueChange={toggle} accessibilityLabel="Share anonymous usage" />
      </View>
      <Muted small>Shares what you play, for how long and how it felt, by day. Never your name, your notes or the time of day. It is used only to improve Still, never for ads, and never sold.</Muted>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind="quiet" label="Delete what I've shared" onPress={wipe} style={{ flex: 1 }} />
        <Button kind="quiet" label="Privacy" onPress={() => setPrivacy(true)} style={{ flex: 1 }} />
      </View>
      {note ? <Text style={{ color: colors.muted, fontSize: 13 }}>{note}</Text> : null}
      <PrivacySheet visible={privacy} onClose={() => setPrivacy(false)} />
    </View>
  );
}
