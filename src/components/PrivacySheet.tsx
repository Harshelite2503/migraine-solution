// The privacy policy as an overlay inside the app (same text as the public /privacy.html page).
import { Modal, ScrollView, Text, View } from 'react-native';
import { PRIVACY_CONTACT, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../legal/privacy.js';
import { Button, H1, H2, Muted, styles } from '../lib/ui';
import { colors } from '../lib/theme';

export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', maxWidth: 640, maxHeight: '92%', backgroundColor: colors.bg, borderRadius: 20, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <H1>Your data stays yours</H1>
            <Muted>Short version: everything stays on your device unless you choose otherwise.</Muted>
            {PRIVACY_SECTIONS.map(([title, lines]) => (
              <View key={title} style={[styles.card, { gap: 8 }]}>
                <H2>{title}</H2>
                {lines.map(l => <Text key={l} style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{l}</Text>)}
              </View>
            ))}
            <Muted small>{`Questions or deletion requests: ${PRIVACY_CONTACT}. Last updated: ${PRIVACY_UPDATED}.`}</Muted>
            <Button kind="primary" label="Close" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
