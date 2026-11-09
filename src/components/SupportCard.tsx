// "Support Still": a quiet card that opens the donation page, where a supporter can pay what they
// like and leave a note. The page address comes from EXPO_PUBLIC_DONATE_URL at build time; with
// none set, the card is hidden. App stores have their own rules for payments inside apps, so the
// card shows on the web, and in phone builds only when EXPO_PUBLIC_DONATE_IN_APP=1.
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Body, Button, Heading, styles as ui } from '../lib/ui';
import { colors } from '../lib/theme';

const URL = process.env.EXPO_PUBLIC_DONATE_URL || '';
const ALLOWED = URL.startsWith('https://') && (Platform.OS === 'web' || process.env.EXPO_PUBLIC_DONATE_IN_APP === '1');

export function SupportCard() {
  if (!ALLOWED) return null;
  return (
    <View style={[ui.card, styles.card]}>
      <Heading>Support Still</Heading>
      <Body color={colors.ink2}>
        Still is free. If it helped on a hard day, you can give what you like and leave a note for the person who built it.
      </Body>
      <Button kind="smoke" label="Give and leave a note" icon="heart-outline" onPress={() => { Linking.openURL(URL).catch(() => {}); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
