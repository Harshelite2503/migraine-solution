import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} size={size} color={color as string} />;

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle: { backgroundColor: colors.bgTop, borderTopColor: colors.line },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.faint,
          tabBarLabelStyle: { fontSize: 11.5 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Quiet room', tabBarIcon: icon('moon-outline'), tabBarButtonTestID: 'tab-quiet' }} />
        <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: icon('book-outline'), tabBarButtonTestID: 'tab-journal' }} />
        <Tabs.Screen name="tune" options={{ title: 'My sound', tabBarIcon: icon('options-outline'), tabBarButtonTestID: 'tab-sound' }} />
      </Tabs>
    </>
  );
}
