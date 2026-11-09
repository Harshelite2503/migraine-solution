// Episodes as a timeline: one hairline rail on the left, a lamp dot per episode whose size follows the
// minutes listened (6 pt for none, 12 pt at an hour), the date in ink and the details beneath in ink2.
// With nothing to show it points back to the quiet room instead of leaving a blank card.
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../../lib/theme';
import { Body, Button, Caption, Label } from '../../lib/ui';

export type TimelineEpisode = {
  key: string;
  /** Already formatted for the person's locale, e.g. "Tue 4 Nov, 9:12 pm". */
  date: string;
  /** What was chosen, how long, how it felt. Empty when nothing is known. */
  details: string;
  /** Minutes of sound listened to this episode; sizes the dot. */
  minutes: number;
  /** The person said it made things worse at least once. */
  worse: boolean;
};

export type TimelineProps = { episodes: TimelineEpisode[] };

const RAIL_X = 6;        // the rail's centre, from the left edge of the list
const DOT_MIN = 6, DOT_MAX = 12;
const GAP = 14;          // between episodes; each rail segment bridges it
const LABEL_LINE = 18;   // Label's line height at 100% text size
const LABEL_MAX_SCALE = 2; // Label's maxFontSizeMultiplier

export const dotSize = (minutes: number) => DOT_MIN + (DOT_MAX - DOT_MIN) * Math.min(Math.max(minutes, 0), 60) / 60;

export function Timeline({ episodes }: TimelineProps) {
  // The dot centres on the date's first line, which grows with Dynamic Type.
  const { fontScale } = useWindowDimensions();
  const mid = (LABEL_LINE * Math.min(Math.max(fontScale || 1, 1), LABEL_MAX_SCALE)) / 2;

  if (episodes.length === 0) {
    return (
      <View style={styles.empty}>
        <Body color={colors.ink2}>Nothing yet. When a headache starts, open the Quiet room.</Body>
        <Button kind="quiet" label="Open the quiet room" onPress={() => router.navigate('/')} style={styles.emptyButton} />
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {episodes.map((e, i) => {
        const d = dotSize(e.minutes);
        const last = i === episodes.length - 1;
        return (
          <View key={e.key} style={styles.item} accessible accessibilityRole="text"
            accessibilityLabel={[e.date, e.details, e.worse ? 'made it worse once' : ''].filter(Boolean).join('. ')}>
            {/* Each segment runs from this dot down to the next one, so the rail ends on the last dot. */}
            {last ? null : <View style={[styles.rail, { top: mid, bottom: -(GAP + mid) }]} />}
            <View style={[styles.dot, { width: d, height: d, borderRadius: d / 2, left: RAIL_X - d / 2, top: mid - d / 2 }]} />
            <Label color={colors.ink}>{e.date}</Label>
            {e.details ? <Caption>{e.details}</Caption> : null}
            {e.worse ? <Caption color={colors.rose}>made it worse once</Caption> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: GAP, paddingVertical: 2 },
  // 1 pt wide, centred on the dots.
  rail: { position: 'absolute', left: RAIL_X - 0.5, width: 1, backgroundColor: colors.hairlineLit },
  item: { paddingLeft: RAIL_X + 18, gap: 2 },
  dot: { position: 'absolute', backgroundColor: colors.lamp },
  empty: { gap: 8 },
  emptyButton: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
