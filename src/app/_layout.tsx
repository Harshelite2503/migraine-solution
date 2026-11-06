import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';

export default function Layout() {
  return (
    <>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line },
          tabBarActiveTintColor: colors.ink,
          tabBarInactiveTintColor: colors.muted,
          tabBarIcon: () => null,
          tabBarIconStyle: { display: 'none' },
          tabBarLabelStyle: { fontSize: 14, paddingBottom: 6 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Quiet room' }} />
        <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
        <Tabs.Screen name="tune" options={{ title: 'Build my sound' }} />
      </Tabs>
    </>
  );
}
