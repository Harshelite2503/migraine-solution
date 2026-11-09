// A rotary knob with click-stops, like the ones on a synth. Drag up/down (or sideways) to turn it,
// tap it, or use the ‹ › buttons beside it. Each stop gives a light haptic click; the knob springs into
// place. A ring of small lights shows how far it is turned. Screen readers can adjust it too.
import { useEffect, useRef } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { Ionicons, tick, useReduceMotion, useScrollLock } from '../lib/ui';

const SWEEP = 270;            // degrees from the first stop to the last
const PX_PER_STOP = 26;       // how far to drag for one click

export function Dial({ label, stops, value, onChange, onRelease, size = 112, disabled }: {
  label: string;
  stops: string[];                       // a short word for each click-stop, low to high
  value: number;                         // index into stops
  onChange: (index: number) => void;     // every click while turning
  onRelease?: (index: number) => void;   // once, when the knob is let go (or tapped)
  size?: number;
  disabled?: boolean;
}) {
  const n = stops.length;
  const angleOf = (i: number) => -SWEEP / 2 + (n > 1 ? (i / (n - 1)) * SWEEP : 0);
  const spin = useRef(new Animated.Value(angleOf(value))).current;
  const press = useRef(new Animated.Value(1)).current;
  const current = useRef(value);
  const start = useRef(value);
  const moved = useRef(false);
  const handlers = useRef({ onChange, onRelease });
  handlers.current = { onChange, onRelease };
  const off = useRef(disabled);
  off.current = disabled;
  const reduce = useReduceMotion();
  const lockScroll = useScrollLock();
  const lock = useRef(lockScroll);
  lock.current = lockScroll;
  current.current = value;

  useEffect(() => {
    if (reduce) { spin.setValue(angleOf(value)); return; }
    Animated.spring(spin, { toValue: angleOf(value), useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [value, n, reduce]);

  const set = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    if (next === current.current) return;
    current.current = next;
    tick();
    handlers.current.onChange(next);
  };
  const squeeze = (to: number) => Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 30, bounciness: 6 }).start();

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !off.current,
    onMoveShouldSetPanResponder: () => !off.current,
    onMoveShouldSetPanResponderCapture: (_e, g) => !off.current && Math.abs(g.dy) + Math.abs(g.dx) > 4,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { start.current = current.current; moved.current = false; lock.current(true); squeeze(0.95); },
    onPanResponderMove: (_e, g) => {
      const travel = -g.dy + g.dx;
      if (Math.abs(travel) > 6) moved.current = true;
      set(start.current + Math.round(travel / PX_PER_STOP));
    },
    onPanResponderRelease: () => {
      lock.current(false); squeeze(1);
      // A tap without dragging steps to the next setting, wrapping round at the end.
      if (!moved.current) { const next = (current.current + 1) % n; current.current = next; tick(); handlers.current.onChange(next); }
      handlers.current.onRelease?.(current.current);
    },
    onPanResponderTerminate: () => { lock.current(false); squeeze(1); handlers.current.onRelease?.(current.current); },
  })).current;

  const ring = size / 2 + 10;
  const box = size + 34;
  const rotate = spin.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] });

  return (
    <View style={{ alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }}>
      <View
        {...pan.panHandlers}
        accessible accessibilityRole="adjustable" accessibilityLabel={label}
        accessibilityValue={{ text: stops[value] }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => {
          const next = value + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
          set(next); handlers.current.onRelease?.(Math.max(0, Math.min(n - 1, next)));
        }}
        style={[{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }, Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'grab', userSelect: 'none' } as any) : null]}>
        {/* The ring of lights: lit up to the current setting. */}
        {stops.map((_, i) => {
          const a = (angleOf(i) * Math.PI) / 180;
          const lit = i <= value;
          const dot = i === value ? 7 : 5;
          return (
            <View key={i} pointerEvents="none" style={{
              position: 'absolute', width: dot, height: dot, borderRadius: dot / 2,
              left: box / 2 + ring * Math.sin(a) - dot / 2, top: box / 2 - ring * Math.cos(a) - dot / 2,
              backgroundColor: lit ? colors.accent : 'rgba(255,255,255,0.12)',
              opacity: lit ? (i === value ? 1 : 0.55) : 1,
            }} />
          );
        })}
        {/* The knob itself. */}
        <Animated.View pointerEvents="none" style={{
          width: size, height: size, borderRadius: size / 2, transform: [{ scale: press }],
          backgroundColor: '#141d19', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
          shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{ position: 'absolute', width: size - 18, height: size - 18, borderRadius: (size - 18) / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.025)' }} />
          <Animated.View style={{ position: 'absolute', width: size, height: size, transform: [{ rotate }] }}>
            <View style={{ position: 'absolute', top: 7, left: size / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.moon }} />
          </Animated.View>
          <Text style={{ color: colors.ink, fontSize: size > 150 ? 17 : 13.5, fontWeight: '600', textAlign: 'center', paddingHorizontal: 12 }} numberOfLines={1}>{stops[value]}</Text>
        </Animated.View>
      </View>
      {/* Step buttons: a one-tap way to turn the dial either way, without dragging. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Step icon="chevron-back" label={`${label} down`} enabled={!disabled && value > 0} onPress={() => { set(value - 1); handlers.current.onRelease?.(Math.max(0, value - 1)); }} />
        <Text style={{ color: colors.muted, fontSize: 12.5, letterSpacing: 1.4, textTransform: 'uppercase', minWidth: 56, textAlign: 'center' }}>{label}</Text>
        <Step icon="chevron-forward" label={`${label} up`} enabled={!disabled && value < n - 1} onPress={() => { set(value + 1); handlers.current.onRelease?.(Math.min(n - 1, value + 1)); }} />
      </View>
    </View>
  );
}

function Step({ icon, label, enabled, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, opacity: enabled ? (pressed ? 0.5 : 1) : 0.25 })}>
      <Ionicons name={icon} size={18} color={colors.muted} />
    </Pressable>
  );
}
