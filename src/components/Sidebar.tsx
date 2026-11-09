// Desktop-web navigation: a 268 pt translucent sidebar in place of the phone's floating tab bar. Only
// rendered in a wide browser window (see _layout.tsx); phones and tablets never use it.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, space } from '../lib/theme';
import { lum, timing } from '../lib/motion';
import { Caption, Control, Ionicons, Label, Press, Title, useRovingFocus, type IconName } from '../lib/ui';
import { Mark } from './Mark';
import { PrivacySheet } from './PrivacySheet';
import { chromeHidden, Material, NAV_ROUTES, webData } from './TabBar';

const SUB: Record<string, string> = { index: 'Play your sound', journal: 'How it went', tune: 'Dials and textures' };
const ICON: Record<string, IconName> = { index: 'moon-outline', journal: 'book-outline', tune: 'options-outline' };
const filled = (name: IconName) => name.replace(/-outline$/, '') as IconName;

export function Sidebar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const [privacy, setPrivacy] = useState(false);
  const current = state.routes[state.index];
  const routes = state.routes.filter(r => (NAV_ROUTES as readonly string[]).includes(r.name));
  const active = routes.findIndex(r => r.key === current?.key);
  // Dim, Dark screen and setup cover only the tab scene: the sidebar leaves with them, as the phone tab
  // bar does, so it neither glows beside the black nor takes a click that the room would not.
  const hidden = chromeHidden(state, descriptors);
  const roving = useRovingFocus(routes.length, active, { vertical: true, enabled: !hidden });
  const shown = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    cancelAnimation(shown);
    shown.set(withTiming(hidden ? 0 : 1, lum(hidden ? timing.darker : timing.brighter)));
  }, [hidden, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // The web landing is a page of its own: no sidebar beside it.
  if (!current || !(NAV_ROUTES as readonly string[]).includes(current.name)) return null;
  return (
    // Same width while hidden, so the room beside it never shifts.
    <Animated.View style={[styles.side, fade]} pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} aria-hidden={hidden || undefined}>
      <Material />
      <View style={styles.top}>
        <View style={styles.brand}>
          <View style={styles.wordmark}>
            <Mark size={28} />
            <Title style={styles.still} accessibilityRole="none">Still</Title>
          </View>
          <Label>Sound for migraine days</Label>
        </View>
        <View accessibilityRole="tablist" style={styles.rows}>
          {routes.map((route, i) => {
            const { options } = descriptors[route.key];
            const on = route.key === current.key;
            const label = options.title ?? route.name;
            const icon = ICON[route.name] ?? 'ellipse-outline';
            const onPress = () => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!on && !event.defaultPrevented) navigateToTab(route.key);
            };
            return (
              <Press
                key={route.key} accessibilityRole="tab" accessibilityState={{ selected: on }} aria-selected={on} accessibilityLabel={label}
                testID={options.tabBarButtonTestID} haptic={false} onPress={onPress}
                ref={roving.ref(i)} tabIndex={roving.tabIndex(i)} focusable={!hidden} {...roving.onKeyDown(i)}
                style={[styles.row, on && styles.rowOn]} {...(on ? {} : webData({ hover: 'row' }))}
              >
                <Ionicons name={on ? filled(icon) : icon} size={20} color={on ? colors.lamp : colors.ink2} />
                <View style={styles.rowText}>
                  <Control color={on ? colors.ink : colors.ink2}>{label}</Control>
                  {SUB[route.name] ? <Caption>{SUB[route.name]}</Caption> : null}
                </View>
              </Press>
            );
          })}
        </View>
      </View>
      <View style={styles.foot}>
        <Caption>The sound is made in your browser. Nothing you choose leaves it.</Caption>
        <Caption color={colors.ink3}>For comfort, not treatment.</Caption>
        <View style={styles.links}>
          {/* Opens a dialog, so it is a button; react-native-web only activates role="link" on a real anchor. */}
          <Press accessibilityLabel="Privacy" accessibilityHint="Opens the privacy policy" haptic={false} focusable={!hidden} onPress={() => setPrivacy(true)} style={styles.link} {...webData({ hover: 'link' })}>
            <Label style={styles.underline}>Privacy</Label>
          </Press>
          {/* A real anchor on web (href, open in a new tab), routed in place by expo-router. */}
          <Link href="/welcome" asChild>
            <Press accessibilityRole="link" accessibilityLabel="About Still" haptic={false} focusable={!hidden} style={styles.link} {...webData({ hover: 'link' })}>
              <Label style={styles.underline}>About Still</Label>
            </Press>
          </Link>
        </View>
      </View>
      <PrivacySheet visible={privacy} onClose={() => setPrivacy(false)} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  side: {
    width: 268, paddingHorizontal: 22, paddingTop: space.xxl, paddingBottom: 28, justifyContent: 'space-between',
    borderRightWidth: 1, borderRightColor: colors.hairline, overflow: 'hidden',
  },
  top: { gap: space.xxl },
  brand: { gap: space.s, paddingHorizontal: 10 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Title 30: the desktop Title size, pinned so the brand never shrinks with the window.
  still: { fontSize: 30, lineHeight: 36 },
  rows: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.chip },
  rowOn: { backgroundColor: colors.lampGlow },
  rowText: { flex: 1, minWidth: 0 },
  foot: { gap: space.s, paddingHorizontal: 10 },
  links: { flexDirection: 'row', gap: space.l, marginTop: space.xs },
  link: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
