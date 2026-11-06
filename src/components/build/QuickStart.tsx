// Quick start: four taps, about 30 seconds, no sound. Enough to make the starting sound
// personal; everything else is optional.
import { View } from 'react-native';
import type { Intake, Profile } from '../../lib/profile';
import { Pick } from './Choices';

type Props = { profile: Profile; onChange: (p: Profile) => void };
type Which = 'high' | 'low' | 'both' | 'neither';

export function quickDone(p: Profile) {
  const i = p.intake;
  return i.attackSoundBother !== undefined && i.bother?.high !== undefined && i.bother?.sudden !== undefined && !!i.listening;
}

export function QuickStart({ profile, onChange }: Props) {
  const i = profile.intake, b = i.bother || {};
  const set = (patch: Partial<Intake>) => onChange({ ...profile, intake: { ...i, ...patch } });
  const which: Which | undefined = b.high === undefined ? undefined : b.high >= 3 && (b.low ?? 0) >= 3 ? 'both' : b.high >= 3 ? 'high' : (b.low ?? 0) >= 3 ? 'low' : 'neither';
  return (
    <View>
      <Pick label="During a headache, how much do sounds bother you?" value={i.attackSoundBother} onChange={v => set({ attackSoundBother: v })}
        options={[{ value: 0, label: 'Not much' }, { value: 1, label: 'Somewhat' }, { value: 2, label: 'A lot' }, { value: 3, label: 'Always' }]} />
      <Pick<Which> label="Which bothers you more?" value={which}
        onChange={v => set({ bother: { ...b, high: v === 'high' || v === 'both' ? 3 : 1, low: v === 'low' || v === 'both' ? 3 : 1 } })}
        options={[{ value: 'high', label: 'Hiss, high sounds' }, { value: 'low', label: 'Low rumble' }, { value: 'both', label: 'Both' }, { value: 'neither', label: 'Neither' }]} />
      <Pick label="Do sudden sounds startle you?" value={b.sudden === undefined ? undefined : b.sudden >= 2}
        onChange={v => set({ bother: { ...b, sudden: v ? 3 : 0 } })}
        options={[{ value: true, label: 'Yes' }, { value: false, label: 'Not really' }]} />
      <Pick label="How do you listen?" value={i.listening} onChange={v => set({ listening: v })}
        options={[{ value: 'earbuds', label: 'Earbuds' }, { value: 'headphones', label: 'Headphones' }, { value: 'speaker', label: 'Phone speaker' }, { value: 'pillow', label: 'Pillow speaker' }]} />
    </View>
  );
}
