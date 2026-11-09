// Quick start: four taps and one sound you pick by ear, about a minute. Enough to make the starting sound
// personal; everything else is optional.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { recipeFor, type Intake, type Profile } from '../../lib/profile';
import * as player from '../../lib/player';
import { colors } from '../../lib/theme';
import { Ionicons, tap } from '../../lib/ui';
import { Pick } from './Choices';
import { track } from '../../lib/activity';

type Texture = NonNullable<Intake['texture']>;
const TEXTURES: { value: Texture; label: string; note?: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'rain', label: 'Rain', note: 'Calmest in our tests', icon: 'rainy-outline' },
  { value: 'ocean', label: 'Ocean', icon: 'water-outline' },
  { value: 'fan', label: 'Fan', icon: 'sync-outline' },
  { value: 'none', label: 'Plain hush', icon: 'remove-outline' },
];

/** Pick a texture by ear: each card plays a 6-second preview of your own sound with that texture. */
function TexturePick({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  const [hearing, setHearing] = useState<Texture | null>(null);
  const chosen = profile.intake.texture;
  useEffect(() => () => { player.stop(0.3); }, []);
  const preview = async (t: Texture) => {
    track('texture_preview', { texture: t });
    if (hearing === t) { player.stop(0.5); setHearing(null); return; }
    setHearing(t);
    const base = recipeFor(profile, 'normal').recipe;
    const uri = await player.recipeFile({ ...base, texture: t, textureAmount: 0.6 }, true);
    await player.play(uri, { levelDb: Math.min(0, base.levelDb), fadeIn: 0.6, loop: false, title: `Preview: ${t}` });
    setTimeout(() => setHearing(h => (h === t ? null : h)), 6500);
  };
  return (
    <View style={{ gap: 8, marginTop: 12 }}>
      <Text style={{ color: colors.ink, fontSize: 15 }}>Which feels most restful? Tap to listen, then choose.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TEXTURES.map(t => {
          const on = chosen === t.value;
          return (
            <View key={t.value} style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: on ? 'rgba(169,199,155,0.6)' : colors.line, backgroundColor: on ? 'rgba(169,199,155,0.12)' : colors.surface, padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={t.icon} size={18} color={colors.moon} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 15 }}>{t.label}</Text>
                  {t.note && <Text style={{ color: colors.muted, fontSize: 11 }}>{t.note}</Text>}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${hearing === t.value ? 'Stop' : 'Listen to'} ${t.label}`} onPressIn={tap} onPress={() => preview(t.value)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.line }}>
                  <Ionicons name={hearing === t.value ? 'stop' : 'play'} size={16} color={colors.accent} />
                </Pressable>
                <Pressable accessibilityRole="radio" accessibilityLabel={`Choose ${t.label}`} accessibilityState={{ checked: on }} onPressIn={tap}
                  onPress={() => { track('texture_pick', { texture: t.value }); onChange({ ...profile, intake: { ...profile.intake, texture: t.value } }); }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: on ? colors.accent : colors.surfaceStrong }}>
                  <Text style={{ color: on ? colors.bgTop : colors.ink, fontSize: 13, fontWeight: '600' }}>{on ? 'Chosen' : 'Choose'}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

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
      <TexturePick profile={profile} onChange={onChange} />
    </View>
  );
}
