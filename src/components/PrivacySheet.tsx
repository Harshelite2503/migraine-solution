// The privacy policy as an overlay inside the app (same text as the public /privacy.html page).
// The scrim darkens the whole viewport, so it follows the brightness rule, not the platform fade:
// darker over 900 ms on open, brighter over 700 ms on close (kept under reduced motion).
import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PRIVACY_CONTACT, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../legal/privacy.js';
import { Body, Button, Caption, Heading, Title, styles as ui } from '../lib/ui';
import { colors, radius, space } from '../lib/theme';
import { lum, timing } from '../lib/motion';

export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // The Modal stays up while the scrim lifts, then goes.
  const [mounted, setMounted] = useState(visible);
  const shown = useSharedValue(0);
  const unmount = useCallback(() => setMounted(false), []);
  useEffect(() => {
    cancelAnimation(shown);
    if (visible) { setMounted(true); shown.set(withTiming(1, lum(timing.darker))); return; }
    shown.set(withTiming(0, lum(timing.brighter), finished => { if (finished) scheduleOnRN(unmount); }));
  }, [visible, shown, unmount]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));

  return (
    <Modal visible={mounted} animationType="none" transparent onRequestClose={onClose}>
      <Animated.View style={[styles.scrim, fade]} pointerEvents={visible ? 'auto' : 'none'}>
        <View style={styles.panel} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Title accessibilityRole="header">Your data stays yours</Title>
            <Body color={colors.ink2}>Short version: everything stays on your device unless you choose otherwise.</Body>
            {PRIVACY_SECTIONS.map(([title, lines]) => (
              <View key={title} style={[ui.card, styles.section]}>
                <Heading accessibilityRole="header">{title}</Heading>
                {lines.map(l => <Body key={l} color={colors.ink2}>{l}</Body>)}
              </View>
            ))}
            <Caption>{`Questions or deletion requests: ${PRIVACY_CONTACT}. Last updated: ${PRIVACY_UPDATED}.`}</Caption>
            <Button kind="primary" label="Close" onPress={onClose} />
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: space.l },
  panel: {
    width: '100%', maxWidth: 640, maxHeight: '92%', overflow: 'hidden',
    backgroundColor: colors.night, borderRadius: radius.sheet, borderWidth: 1, borderColor: colors.hairline, borderTopColor: colors.hairlineLit,
  },
  content: { padding: space.xl, gap: space.l },
  section: { gap: space.s },
});
