// Shared UI pieces. Every pressable gives instant feedback (scale + a light haptic tap) on touch
// down, before any slow work starts, so the app always feels responsive.
import type { ReactNode } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius } from './theme';

export type IconName = keyof typeof Ionicons.glyphMap;
export const tap = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
/** Ask before something that can't be undone. Uses the browser's own dialog on the web, where Alert does nothing. */
export function confirmAction(title: string, message: string, okLabel: string, onOk: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${message}`)) onOk(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: okLabel, style: 'destructive', onPress: onOk }]);
}
export const tick = () => { Haptics.selectionAsync().catch(() => {}); };
export { Ionicons };

/**
 * True only in a desktop-width browser window. Phones (and narrow browsers) always get false, so
 * every wide-only layout below leaves the iPhone and Android app exactly as it was.
 */
export function useWide() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 960;
}

/** Two columns side by side on a wide browser window; on phones, `left` then `right`, one column. */
export function Columns({ left, right, rightWidth = 440, gap = 40, align = 'flex-start' }: { left: ReactNode; right: ReactNode; rightWidth?: number; gap?: number; align?: 'flex-start' | 'center' }) {
  const wide = useWide();
  if (!wide) return <>{left}{right}</>;
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: align }}>
      <View style={{ flex: 1, minWidth: 0, gap: 16 }}>{left}</View>
      <View style={{ width: rightWidth, gap: 16 }}>{right}</View>
    </View>
  );
}

export function Screen({ children, scrollRef, overlay, center }: { children: ReactNode; scrollRef?: any; overlay?: ReactNode; center?: boolean }) {
  const wide = useWide();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.bgTop, colors.bgBottom]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView ref={scrollRef} contentContainerStyle={wide ? [styles.screen, styles.screenWide, center && { justifyContent: 'center' }] : styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </SafeAreaView>
      {overlay}
    </View>
  );
}

export function Button({ label, onPress, kind = 'outline', disabled, style, icon, hint }: {
  label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'quiet' | 'warn'; disabled?: boolean; style?: ViewStyle; icon?: IconName; hint?: string;
}) {
  const fg = kind === 'primary' ? colors.bgTop : kind === 'warn' ? colors.warn : colors.ink;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label.replace(/^[^A-Za-z0-9]+/, '')} accessibilityHint={hint} accessibilityState={{ disabled }} disabled={disabled}
      onPressIn={tap} onPress={onPress}
      style={({ pressed }) => [styles.button, kind === 'primary' && styles.primary, kind === 'quiet' && styles.quiet, kind === 'warn' && styles.warnBtn,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }, disabled && { opacity: 0.38 }, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: on }} onPressIn={tick} onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.segment, on && styles.segmentOn, pressed && { opacity: 0.8 }]}>
            {o.icon ? <Ionicons name={o.icon} size={16} color={on ? colors.ink : colors.muted} /> : null}
            <Text numberOfLines={1} style={[styles.segmentText, on && { color: colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: boolean }) {
  return <View style={[styles.card, accent && { borderColor: colors.accentDeep }, style]}>{children}</View>;
}

export const H1 = ({ children }: { children: ReactNode }) => <Text style={styles.h1}>{children}</Text>;
export const H2 = ({ children }: { children: ReactNode }) => <Text style={styles.h2}>{children}</Text>;
export const Eyebrow = ({ children }: { children: ReactNode }) => <Text style={styles.eyebrow}>{children}</Text>;
export const Muted = ({ children, small }: { children: ReactNode; small?: boolean }) => <Text style={[styles.muted, small && { fontSize: 12.5, lineHeight: 18 }]}>{children}</Text>;

export const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 48, gap: 16 },
  screenWide: { width: '100%', maxWidth: 1160, alignSelf: 'center', paddingHorizontal: 56, paddingTop: 48, paddingBottom: 72, gap: 20 },
  h1: { color: colors.ink, fontFamily: fonts.display, fontSize: 34, letterSpacing: -0.5, marginTop: 6 },
  h2: { color: colors.ink, fontFamily: fonts.display, fontSize: 21 },
  eyebrow: { color: colors.muted, fontSize: 11.5, letterSpacing: 1.6, textTransform: 'uppercase' },
  muted: { color: colors.muted, fontSize: 14.5, lineHeight: 21 },
  button: { flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: radius.button, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, paddingVertical: 18 },
  quiet: { borderColor: 'transparent', backgroundColor: 'transparent' },
  warnBtn: { borderColor: 'rgba(227,155,131,0.35)', backgroundColor: 'rgba(227,155,131,0.06)' },
  buttonText: { fontSize: 15.5, fontWeight: '600' },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surfaceStrong, borderColor: 'rgba(169,199,155,0.45)' },
  segmentText: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 18, gap: 8 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '600' },
});
