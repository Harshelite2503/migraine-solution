import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { AppState, Easing } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';
import { useAppFonts } from '../lib/fonts';
import { useWide, type IconName } from '../lib/ui';
import { timing } from '../lib/motion';
import { TabBar } from '../components/TabBar';
import { Sidebar } from '../components/Sidebar';
import { syncNow } from '../lib/sharing';
import { listenForSignInLinks } from '../lib/account';
// The web shell: baseline CSS and the viewport/theme metas. A no-op module on native.
import '../lib/webShell';

// Outline when resting, filled when it is the room you are in.
const icon = (name: IconName) => ({ focused, color, size }: { focused: boolean; color: unknown; size: number }) => (
  <Ionicons name={(focused ? name.replace(/-outline$/, '') : name) as IconName} size={size} color={color as string} />
);

// Routes cross-fade; tabs are peers, so nothing slides. RN Animated easing: the navigator animates with it.
const crossFade = { animation: 'timing' as const, config: { duration: timing.crossfadeIn, easing: Easing.out(Easing.cubic) } };

export default function Layout() {
  // Desktop browser: a sidebar. Phones, tablets and narrow browsers: the floating tab bar.
  const wide = useWide();
  // Start loading the five font files at once; nothing waits on them (Screen fades text in when ready).
  useAppFonts();
  // If the person turned on "Help improve Still", upload new events at launch, on return, and every few minutes.
  useEffect(() => {
    syncNow();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') syncNow(); });
    const timer = setInterval(syncNow, 5 * 60 * 1000);
    const stopLinks = listenForSignInLinks();
    return () => { sub.remove(); clearInterval(timer); stopLinks(); };
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.night }}>
      <StatusBar style="light" />
      <Tabs
        tabBar={props => (wide ? <Sidebar {...props} /> : <TabBar {...props} />)}
        screenOptions={{
          ...(wide ? { tabBarPosition: 'left' as const } : {}),
          headerShown: false,
          sceneStyle: { backgroundColor: colors.night },
          animation: 'fade',
          transitionSpec: crossFade,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Quiet room', tabBarIcon: icon('moon-outline'), tabBarButtonTestID: 'tab-quiet' }} />
        <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: icon('book-outline'), tabBarButtonTestID: 'tab-journal' }} />
        <Tabs.Screen name="tune" options={{ title: 'My sound', tabBarIcon: icon('options-outline'), tabBarButtonTestID: 'tab-sound' }} />
        {/* The web landing. Not `href: null`: in SDK 58 js-tabs a hidden route that gains focus is
            redirected to the first tab, so /welcome would never show. TabBar and Sidebar list only
            the three rooms (NAV_ROUTES) and step aside while it is open. */}
        <Tabs.Screen name="welcome" options={{ title: 'Still' }} />
      </Tabs>
    </GestureHandlerRootView>
  );
}
