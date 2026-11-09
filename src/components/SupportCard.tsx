// "Support Still": a quiet card that opens the donation page, where a supporter can pay what they
// like and leave a note. The page address comes from EXPO_PUBLIC_DONATE_URL at build time; with
// none set, the card is hidden. App stores have their own rules for payments inside apps, so the
// card shows on the web, and in phone builds only when EXPO_PUBLIC_DONATE_IN_APP=1.
import { Linking, Platform, Text, View } from 'react-native';
import { Button, styles } from '../lib/ui';
import { colors } from '../lib/theme';

const URL = process.env.EXPO_PUBLIC_DONATE_URL || '';
const ALLOWED = URL.startsWith('https://') && (Platform.OS === 'web' || process.env.EXPO_PUBLIC_DONATE_IN_APP === '1');

export function SupportCard() {
  if (!ALLOWED) return null;
  return (
    <View style={[styles.card, { gap: 10 }]}>
      <Text style={{ color: colors.ink, fontSize: 16 }}>Support Still</Text>
      <Text style={{ color: colors.muted, fontSize: 13.5, lineHeight: 20 }}>
        Still is free. If it helped on a hard day, you can give what you like and leave a note for the person who built it.
      </Text>
      <Button kind="outline" label="Give and leave a note" icon="heart-outline" onPress={() => { Linking.openURL(URL).catch(() => {}); }} />
    </View>
  );
}
