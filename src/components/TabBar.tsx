// The phone and tablet tab bar: a floating smoke bar 12 pt in from the sides and 12 pt above the home
// indicator. Three rooms, a soft lamp pill behind the one you are in. It never pops: when a screen
// hides it (dim, Dark screen, setup) it eases out over 900 ms and back over 700, and when the
// check-in sheet rises it settles back to 0.6 so two translucent layers never read as one.
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { colors, radius, z } from '../lib/theme';
import { cross, lum, spring, timing, useReducedMotion, useReducedTransparency } from '../lib/motion';
import { Label, Press, useRovingFocus } from '../lib/ui';
import { checkInProgress } from './room/CheckIn';

/** The three rooms, in order. Any other route (the web landing) gets no tab and hides the bar. */
export const NAV_ROUTES = ['index', 'journal', 'tune'] as const;
const BAR_HEIGHT = 64;
const INSET = 12;
const PILL_INSET = 6;
const MAX_WIDTH = 520; // the tablet content column, so the bar sits under it

/** True when the focused screen asked for the bar to go (`tabBarStyle: { display: 'none' }`), or is not a room. */
export function chromeHidden(state: BottomTabBarProps['state'], descriptors: BottomTabBarProps['descriptors']): boolean {
  const route = state.routes[state.index];
  if (!route || !(NAV_ROUTES as readonly string[]).includes(route.name)) return true;
  const style = StyleSheet.flatten(descriptors[route.key]?.options.tabBarStyle as ViewStyle | undefined);
  return style?.display === 'none';
}

/**
 * The one material behind the tab bar and the sidebar: a dark blur under the glass tint on iOS and
 * web (expo-blur maps to backdrop-filter there), a solid fill on Android or under reduce transparency.
 */
export function Material() {
  const solid = useReducedTransparency();
  if (solid) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.solid]} />;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} {...webData({ material: 'glass' })}>
      {Platform.OS === 'ios' || Platform.OS === 'web' ? <BlurView tint="dark" intensity={18} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, styles.glass]} />
    </View>
  );
}

/** `data-*` attributes on web (react-native-web's dataSet), for the shell's gated hover and material rules. */
export function webData(data: Record<string, string>): object {
  return Platform.OS === 'web' ? { dataSet: data } : {};
}

export function TabBar(props: BottomTabBarProps) {
  // The web landing is a page of its own: no bar at all, and nothing hidden left in the tab order.
  const current = props.state.routes[props.state.index];
  if (!current || !(NAV_ROUTES as readonly string[]).includes(current.name)) return null;
  return <FloatingBar {...props} />;
}

function FloatingBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const reduced = useReducedMotion();
  const routes = state.routes.filter(r => (NAV_ROUTES as readonly string[]).includes(r.name));
  const active = routes.findIndex(r => r.key === state.routes[state.index]?.key);
  const hidden = chromeHidden(state, descriptors);
  // One Tab stop (the room you are in); arrows move between rooms, as a tablist promises. None while hidden.
  const roving = useRovingFocus(routes.length, active, { enabled: !hidden });

  // Visibility is a brightness change: timing with the luminance curve, never a spring, kept under
  // reduced motion. It starts at 0, so on arrival the bar comes up over 700 ms like everything else.
  const shown = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(shown);
    shown.set(withTiming(hidden ? 0 : 1, lum(hidden ? timing.darker : timing.brighter)));
  }, [hidden, shown]);

  // The pill slides between items on spring.settle; under reduced motion each item fades its own.
  const [itemWidth, setItemWidth] = useState(0);
  const pillX = useSharedValue(0);
  const onRowLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width / Math.max(routes.length, 1);
    setItemWidth(w);
    cancelAnimation(pillX);
    pillX.set(Math.max(active, 0) * w);
  }, [routes.length, active, pillX]);
  useEffect(() => {
    if (!itemWidth || active < 0) return;
    cancelAnimation(pillX);
    pillX.set(withSpring(active * itemWidth, spring.settle));
  }, [active, itemWidth, pillX]);

  const barStyle = useAnimatedStyle(() => {
    const sheet = checkInProgress.get();
    return {
      opacity: shown.get() * (1 - 0.4 * sheet),
      transform: [{ scale: reduced ? 1 : 1 - 0.02 * sheet }],
    };
  });
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillX.get() }] }));

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} aria-hidden={hidden}
      style={[styles.dock, { bottom: insets.bottom + INSET, left: INSET + insets.left, right: INSET + insets.right }]}
    >
      <Animated.View style={[styles.bar, barStyle]}>
        <Material />
        <View accessibilityRole="tablist" style={styles.row} onLayout={onRowLayout}>
          {!reduced && itemWidth > 0 && active >= 0 ? (
            <Animated.View pointerEvents="none" style={[styles.pill, { width: itemWidth - PILL_INSET * 2 }, pillStyle]} />
          ) : null}
          {routes.map((route, i) => {
            const { options } = descriptors[route.key];
            const focused = i === active;
            const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
            const color = focused ? colors.lamp : colors.ink2;
            const onPress = () => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            };
            return (
              <Press
                key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} aria-selected={focused}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? label} testID={options.tabBarButtonTestID}
                // Switching rooms is silent: no buzz while a sound may be playing.
                haptic={false} focusable={!hidden} ref={roving.ref(i)} tabIndex={roving.tabIndex(i)} {...roving.onKeyDown(i)}
                onPress={onPress} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                style={styles.item}
              >
                {reduced ? <FadePill on={focused} /> : null}
                {options.tabBarIcon?.({ focused, color, size: 24 })}
                <Label color={color} style={styles.label} numberOfLines={1}>{label}</Label>
              </Press>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** Reduced motion: the pill does not travel; the old one fades out and the new one fades in, in place. */
function FadePill({ on }: { on: boolean }) {
  const opacity = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(withTiming(on ? 1 : 0, cross(timing.reduced)));
  }, [on, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[styles.fadePill, style]} />;
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', zIndex: z.tabBar, alignItems: 'center' },
  bar: {
    width: '100%', maxWidth: MAX_WIDTH, minHeight: BAR_HEIGHT, borderRadius: radius.card, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.hairline, borderTopColor: colors.hairlineLit,
  },
  solid: { backgroundColor: colors.solid, opacity: 0.96 },
  glass: { backgroundColor: colors.glass },
  row: { flexDirection: 'row', minHeight: BAR_HEIGHT - 2 },
  pill: { position: 'absolute', top: PILL_INSET, bottom: PILL_INSET, left: PILL_INSET, borderRadius: radius.button, backgroundColor: colors.lampGlow },
  fadePill: { position: 'absolute', top: PILL_INSET, bottom: PILL_INSET, left: PILL_INSET, right: PILL_INSET, borderRadius: radius.button, backgroundColor: colors.lampGlow },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8, paddingHorizontal: 4 },
  label: { fontSize: 11.5, lineHeight: 16 },
});
