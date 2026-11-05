import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts } from './theme';

export function Button({ label, onPress, kind = 'outline', disabled, style, hint }: {
  label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'quiet'; disabled?: boolean; style?: ViewStyle; hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button" accessibilityHint={hint} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, kind === 'primary' && styles.primary, kind === 'quiet' && styles.quiet, (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 }, style]}
    >
      <Text style={[styles.buttonText, kind === 'primary' && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map(o => (
        <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: o.value === value }} onPress={() => onChange(o.value)}
          style={[styles.segment, o.value === value && styles.segmentOn]}>
          <Text style={[styles.segmentText, o.value === value && { color: colors.ink }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={styles.h1}>{children}</Text>;
export const H2 = ({ children }: { children: React.ReactNode }) => <Text style={styles.h2}>{children}</Text>;
export const Muted = ({ children, small }: { children: React.ReactNode; small?: boolean }) => <Text style={[styles.muted, small && { fontSize: 12 }]}>{children}</Text>;

export const styles = StyleSheet.create({
  screen: { flexGrow: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40, gap: 16 },
  h1: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, marginTop: 8 },
  h2: { color: colors.ink, fontFamily: fonts.display, fontSize: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  button: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center' },
  primary: { backgroundColor: colors.ink, borderColor: colors.ink, paddingVertical: 20 },
  quiet: { borderColor: 'transparent' },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  segmented: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  segmentOn: { backgroundColor: colors.surface, borderColor: colors.muted },
  segmentText: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 18, gap: 6 },
  cardTitle: { color: colors.ink, fontSize: 19, fontWeight: '600' },
});
