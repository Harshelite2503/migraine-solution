// Small question widgets used across "Build my sound".
import { Pressable, Text, View } from 'react-native';
import { colors } from '../../lib/theme';
import { tick } from '../../lib/ui';

export function Pick<T extends string | number | boolean>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <Text style={{ color: colors.ink, fontSize: 15 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
        {options.map(o => (
          <Chip key={String(o.value)} label={o.label} on={o.value === value} onPress={() => onChange(o.value)} role="radio" />
        ))}
      </View>
    </View>
  );
}

export function PickMany<T extends string>({ label, hint, options, value, onChange, exclusive }: {
  label: string; hint?: string; options: { value: T; label: string }[]; value: T[] | undefined; onChange: (v: T[]) => void; exclusive?: T[];
}) {
  const set = new Set(value || []);
  const toggle = (v: T) => {
    if (exclusive?.includes(v)) { onChange(set.has(v) ? [] : [v]); return; }
    const next = new Set([...set].filter(x => !exclusive?.includes(x)));
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange([...next]);
  };
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <Text style={{ color: colors.ink, fontSize: 15 }}>{label}</Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map(o => <Chip key={o.value} label={o.label} on={set.has(o.value)} onPress={() => toggle(o.value)} role="checkbox" />)}
      </View>
    </View>
  );
}

export const SCALE_0_4 = ['Not at all', 'A little', 'Some', 'A lot', 'Severely'].map((label, value) => ({ label, value }));

export function Chip({ label, on, onPress, role }: { label: string; on: boolean; onPress: () => void; role: 'radio' | 'checkbox' }) {
  return (
    <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ checked: on }} onPressIn={tick} onPress={onPress}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: on ? 'rgba(169,199,155,0.6)' : colors.line, backgroundColor: on ? 'rgba(169,199,155,0.14)' : colors.surface, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13, opacity: pressed ? 0.75 : 1 })}>
      <Text style={{ color: on ? colors.ink : colors.muted, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
