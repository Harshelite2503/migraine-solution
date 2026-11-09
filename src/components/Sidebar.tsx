// Desktop-web navigation: a quiet sidebar in place of the phone's bottom tab bar. Only rendered in a
// wide browser window (see _layout.tsx); phones never use it.
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { colors } from '../lib/theme';

const ITEMS: { path: '/' | '/journal' | '/tune'; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { path: '/', label: 'Quiet room', sub: 'Play your sound', icon: 'moon-outline' },
  { path: '/journal', label: 'Journal', sub: 'Your hard days', icon: 'book-outline' },
  { path: '/tune', label: 'My sound', sub: 'Make it yours', icon: 'options-outline' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <View style={{ width: 268, paddingHorizontal: 22, paddingTop: 36, paddingBottom: 28, backgroundColor: colors.bgTop, borderRightWidth: 1, borderRightColor: colors.line, justifyContent: 'space-between' }}>
      <View style={{ gap: 36 }}>
        <View style={{ gap: 6, paddingHorizontal: 10 }}>
          <Text style={{ color: colors.ink, fontFamily: 'Georgia', fontSize: 34, letterSpacing: -0.5 }}>Still</Text>
          <Text style={{ color: colors.muted, fontSize: 13.5 }}>Sound for migraine days</Text>
        </View>
        <View accessibilityRole="tablist" style={{ gap: 4 }}>
          {ITEMS.map(item => {
            const on = item.path === '/' ? pathname === '/' || pathname === '/index' : pathname.startsWith(item.path);
            return (
              <Pressable key={item.path} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={item.label}
                onPress={() => router.navigate(item.path)}
                style={({ hovered, pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14,
                  backgroundColor: on ? 'rgba(169,199,155,0.12)' : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                })}>
                <Ionicons name={item.icon} size={20} color={on ? colors.accent : colors.muted} />
                <View>
                  <Text style={{ color: on ? colors.ink : colors.muted, fontSize: 15.5 }}>{item.label}</Text>
                  <Text style={{ color: colors.faint, fontSize: 12 }}>{item.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={{ gap: 8, paddingHorizontal: 10 }}>
        <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 18 }}>The sound is made in your browser. Nothing you choose leaves it.</Text>
        <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 18 }}>For comfort, not treatment.</Text>
      </View>
    </View>
  );
}
