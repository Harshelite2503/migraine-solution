// One optional question after a stop, never while anything plays. On a phone it is a non-modal
// sheet below the lamp (no scrim: the lamp stays tappable, and play dismisses it); on desktop an
// inline card. It leaves by itself after 90 s, closing without writing anything to the journal.
import { useEffect, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { makeMutable } from 'react-native-reanimated';
import { Sheet } from '../../lib/sheet';
import { Card, Chip, Fade, Heading, useWide } from '../../lib/ui';
import { TAB_BAR_SPACE } from './WorseBar';

export type FollowUp = 'better' | 'same' | 'worse' | 'skipped';
const ANSWERS: { value: FollowUp; label: string }[] = [
  { value: 'better', label: 'A bit easier' },
  { value: 'same', label: 'About the same' },
  { value: 'worse', label: 'Worse' },
  { value: 'skipped', label: 'Skip' },
];
const TITLE = 'Optional: how did that go?';
/**
 * At least 236 pt of question; the sheet adds the floating tab bar's space beneath it (the bar draws
 * over that part, so no chip hides under it) and grows with large text rather than clipping.
 */
export const CHECK_IN_HEIGHT = 236;
const AUTO_DISMISS_MS = 90_000;

/**
 * How far the check-in sheet has risen, 0 (away) to 1 (at rest). The tab bar reads this to ease to
 * 0.6 opacity and 0.98 scale as the sheet comes up, so two translucent layers never stack.
 */
export const checkInProgress = makeMutable(0);

export function CheckIn({ open, onAnswer, onDismiss, returnFocusRef, onHeight }: {
  open: boolean;
  /** A tapped answer, including Skip: the room writes it to the journal as today. */
  onAnswer: (follow: FollowUp) => void;
  /** Drag-down, the handle, Escape or the 90 s timeout: close only, nothing written. */
  onDismiss: () => void;
  /** Where screen-reader focus returns when the sheet closes (the lamp). */
  returnFocusRef?: RefObject<unknown>;
  /** The phone sheet's content height, so the room can scroll its controls clear of it. */
  onHeight?: (height: number) => void;
}) {
  const wide = useWide();
  // The Quiet room stays mounted on the other tabs: the sheet is only up while its room is in view, so
  // it neither dims the tab bar nor listens for Escape there. It comes back on return, if still asked.
  const focused = useIsFocused();
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [open, onDismiss]);
  // The sheet writes its own progress (position and fade); this only covers an unmount mid-flight.
  useEffect(() => () => { checkInProgress.set(0); }, []);

  const chips = (
    <View accessibilityRole="radiogroup" accessibilityLabel={TITLE} style={styles.grid}>
      {ANSWERS.map(a => (
        <Chip key={a.value} label={a.label} accessibilityRole="radio" onPress={() => onAnswer(a.value)} style={styles.chip} />
      ))}
    </View>
  );

  if (wide) {
    return (
      <Fade show={open}>
        <Card>
          <Heading>{TITLE}</Heading>
          {chips}
        </Card>
      </Fade>
    );
  }
  return (
    <Sheet open={open && focused} onClose={onDismiss} height={CHECK_IN_HEIGHT} bottomReserve={TAB_BAR_SPACE} scrim={false} title={TITLE}
      // Leaving because the tab changed must not pull screen-reader focus back to a room out of view.
      progress={checkInProgress} returnFocusRef={focused ? returnFocusRef : undefined} onContentHeight={onHeight} testID="check-in">
      {chips}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { flexBasis: '46%', flexGrow: 1, minHeight: 52 },
});
