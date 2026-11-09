// A bottom sheet that follows the finger. Translate and opacity only, never blur; critically damped,
// so a translucent surface never bounces. Never used on desktop: callers render an inline card there.
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type React from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, z } from './theme';
import { ease, project, rubberband, spring, timing, useReducedMotion } from './motion';
import { Press, styles as ui } from './ui';

const DISMISS_FRACTION = 0.6;   // projected endpoint past 60% of the height closes it
const DISMISS_VELOCITY = 600;   // or a flick faster than this, px/s
const TRAVEL_OPACITY = 0.92;    // large surfaces are a little see-through while they move
const web = Platform.OS === 'web';
const FOCUSABLE = '[tabindex]:not([tabindex="-1"]), a[href], button:not([disabled]), input:not([disabled]), select, textarea';

export type SheetProps = {
  open: boolean;
  /** Called once the sheet has left (after a drag past the threshold, the handle, the scrim or Escape). */
  onClose: () => void;
  /**
   * The least content height, without the home-indicator inset or `bottomReserve`, which the sheet adds
   * itself. Content that needs more (large text) makes the sheet taller: it is measured, never clipped.
   */
  height: number;
  /** Space kept free at the bottom for chrome drawn over the sheet (the floating tab bar). */
  bottomReserve?: number;
  children: ReactNode;
  /** `false` for a non-modal sheet (the check-in): nothing darkens and the lamp above stays tappable. */
  scrim?: boolean;
  /** Rendered as the heading; focus moves here on open and returns to the opener on close. */
  title?: string;
  /** Optional: the sheet writes its rest progress 0 (away) .. 1 (open) here, so chrome beneath can follow it. */
  progress?: SharedValue<number>;
  /** Where focus goes back on close when the opener is unknown (always on iOS and Android). */
  returnFocusRef?: RefObject<unknown>;
  /** The measured content height (no inset, no reserve), so the screen beneath can scroll clear of it. */
  onContentHeight?: (height: number) => void;
  testID?: string;
};

export function Sheet({ open, onClose, height, bottomReserve = 0, children, scrim = true, title, progress, returnFocusRef, onContentHeight, testID }: SheetProps) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const pad = insets.bottom + bottomReserve;
  const [content, setContent] = useState(0);
  // The sheet's full height: the measured content, never less than the minimum.
  const total = Math.max(height, content) + pad;
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(open ? 0 : total);
  const extent = useSharedValue(total);   // the closed position, read by the gesture and the scrim
  const isOpen = useSharedValue(open);
  const startY = useSharedValue(0);
  const travel = useSharedValue(1);   // 0.92 while the finger moves it, 1 at rest
  const fade = useSharedValue(open ? 1 : 0);
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);
  const panelRef = useRef<unknown>(null);
  const opener = useRef<{ focus?: () => void } | null>(null);
  const wasOpen = useRef(false);
  const totalRef = useRef(total);
  totalRef.current = total;
  const reportHeight = useRef(onContentHeight);
  reportHeight.current = onContentHeight;
  const unmount = useCallback(() => setMounted(false), []);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => { extent.set(total); }, [total, extent]);
  const measure = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h > 0 && h !== content) { setContent(h); reportHeight.current?.(Math.max(height, h)); }
  };

  // Open and close follow the `open` prop; a drag past the threshold animates out first, then asks to close.
  // Only the false -> true and true -> false transitions count, so an inset or reduced-motion change while
  // open never re-records the opener (which by then would be the sheet's own title).
  useEffect(() => {
    const was = wasOpen.current;
    wasOpen.current = open;
    isOpen.set(open);
    cancelAnimation(y); cancelAnimation(fade);
    if (open) {
      setMounted(true);
      if (!was && web && typeof document !== 'undefined') opener.current = document.activeElement as unknown as { focus?: () => void };
      if (reduced) { y.set(0); fade.set(withTiming(1, { duration: timing.crossfadeIn, easing: ease.enter })); }
      else { fade.set(1); y.set(withSpring(0, spring.sheet)); }
      return;
    }
    if (!was) return;
    if (reduced) fade.set(withTiming(0, { duration: timing.crossfadeOut, easing: ease.exit }, finished => { if (finished) scheduleOnRN(unmount); }));
    else y.set(withSpring(totalRef.current, spring.sheet, finished => { if (finished) scheduleOnRN(unmount); }));
    returnFocus();
  }, [open, reduced, y, fade, isOpen, unmount]); // returnFocus reads refs only

  /** Give focus back to whoever had it before, but only if it is still in the sheet (or nowhere). */
  function returnFocus() {
    const back = opener.current ?? (returnFocusRef?.current as { focus?: () => void } | null | undefined) ?? null;
    opener.current = null;
    if (web) {
      if (typeof document === 'undefined') return;
      const active = document.activeElement;
      const panel = panelRef.current as HTMLElement | null;
      if (!active || active === document.body || panel?.contains(active)) back?.focus?.();
      return;
    }
    const target = returnFocusRef?.current;
    if (!target) return;
    setTimeout(() => {
      try { const tag = findNodeHandle(target as never); if (tag) AccessibilityInfo.setAccessibilityFocus(tag); } catch { /* a courtesy */ }
    }, 50);
  }

  // Focus the heading once it exists, so a screen reader lands on the question, not on the handle.
  useEffect(() => {
    if (!open || !mounted || !title) return;
    const node = titleRef.current; if (!node) return;
    const id = setTimeout(() => {
      try {
        if (web) (node as unknown as { focus?: () => void }).focus?.();
        else { const tag = findNodeHandle(node); if (tag) AccessibilityInfo.setAccessibilityFocus(tag); }
      } catch { /* focus is a courtesy; the sheet works without it */ }
    }, 50);
    return () => clearTimeout(id);
  }, [open, mounted, title]);

  // Web keys: Escape closes it; a modal sheet (with a scrim) also keeps Tab and Shift+Tab inside itself.
  useEffect(() => {
    if (!open || !web || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab' || !scrim) return;
      const panel = panelRef.current as HTMLElement | null;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute('disabled'));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      const inside = !!active && panel.contains(active);
      if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close, scrim]);

  // Rest progress follows both position and fade: under reduced motion the sheet fades in place and
  // never moves, so position alone would leave the chrome beneath it stuck at "open" after it closes.
  useAnimatedReaction(
    () => (1 - Math.min(Math.max(y.get() / extent.get(), 0), 1)) * fade.get(),
    v => { if (progress) progress.set(v); },
    [progress],
  );

  // The spring is only taken over once the pan is really a drag (onStart): a tap on the sheet while it
  // opens or leaves must not freeze it part-way.
  const pan = Gesture.Pan()
    .onBegin(() => { travel.set(withTiming(TRAVEL_OPACITY, { duration: timing.crossfadeOut })); })
    .onStart(() => { cancelAnimation(y); startY.set(y.get()); })
    .onUpdate(e => {
      const t = startY.get() + e.translationY;
      y.set(t >= 0 ? t : rubberband(t, extent.get()));
    })
    .onEnd(e => {
      const end = extent.get();
      // Grabbed while it was already leaving: let it finish leaving.
      if (!isOpen.get()) {
        y.set(withSpring(end, { ...spring.sheet, velocity: e.velocityY }, f => { if (f) scheduleOnRN(unmount); }));
        return;
      }
      const dismiss = y.get() + project(e.velocityY) > end * DISMISS_FRACTION || e.velocityY > DISMISS_VELOCITY;
      if (dismiss) {
        if (reduced) { fade.set(withTiming(0, { duration: timing.crossfadeOut, easing: ease.exit }, f => { if (f) scheduleOnRN(close); })); return; }
        y.set(withSpring(end, { ...spring.sheet, velocity: e.velocityY }, f => { if (f) scheduleOnRN(close); }));
        return;
      }
      if (reduced) y.set(withTiming(0, { duration: 150, easing: ease.enter }));
      else y.set(withSpring(0, { ...spring.sheet, velocity: e.velocityY }));
    })
    .onFinalize(() => { travel.set(withTiming(1, { duration: timing.crossfadeOut })); });

  const panel = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
    opacity: fade.get() * travel.get(),
  }));
  const veil = useAnimatedStyle(() => ({ opacity: fade.get() * interpolate(y.get(), [0, extent.get()], [1, 0]) }));

  if (!mounted) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none" testID={testID}>
      {scrim ? (
        <Animated.View style={[StyleSheet.absoluteFill, veil]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={[StyleSheet.absoluteFill, styles.scrim]} />
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View role="dialog" accessibilityViewIsModal={scrim} aria-modal={scrim} accessibilityLabel={title}
          style={[styles.panel, { minHeight: height + pad, paddingBottom: pad }, panel]}>
          {/* Natural height, measured: the sheet grows with large text instead of clipping it. */}
          <View ref={panelRef as never} onLayout={measure}>
            <Press accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={styles.handleHit} scaleTo={1}>
              <View style={styles.handle} />
            </Press>
            {title ? (
              // An H2 on web: the screen's own title is the H1.
              <Text ref={titleRef} accessibilityRole="header" style={[ui.heading, styles.title]} {...(web ? ({ tabIndex: -1, 'aria-level': 2 } as object) : null)}>{title}</Text>
            ) : null}
            <View style={styles.body}>{children}</View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: z.sheet, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.scrim },
  panel: {
    backgroundColor: colors.solid, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.hairline, borderTopColor: colors.hairlineLit,
    paddingHorizontal: 20,
  },
  // 44 tall in itself: react-native-web ignores hitSlop, so the bar's own box is the target there.
  handleHit: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 24, justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.hairlineLit },
  title: { marginBottom: 12 },
  body: { gap: 12 },
});
