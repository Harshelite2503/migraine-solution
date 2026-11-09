import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, tabBarStyle } from '../lib/theme';
import { useWide } from '../lib/ui';
import { Sidebar } from '../components/Sidebar';

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} size={size} color={color as string} />;

export default function Layout() {
  // Desktop browser: full width with a sidebar. Narrow browser: a phone-width column. Phones: as is.
  const wide = useWide();
  const frame = Platform.OS === 'web' && !wide ? { flex: 1, width: '100%' as const, maxWidth: 520, alignSelf: 'center' as const } : { flex: 1 };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <View style={frame}>
      <StatusBar style="light" />
      <Tabs
        {...(wide ? { tabBar: () => <Sidebar /> } : {})}
        screenOptions={{
          ...(wide ? { tabBarPosition: 'left' as const } : {}),
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: { fontSize: 11.5, lineHeight: 16 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Quiet room', tabBarIcon: icon('moon-outline'), tabBarButtonTestID: 'tab-quiet' }} />
        <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: icon('book-outline'), tabBarButtonTestID: 'tab-journal' }} />
        <Tabs.Screen name="tune" options={{ title: 'My sound', tabBarIcon: icon('options-outline'), tabBarButtonTestID: 'tab-sound' }} />
      </Tabs>
    </View>
    </View>
  );
}
