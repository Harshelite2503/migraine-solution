// One journal number in a smoke tile: a 44 pt tabular Numeral over a Caption. Nothing to show reads
// as an em dash rather than a zero, so an empty journal looks quiet instead of like a failing score.
import { StyleSheet, View } from 'react-native';
import { Caption, Numeral, styles as ui } from '../../lib/ui';

export type StatProps = {
  /** The number. `null` / `undefined` is "nothing yet" and draws an em dash. */
  value: number | string | null | undefined;
  /** What the number counts, e.g. "hard days with Still". */
  label: string;
};

const EMPTY = '—';

export function Stat({ value, label }: StatProps) {
  const empty = value === null || value === undefined || value === '';
  const text = empty ? EMPTY : String(value);
  return (
    <View style={[ui.card, styles.tile]} accessible accessibilityRole="text" accessibilityLabel={empty ? `${label}: nothing yet` : `${text} ${label}`}>
      <Numeral>{text}</Numeral>
      <Caption>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  // Two to a row on phones; the row wraps to one per line under large type.
  tile: { flexBasis: '47%', flexGrow: 1, minWidth: 140, gap: 4 },
});
