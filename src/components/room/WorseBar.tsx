// "This is making it worse", pinned above the tab bar while sound plays so it is one tap at any
// scroll offset. Phone only; the desktop column renders the same rose button inline.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, z } from '../../lib/theme';
import { Button, Control, Fade, Ionicons, styles as ui, useGutter } from '../../lib/ui';

/** How much the ScrollView's bottom padding grows while the bar is up, so nothing hides behind it. */
export const WORSE_BAR_PAD = 64;
/** The floating tab bar: 64 pt tall, 12 pt above the home indicator. Anything pinned to the bottom clears it. */
export const TAB_BAR_SPACE = 76;
// 12 more keeps a gap between the bar and the tab bar.
const TAB_BAR_CLEARANCE = TAB_BAR_SPACE + 12;
const COLUMN_MAX = 520;

export function WorseBar({ show, onPress, ghost }: {
  show: boolean;
  onPress: () => void;
  /** A non-interactive copy for the dim veil: same place, no fade, no touches. */
  ghost?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const gutter = useGutter();
  const frame = [styles.pin, { bottom: insets.bottom + TAB_BAR_CLEARANCE, paddingHorizontal: gutter }];
  // The ghost is a picture of the button, not a button: nothing under the veil can take focus or a press.
  if (ghost) {
    return (
      <View pointerEvents="none" style={frame}>
        <View style={[styles.column, ui.button, ui.rose]}>
          <Ionicons name="hand-left-outline" size={18} color={colors.rose} />
          <Control color={colors.ink2} center>This is making it worse</Control>
        </View>
      </View>
    );
  }
  return (
    <Fade show={show} pointerEvents={show ? 'box-none' : 'none'} style={frame}>
      <View style={styles.column}>
        {/* A stop press: it still buzzes while sound plays. */}
        <Button kind="rose" label="This is making it worse" icon="hand-left-outline" onPress={onPress} haptic="always" hint="Stops the sound and makes the next one start quieter" />
      </View>
    </Fade>
  );
}

const styles = StyleSheet.create({
  pin: { position: 'absolute', left: 0, right: 0, zIndex: z.worseBar, alignItems: 'center' },
  column: { width: '100%', maxWidth: COLUMN_MAX },
});
