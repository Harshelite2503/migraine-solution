// Shared primitives. One material (smoke), one accent (the lamp), two type families. Every pressable
// answers on touch-down with a light haptic and a 0.97 scale, before any slow work starts, so the app
// always feels like it heard you. Brightness never springs; small text cross-fades.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View,
  type AccessibilityRole, type LayoutChangeEvent, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, radius, z, type Depth, type SceneTexture } from './theme';
import { fonts, useAppFonts } from './fonts';
import { cross, ease, spring, timing, useReducedMotion, useReducedTransparency } from './motion';
import { Scene } from '../components/Scene';

export type IconName = keyof typeof Ionicons.glyphMap;
// Nothing buzzes while sound plays except the stop and worse presses. The Quiet room mutes haptics for
// as long as its sound plays (on every tab, since the sound keeps going); those presses use 'always'.
let hapticsMuted = false;
export const muteHaptics = (muted: boolean) => { hapticsMuted = muted; };
const light = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const tap = () => { if (!hapticsMuted) light(); };
export const tick = () => { if (!hapticsMuted) Haptics.selectionAsync().catch(() => {}); };
/** The ` -outline` glyph's filled twin, so a selected state never rests on colour alone. */
export const filledIcon = (name: IconName) => name.replace(/-outline$/, '') as IconName;
/** Ask before something that can't be undone. Uses the browser's own dialog on the web, where Alert does nothing. */
export function confirmAction(title: string, message: string, okLabel: string, onOk: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${message}`)) onOk(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: okLabel, style: 'destructive', onPress: onOk }]);
}
export { Ionicons };

// ---------------------------------------------------------------------------------------------
// Layout hooks

/** True only in a desktop-width browser window (>= 960). Phones and narrow browsers get false. */
export function useWide() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 960;
}
/** True from 768 pt up, on any platform: one column still, but bigger lamp, dials and tiles. */
export function useTablet() {
  const { width } = useWindowDimensions();
  return width >= 768;
}
/**
 * The smoke material, or a solid fill when transparency is reduced (always on Android). Spread after
 * the base style: `[styles.chip, material.fill, on && styles.selected, on && material.selected]`.
 */
export function useMaterial(): { fill: ViewStyle | null; selected: ViewStyle | null } {
  const solid = useReducedTransparency();
  return solid ? solidMaterial : clearMaterial;
}
const solidMaterial = { fill: { backgroundColor: colors.solid }, selected: { backgroundColor: colors.solid } };
const clearMaterial = { fill: null, selected: null };

/** Something `.focus()` can be called on: the DOM node on web. */
type FocusTarget = { focus?: () => void } | null;

/**
 * Roving focus for a tablist on web: one Tab stop (the active item); arrows, Home and End move focus
 * to the neighbouring item without activating it. Native keeps its own focus order.
 */
export function useRovingFocus(count: number, active: number, { vertical = false, enabled = true }: { vertical?: boolean; enabled?: boolean } = {}) {
  const refs = useRef<FocusTarget[]>([]);
  const web = Platform.OS === 'web';
  const home = Math.max(0, Math.min(active, count - 1));
  return {
    ref: (i: number) => (el: unknown) => { refs.current[i] = el as FocusTarget; },
    tabIndex: (i: number): 0 | -1 | undefined => (!web ? undefined : enabled && i === home ? 0 : -1),
    // Spread onto a Press: `{...roving.onKeyDown(i)}`. Typed loosely, as React Native's key event type has no `key`.
    onKeyDown: (i: number): object | null => (web ? { onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      const next = (vertical ? e.key === 'ArrowDown' : e.key === 'ArrowRight') ? (i + 1) % count
        : (vertical ? e.key === 'ArrowUp' : e.key === 'ArrowLeft') ? (i - 1 + count) % count
        : e.key === 'Home' ? 0 : e.key === 'End' ? count - 1 : null;
      if (next == null) return;
      e.preventDefault();
      refs.current[next]?.focus?.();
    } } : null),
  };
}

/** The horizontal page gutter: 20 on phones, 32 at 768, 56 on desktop. */
export function useGutter() {
  const wide = useWide(), tablet = useTablet();
  return wide ? 56 : tablet ? 32 : 20;
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

// ---------------------------------------------------------------------------------------------
// Type. Ten roles, two families. Sizes step up on desktop for the three largest roles only.

export type TypeProps = Omit<TextProps, 'style'> & { children?: ReactNode; color?: string; center?: boolean; style?: StyleProp<TextStyle> };

function typeRole(name: string, pick: (wide: boolean) => TextStyle, max: number, level?: 1 | 2) {
  // Display and Title are the screen's H1, Heading an H2: a heading for VoiceOver's rotor and an <h1>/<h2> on web.
  const heading = level ? { accessibilityRole: 'header' as const, ...(Platform.OS === 'web' ? { 'aria-level': level } : null) } : null;
  function Role({ children, color, center, style, ...rest }: TypeProps) {
    const wide = useWide();
    return (
      <Text allowFontScaling maxFontSizeMultiplier={max} {...heading} {...rest} style={[pick(wide), color ? { color } : null, center ? styles.center : null, style]}>{children}</Text>
    );
  }
  Role.displayName = name;
  return Role;
}

export const Display = typeRole('Display', wide => (wide ? styles.displayWide : styles.display), 1.6, 1);
export const Title = typeRole('Title', wide => (wide ? styles.titleWide : styles.title), 1.6, 1);
export const Greeting = typeRole('Greeting', wide => (wide ? styles.greetingWide : styles.greeting), 1.6);
export const Heading = typeRole('Heading', () => styles.heading, 2.0, 2);
export const Numeral = typeRole('Numeral', () => styles.numeral, 1.6);
export const Body = typeRole('Body', () => styles.body, 2.0);
export const Control = typeRole('Control', () => styles.control, 2.0);
export const Label = typeRole('Label', () => styles.label, 2.0);
export const Caption = typeRole('Caption', () => styles.caption, 2.0);
export const Eyebrow = typeRole('Eyebrow', () => styles.eyebrow, 2.0);

// Thin aliases for the untouched screens: H1 -> Title, H2 -> Heading, Muted -> Body in ink2, Muted small -> Caption in ink3.
export const H1 = Title;
export const H2 = Heading;
export const Muted = ({ small, color, ...rest }: TypeProps & { small?: boolean }) =>
  small ? <Caption color={color ?? colors.ink3} {...rest} /> : <Body color={color ?? colors.ink2} {...rest} />;

// ---------------------------------------------------------------------------------------------
// Fade: mount at 0, cross in; cross out, then unmount. The reduced-motion form of every entrance.

export function Fade({ show = true, children, style, inMs = timing.crossfadeIn, outMs = timing.crossfadeOut, keepMounted = false, pointerEvents }: {
  show?: boolean; children?: ReactNode; style?: StyleProp<ViewStyle>; inMs?: number; outMs?: number; keepMounted?: boolean; pointerEvents?: 'auto' | 'none' | 'box-none';
}) {
  const [mounted, setMounted] = useState(show);
  const opacity = useSharedValue(show ? 1 : 0);
  const unmount = useCallback(() => setMounted(false), []);
  useEffect(() => {
    cancelAnimation(opacity);
    if (show) { setMounted(true); opacity.set(withTiming(1, { duration: inMs, easing: ease.enter })); return; }
    opacity.set(withTiming(0, { duration: outMs, easing: ease.exit }, finished => { if (finished && !keepMounted) scheduleOnRN(unmount); }));
  }, [show, inMs, outMs, keepMounted, opacity, unmount]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  if (!mounted && !keepMounted) return null;
  return <Animated.View pointerEvents={pointerEvents ?? (show ? 'auto' : 'none')} style={[style, animated]}>{children}</Animated.View>;
}

// ---------------------------------------------------------------------------------------------
// Press: the base pressable. Haptic + 0.97 scale on touch-down, a focus ring for keyboards on web,
// and a 44 pt hit area even when the visual is smaller.

// Web only: remember whether the last input was a keyboard, so the ring shows for Tab, not for clicks.
let keyboardModality = false;
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') keyboardModality = true; }, true);
  document.addEventListener('pointerdown', () => { keyboardModality = false; }, true);
}
const focusRing = Platform.OS === 'web' ? ({ outlineStyle: 'solid', outlineWidth: 2, outlineColor: colors.focusRing, outlineOffset: 3 } as unknown as ViewStyle) : null;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Light impact on touch-down by default; `tick` for selection controls; `false` for things that must
   * stay silent; `always` for the stop and worse presses, which still buzz while sound plays.
   */
  haptic?: 'tap' | 'tick' | 'always' | false;
  /** Touch-down scale. 0.97 by default. */
  scaleTo?: number;
  /**
   * A large lit surface (the lamp, the Listen disc). Under reduced motion it gets no opacity dip: a
   * 200 ms dim and re-brighten of the brightest thing on screen breaks the 700 ms brightening rule.
   */
  largeSurface?: boolean;
  /** Minimum hit size; hitSlop is added when the laid-out visual is smaller. */
  minHit?: number;
  /** The pressable itself (the DOM node on web), e.g. to move focus to it. */
  ref?: Ref<unknown>;
};

const web = Platform.OS === 'web';
// Roles whose Space key react-native-web does not turn into a press (it only does that for buttons).
const SPACE_ROLES = new Set(['radio', 'tab', 'checkbox', 'switch']);
type KeyEvent = { key: string; repeat?: boolean; nativeEvent?: { repeat?: boolean }; preventDefault: () => void };

/**
 * react-native-web 0.21 ignores the `accessibilityState` object, so its states reach the DOM only as
 * aria-* props. Each state goes only where ARIA allows it (a selected button is a pressed toggle).
 */
function ariaFor(role: string, st: PressableProps['accessibilityState']): object | null {
  if (!web || !st) return null;
  const aria: Record<string, boolean> = {};
  if (st.checked !== undefined && st.checked !== 'mixed' && SPACE_ROLES.has(role)) aria['aria-checked'] = !!st.checked;
  if (st.selected !== undefined) aria[role === 'button' ? 'aria-pressed' : 'aria-selected'] = st.selected;
  if (st.expanded !== undefined) aria['aria-expanded'] = st.expanded;
  if (st.disabled) aria['aria-disabled'] = true;
  if (st.busy) aria['aria-busy'] = true;
  return aria;
}

export function Press({ children, style, haptic = 'tap', scaleTo = 0.97, largeSurface = false, minHit = 44, onPressIn, onPressOut, onFocus, onBlur, onLayout, hitSlop, disabled, accessibilityRole = 'button', ref, ...rest }: PressProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const dim = useSharedValue(1);
  const [focused, setFocused] = useState(false);
  const [slop, setSlop] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const hintId = useId();
  const { onKeyDown: callerKeyDown, ...pressable } = rest as typeof rest & { onKeyDown?: (e: KeyEvent) => void };
  const { onPress, accessibilityHint, accessibilityState, focusable, tabIndex } = pressable;

  const down = useCallback((e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
    if (haptic === 'always') light(); else if (haptic === 'tap') tap(); else if (haptic === 'tick') tick();
    cancelAnimation(scale); cancelAnimation(dim);
    if (reduced) { if (!largeSurface) dim.set(withTiming(0.8, { duration: timing.reduced, easing: ease.enter })); }
    else scale.set(withSpring(scaleTo, spring.press));
    onPressIn?.(e);
  }, [haptic, reduced, largeSurface, scaleTo, scale, dim, onPressIn]);
  const up = useCallback((e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
    cancelAnimation(scale); cancelAnimation(dim);
    if (reduced) { if (!largeSurface) dim.set(withTiming(1, { duration: timing.reduced, easing: ease.enter })); }
    else scale.set(withSpring(1, spring.press));
    onPressOut?.(e);
  }, [reduced, largeSurface, scale, dim, onPressOut]);
  const measured = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const v = Math.max(0, (minHit - width) / 2), h = Math.max(0, (minHit - height) / 2);
    setSlop(v > 0 || h > 0 ? { left: v, right: v, top: h, bottom: h } : null);
    onLayout?.(e);
  }, [minHit, onLayout]);

  // The animated style comes last in the array, so it carries the style's own opacity (0.38 when
  // disabled) rather than overriding it with the press dim's resting 1.
  const restOpacity = Number(StyleSheet.flatten(style)?.opacity ?? 1);
  const animated = useAnimatedStyle(() => ({ opacity: dim.get() * restOpacity, transform: [{ scale: scale.get() }] }));
  const ring = focused && keyboardModality ? focusRing : null;

  // Web keyboard parity: Space activates radios and tabs as it does buttons; focusable={false} must win
  // over the Pressable's own tabIndex 0; and the hint, which react-native-web drops, becomes a description.
  const keyDown = web ? (e: KeyEvent) => {
    if (SPACE_ROLES.has(accessibilityRole) && (e.key === ' ' || e.key === 'Spacebar') && !disabled) {
      e.preventDefault();
      if (!e.repeat && !e.nativeEvent?.repeat) onPress?.(e as unknown as Parameters<NonNullable<PressableProps['onPress']>>[0]);
    }
    callerKeyDown?.(e);
  } : callerKeyDown;
  const webTabIndex = web && focusable === false && tabIndex === undefined ? -1 : tabIndex;
  const hint = web && accessibilityHint ? hintId : null;
  return (
    <AnimatedPressable
      ref={ref as never}
      accessibilityRole={accessibilityRole} disabled={disabled} hitSlop={hitSlop ?? slop ?? undefined}
      onPressIn={down} onPressOut={up} onLayout={measured}
      onFocus={e => { setFocused(true); onFocus?.(e); }} onBlur={e => { setFocused(false); onBlur?.(e); }}
      {...ariaFor(accessibilityRole, accessibilityState)}
      {...(hint ? { 'aria-describedby': hint } : null)}
      {...pressable}
      {...(keyDown ? ({ onKeyDown: keyDown } as object) : null)}
      tabIndex={webTabIndex}
      style={[style, ring, animated]}
    >
      {children}
      {/* Referenced by aria-describedby; display none keeps it out of the name and the layout. */}
      {hint ? <Text nativeID={hint} style={styles.hidden}>{accessibilityHint}</Text> : null}
    </AnimatedPressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Button. Four kinds; the two old names still compile (outline -> smoke, warn -> rose).

export type ButtonKind = 'primary' | 'smoke' | 'quiet' | 'rose' | 'outline' | 'warn';

export function Button({ label, onPress, kind = 'smoke', disabled, style, icon, hint, sub, on, testID, accessibilityLabel, haptic }: {
  label: string; onPress: () => void; kind?: ButtonKind; disabled?: boolean; style?: StyleProp<ViewStyle>; icon?: IconName; hint?: string;
  /** A second, smaller line (Label in ink2) under the label, e.g. "Silence" under "Dark screen". */
  sub?: string;
  /** Selected look (lampDeep border, lamp glyph) without being a radio, e.g. Softer while it plays. */
  on?: boolean;
  testID?: string; accessibilityLabel?: string;
  /** Passed to Press: `always` for a stop or worse press, which still buzzes while sound plays. */
  haptic?: PressProps['haptic'];
}) {
  const material = useMaterial();
  const k: 'primary' | 'smoke' | 'quiet' | 'rose' = kind === 'outline' ? 'smoke' : kind === 'warn' ? 'rose' : kind;
  const fg = k === 'primary' ? colors.onLamp : k === 'smoke' ? colors.ink : colors.ink2;
  const glyph = k === 'primary' ? colors.onLamp : k === 'rose' ? colors.rose : on ? colors.lamp : colors.ink2;
  return (
    <Press
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label.replace(/^[^A-Za-z0-9]+/, '')} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} testID={testID} haptic={haptic}
      style={[styles.button, k === 'primary' && styles.primary, k === 'smoke' && styles.smoke, k === 'quiet' && styles.quiet, k === 'rose' && styles.rose,
        (k === 'smoke' || k === 'rose') && material.fill, on && { borderColor: colors.lampDeep }, sub ? styles.buttonWithSub : null, disabled && styles.disabled, style]}
    >
      {icon ? <Ionicons name={icon} size={sub ? 20 : 18} color={glyph} /> : null}
      {sub ? (
        <View style={styles.buttonLines}>
          <Control color={fg}>{label}</Control>
          <Label>{sub}</Label>
        </View>
      ) : <Control color={fg} center>{label}</Control>}
    </Press>
  );
}

// ---------------------------------------------------------------------------------------------
// Segmented: a 48 pt radiogroup that commits on tap. On web it is one Tab stop (the checked segment);
// arrow keys move the selection and the focus together, as a native radio group does.

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void;
  /** Group name for assistive tech, e.g. "Loudness". */
  label?: string;
}) {
  const material = useMaterial();
  // At large Dynamic Type the three labels no longer fit side by side: the segments stack, full width.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const refs = useRef<FocusTarget[]>([]);
  const checked = Math.max(0, options.findIndex(o => o.value === value));
  const step = (dir: 1 | -1 | 'first' | 'last') => {
    const i = options.findIndex(o => o.value === value);
    const n = dir === 'first' ? 0 : dir === 'last' ? options.length - 1 : (i + dir + options.length) % options.length;
    const next = options[n]; if (next && next.value !== value) { tick(); onChange(next.value); }
    refs.current[n]?.focus?.();
  };
  const keys = Platform.OS === 'web' ? { onKeyDown: (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); step('first'); }
    else if (e.key === 'End') { e.preventDefault(); step('last'); }
  } } : null;
  return (
    <View style={[styles.segmented, stacked && styles.segmentedStacked]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Press key={o.value} ref={(el: unknown) => { refs.current[i] = el as FocusTarget; }} tabIndex={web ? (i === checked ? 0 : -1) : undefined}
            haptic="tick" accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: on }}
            onPress={() => { if (!on) onChange(o.value); }} {...(keys as object)}
            style={[styles.segment, stacked && styles.segmentStacked, material.fill, on && styles.segmentOn, on && material.selected]}>
            {/* Selected pairs the colour with a border and the filled glyph. */}
            {o.icon ? <Ionicons name={on ? filledIcon(o.icon) : o.icon} size={16} color={on ? colors.lamp : colors.ink2} /> : null}
            <Label color={on ? colors.lamp : colors.ink2} style={styles.segmentLabel}>{o.label}</Label>
          </Press>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Chip: a 48 pt material pill-ish button (radius 14). `on` gives the selected look.

export function Chip({ label, onPress, on, icon, disabled, style, hint, accessibilityRole = 'button', testID, fit }: {
  label: string; onPress: () => void; on?: boolean; icon?: IconName; disabled?: boolean; style?: StyleProp<ViewStyle>; hint?: string;
  /** Keep the label on one line in a tight row: it shrinks a little on phones, and is set a size down on the web. */
  fit?: boolean;
  /** `radio` for a pick-one group (the check-in chips); the state then carries `checked`. */
  accessibilityRole?: 'button' | 'radio'; testID?: string;
}) {
  const material = useMaterial();
  return (
    <Press accessibilityRole={accessibilityRole} accessibilityLabel={label} accessibilityHint={hint} testID={testID}
      // A plain action chip has no selected state to announce; only a toggle (`on` given) or a radio does.
      accessibilityState={accessibilityRole === 'radio' ? { checked: !!on, disabled: !!disabled } : on === undefined ? { disabled: !!disabled } : { selected: on, disabled: !!disabled }}
      haptic={accessibilityRole === 'radio' ? 'tick' : 'tap'} disabled={disabled} onPress={onPress}
      style={[styles.chip, material.fill, on && styles.selected, on && material.selected, disabled && styles.disabled, style]}>
      {icon ? <Ionicons name={on ? filledIcon(icon) : icon} size={16} color={on ? colors.lamp : colors.ink2} /> : null}
      <Control color={on ? colors.lamp : colors.ink} center
        {...(fit ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8, style: Platform.OS === 'web' ? styles.controlFit : undefined } : {})}>{label}</Control>
    </Press>
  );
}

// ---------------------------------------------------------------------------------------------
// Tile: a big square (or wide) radio with an icon or a miniature scene.

export function Tile({ icon, scene, label, sub, on, onPress, wide, disabled, hint, style }: {
  icon?: IconName;
  /** When set, the tile's background is that scene's floor gradient: a miniature room. */
  scene?: SceneTexture;
  label: string; sub?: string; on: boolean; onPress: () => void; wide?: boolean; disabled?: boolean; hint?: string; style?: StyleProp<ViewStyle>;
}) {
  const floor = scene ? colors.scene[scene].floor : null;
  const material = useMaterial();
  return (
    <Press accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ checked: on, disabled: !!disabled }} disabled={disabled}
      onPress={onPress} haptic="tick"
      style={[styles.tile, material.fill, wide ? styles.tileWide : styles.tileSquare, on && styles.selected, on && material.selected, disabled && styles.disabled, style]}>
      {floor ? <LinearGradient colors={[floor[0], floor[1]]} style={[StyleSheet.absoluteFill, styles.tileScene]} /> : null}
      {icon ? (
        <View style={styles.tileIcon}><Ionicons name={icon} size={20} color={on ? colors.lamp : colors.ink2} /></View>
      ) : null}
      <View style={[styles.tileText, wide && { flex: 1 }]}>
        <Control>{label}</Control>
        {sub ? <Label>{sub}</Label> : null}
      </View>
      {on ? <Ionicons name="checkmark" size={18} color={colors.lamp} style={wide ? undefined : styles.tileCheck} /> : null}
    </Press>
  );
}

// ---------------------------------------------------------------------------------------------
// Row: a hairline-separated list item. Expansion is fade-only: no layout animation.

export function Row({ icon, label, sub, onPress, chevron, expanded, children, right, hint, testID, style }: {
  icon?: IconName; label: string; sub?: string; onPress?: () => void;
  /** Show a forward chevron (navigation). Expandable rows show up/down from `expanded` instead. */
  chevron?: boolean;
  /** When defined the row is a disclosure: children mount at opacity 0 and cross in over 240 ms. */
  expanded?: boolean;
  children?: ReactNode; right?: ReactNode; hint?: string; testID?: string; style?: StyleProp<ViewStyle>;
}) {
  const disclosure = expanded !== undefined;
  const glyph: IconName | null = disclosure ? (expanded ? 'chevron-up' : 'chevron-down') : chevron ? 'chevron-forward' : null;
  const head = (
    <>
      {icon ? <Ionicons name={icon} size={20} color={colors.ink2} /> : null}
      <View style={styles.rowText}>
        <Control>{label}</Control>
        {sub ? <Label>{sub}</Label> : null}
      </View>
      {right}
      {glyph ? <Ionicons name={glyph} size={18} color={colors.ink3} /> : null}
    </>
  );
  return (
    <View style={[styles.rowWrap, style]} testID={testID}>
      {onPress ? (
        <Press accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint ?? sub} accessibilityState={disclosure ? { expanded } : undefined}
          onPress={onPress} style={styles.row}>{head}</Press>
      ) : <View style={styles.row}>{head}</View>}
      {disclosure && expanded ? <Fade style={styles.rowBody}>{children}</Fade> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Status: one polite sentence in ink2. Text cross-fades; the column never jumps.

export function Status({ children, sub, live = 'polite', worse, center, style }: {
  children?: ReactNode;
  /** A Caption beneath the sentence, e.g. "Rain · Hushed · fades after 30 min". */
  sub?: string;
  /** `assertive` for the "making it worse" message. */
  live?: 'polite' | 'assertive';
  /** The room backed off: a 2 px rose hairline on the left. */
  worse?: boolean;
  center?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const plain = typeof children === 'string' || typeof children === 'number' || children == null;
  const [shown, setShown] = useState<{ children: ReactNode; sub?: string }>({ children, sub });
  const opacity = useSharedValue(1);
  const pending = useRef<{ children: ReactNode; sub?: string } | null>(null);
  const fading = useRef(false);
  const swap = useCallback(() => {
    fading.current = false;
    const p = pending.current; pending.current = null;
    if (p) setShown(p);
    opacity.set(withTiming(1, { duration: timing.status, easing: ease.enter }));
  }, [opacity]);
  useEffect(() => {
    if (!plain) { setShown({ children, sub }); return; }
    if (String(shown.children ?? '') === String(children ?? '') && shown.sub === sub) return;
    pending.current = { children, sub };
    if (fading.current) return;
    fading.current = true;
    cancelAnimation(opacity);
    opacity.set(withTiming(0, { duration: timing.crossfadeOut, easing: ease.exit }, () => scheduleOnRN(swap)));
  }, [children, sub, plain, shown, opacity, swap]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <View accessibilityLiveRegion={live} aria-live={live} style={[styles.status, worse && styles.statusWorse, style]}>
      <Animated.View style={[styles.statusInner, center && { alignItems: 'center' }, animated]}>
        {shown.children == null || shown.children === '' ? null : <Body color={colors.ink2} center={center}>{shown.children}</Body>}
        {shown.sub ? <Caption center={center}>{shown.sub}</Caption> : null}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Screen: the Scene, the safe area, a scroll column, the font-ready fader, then any overlay.

export type ScreenProps = {
  children: ReactNode; scrollRef?: any; overlay?: ReactNode; center?: boolean;
  /** Scene props. Default: `hush` at depth 1, the Journal's room. */
  texture?: SceneTexture | 'none' | string | null; depth?: Depth; playing?: boolean; softer?: boolean; worse?: boolean; fadeInMs?: number;
  /**
   * Extra bottom padding, e.g. 64 while the pinned worse bar is up, or the check-in sheet's height. It
   * only adds scroll room: centred content keeps its place, so the lamp never jumps when it changes.
   */
  bottomPad?: number;
  /** Hide the content from touch, keyboard and assistive tech (the dim veil or Dark screen is over it). */
  inert?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Lets a control that is being dragged (a dial) stop the page from scrolling under the finger. */
const ScrollLock = createContext<(locked: boolean) => void>(() => {});
export const useScrollLock = () => useContext(ScrollLock);
/** Gives a scroll view of its own (the setup overlay's) the dial lock, instead of the screen underneath. */
export function ScrollLockScope({ onLock, children }: { onLock: (locked: boolean) => void; children: ReactNode }) {
  return <ScrollLock.Provider value={onLock}>{children}</ScrollLock.Provider>;
}

export function Screen({ children, scrollRef, overlay, center, texture, depth = 1, playing, softer, worse, fadeInMs, bottomPad = 0, inert = false, contentStyle }: ScreenProps) {
  const wide = useWide();
  const gutter = useGutter();
  const insets = useSafeAreaInsets();
  const { ready } = useAppFonts();
  const opacity = useSharedValue(ready ? 1 : 0);
  useEffect(() => { if (ready) opacity.set(withTiming(1, cross(timing.crossfadeIn))); }, [ready, opacity]);
  const fader = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const [viewH, setViewH] = useState(0);
  const column = wide ? styles.columnWide : Platform.OS === 'web' ? styles.columnPhoneWeb : null;
  // Phones keep clear of the floating tab bar (64 + 12 inset) and the home indicator.
  const paddingTop = wide ? 48 : 20;
  const basePad = wide ? 72 : 96 + insets.bottom;
  // With extra padding the content keeps the height it had without it, so centring does not move it.
  const hold = bottomPad > 0 && viewH > 0 ? { minHeight: viewH - paddingTop - basePad } : null;
  const [locked, setLocked] = useState(false);
  return (
    <ScrollLock.Provider value={setLocked}>
    <View style={styles.root}>
      <Scene texture={texture} depth={depth} playing={playing} softer={softer} worse={worse} fadeInMs={fadeInMs} />
      <Inert when={inert} style={styles.fill}>
        <SafeAreaView style={styles.grow} edges={['top']}>
          <ScrollView ref={scrollRef} scrollEnabled={!locked} keyboardShouldPersistTaps="handled" onLayout={e => setViewH(e.nativeEvent.layout.height)}
            contentContainerStyle={[styles.screen, column, { paddingHorizontal: gutter, paddingTop, paddingBottom: basePad + bottomPad }, contentStyle]}>
            <Animated.View style={[styles.content, center && styles.centered, hold, fader]}>{children}</Animated.View>
          </ScrollView>
        </SafeAreaView>
      </Inert>
      {overlay}
    </View>
    </ScrollLock.Provider>
  );
}

/**
 * While `when` is set, hides its subtree from touch-free input too: screen readers skip it (VoiceOver,
 * TalkBack, aria-hidden) and on web it is `inert`, so nothing in it can be focused or pressed by key.
 * On web the element that had focus inside gets it back when the cover lifts, unless focus moved on.
 */
export function Inert({ when, style, children, pointerEvents }: { when: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode; pointerEvents?: 'auto' | 'none' | 'box-none' }) {
  const node = useRef<unknown>(null);
  const saved = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = node.current as HTMLElement | null;
    if (!web || !el || typeof document === 'undefined') return;
    if (when) {
      // Read focus before going inert: the browser drops focus from an inert subtree.
      const active = document.activeElement as HTMLElement | null;
      saved.current = active && el.contains(active) ? active : null;
      el.inert = true;
      return;
    }
    if (!el.inert) return;
    el.inert = false;
    const back = saved.current; saved.current = null;
    const active = document.activeElement as HTMLElement | null;
    // Only take focus back from nowhere or from the cover that is leaving, never from something the person chose.
    if (back?.isConnected && (!active || active === document.body || active.closest?.('[data-still-cover]'))) back.focus?.();
  }, [when]);
  return (
    <View ref={node as never} style={style} pointerEvents={pointerEvents}
      accessibilityElementsHidden={when} importantForAccessibility={when ? 'no-hide-descendants' : 'auto'} aria-hidden={when || undefined}>
      {children}
    </View>
  );
}

/** The old card: smoke fill, hairline border, radius 24. `accent` draws the selected (lampDeep) border. */
export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  const material = useMaterial();
  return <View style={[styles.card, material.fill, accent && { borderColor: colors.lampDeep }, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  fill: { flex: 1, zIndex: z.content },
  grow: { flex: 1 },
  center: { textAlign: 'center' },
  screen: { flexGrow: 1 },
  screenWide: { width: '100%', maxWidth: 1160, alignSelf: 'center' },
  columnWide: { width: '100%', maxWidth: 1160, alignSelf: 'center' },
  columnPhoneWeb: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  content: { flexGrow: 1, gap: 16 },
  centered: { justifyContent: 'center' },
  // type
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: colors.ink },
  displayWide: { fontFamily: fonts.display, fontSize: 56, lineHeight: 60, letterSpacing: -1.1, color: colors.ink },
  title: { fontFamily: fonts.title, fontSize: 26, lineHeight: 32, letterSpacing: -0.3, color: colors.ink },
  titleWide: { fontFamily: fonts.title, fontSize: 30, lineHeight: 36, letterSpacing: -0.3, color: colors.ink },
  greeting: { fontFamily: fonts.displayItalic, fontSize: 24, lineHeight: 30, letterSpacing: -0.2, color: colors.ink2 },
  greetingWide: { fontFamily: fonts.displayItalic, fontSize: 30, lineHeight: 36, letterSpacing: -0.2, color: colors.ink2 },
  heading: { fontFamily: fonts.title, fontSize: 20, lineHeight: 26, letterSpacing: -0.1, color: colors.ink },
  numeral: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -0.6, color: colors.ink, fontVariant: ['tabular-nums'] },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  control: { fontFamily: fonts.ui, fontSize: 16, lineHeight: 22, color: colors.ink },
  label: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, letterSpacing: 0.1, color: colors.ink2 },
  caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, letterSpacing: 0.1, color: colors.ink2 },
  eyebrow: { fontFamily: fonts.ui, fontSize: 11.5, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.ink2 },
  // controls
  button: { flexDirection: 'row', gap: 10, minHeight: 56, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.button, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonWithSub: { justifyContent: 'flex-start', paddingHorizontal: 16, gap: 12 },
  buttonLines: { flex: 1, gap: 2, minWidth: 0 },
  primary: { backgroundColor: colors.lamp, borderColor: colors.lamp },
  smoke: { backgroundColor: colors.smoke, borderColor: colors.hairline },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  rose: { minHeight: 52, paddingVertical: 13, backgroundColor: colors.smoke, borderColor: colors.roseLine, borderLeftWidth: 2, borderLeftColor: colors.rose },
  disabled: { opacity: 0.38 },
  selected: { backgroundColor: colors.smokePressed, borderColor: colors.lampDeep },
  segmented: { flexDirection: 'row', gap: 8 },
  segmentedStacked: { flexDirection: 'column' },
  segment: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 48, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.smoke, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  segmentStacked: { flex: 0, paddingHorizontal: 18 },
  segmentLabel: { flexShrink: 1, textAlign: 'center' },
  hidden: { display: 'none' },
  segmentOn: { backgroundColor: colors.smokePressed, borderColor: colors.lampDeep },
  controlFit: { fontSize: 14, whiteSpace: 'nowrap' } as TextStyle,   // "2 days ago" is 73 px: fits a 375 px row of three
  chip: { flexDirection: 'row', gap: 8, minHeight: 48, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.smoke, borderRadius: radius.chip, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  tile: { flexGrow: 1, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.smoke, padding: 16, gap: 10, overflow: 'hidden' },
  tileSquare: { flexBasis: '46%', minHeight: 104, justifyContent: 'space-between' },
  // Full width without growing: a 100% flex-basis would mean 100% of the HEIGHT in a column list.
  tileWide: { flexGrow: 0, flexBasis: 'auto', width: '100%', minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14 },
  tileScene: { borderRadius: radius.tile },
  tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.smokePressed },
  tileText: { gap: 2, minWidth: 0 },
  tileCheck: { position: 'absolute', top: 14, right: 14 },
  rowWrap: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 12, paddingHorizontal: 4 },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  rowBody: { paddingBottom: 16, gap: 16 },
  status: { minHeight: 48, justifyContent: 'center' },
  statusWorse: { borderLeftWidth: 2, borderLeftColor: colors.rose, paddingLeft: 12 },
  statusInner: { gap: 4 },
  card: { backgroundColor: colors.smoke, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.card, padding: 18, gap: 8 },
  cardTitle: { color: colors.ink, fontFamily: fonts.title, fontSize: 20, lineHeight: 26 },
});
