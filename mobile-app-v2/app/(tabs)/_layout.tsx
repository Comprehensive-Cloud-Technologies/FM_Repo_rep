import { Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme, Spacing } from '../../utils/theme';

export default function TabsLayout() {
  const { theme } = useTheme();
  const { user, isLoaded, permissions, can } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isLoaded && !user) router.replace('/');
  }, [isLoaded, user]);

  const icon = (name: string) =>
    ({ color, size }: { color: string; size: number }) =>
      <MaterialCommunityIcons name={name as any} size={size} color={color} />;

  // Mobile tab visibility is permission-driven (configured from the company /
  // client dashboards). Home & Profile always show. When no permissions have
  // loaded yet (first paint / legacy session) show everything, so tabs never
  // flash-hide before the permission list arrives.
  const showTab = (perm: string) => permissions.length === 0 ? true : can(perm);
  const tabOpts = (perm: string, title: string, iconName: string) =>
    showTab(perm)
      ? { title, tabBarIcon: icon(iconName) }
      : { href: null as null };

  const tabBarStyle = {
    backgroundColor: theme.tabBarBg,
    borderTopColor: theme.tabBarBorder,
    borderTopWidth: 1.5 as const,
    paddingBottom: Math.max(Spacing.sm, insets.bottom),
    paddingTop: Spacing.sm + 2,
    height: 66 + insets.bottom,
    shadowColor: theme.tabBarActive,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 16,
  };

  const screenOpts = {
    headerShown: false,
    tabBarStyle,
    tabBarActiveTintColor:   theme.tabBarActive,
    tabBarInactiveTintColor: theme.tabBarInactive,
    tabBarLabelStyle:        { fontSize: 11, fontWeight: '700' as const, marginBottom: 4, letterSpacing: 0.3 },
    tabBarItemStyle:         { paddingTop: 2 },
  };

  return (
    <Tabs screenOptions={screenOpts}>
      <Tabs.Screen name="home"     options={{ title: 'Home',     tabBarIcon: icon('home-variant') }} />
      <Tabs.Screen name="assets"   options={tabOpts('mobile:assets',   'Assets',   'package-variant')} />
      <Tabs.Screen name="requests" options={tabOpts('mobile:requests', 'Requests', 'briefcase-check-outline')} />
      <Tabs.Screen name="reports"  options={tabOpts('mobile:reports',  'Reports',  'chart-bar')} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile',  tabBarIcon: icon('account-circle') }} />
      {/* Hidden legacy screens — kept for deep-link navigation */}
      <Tabs.Screen name="dashboard"     options={{ href: null }} />
      <Tabs.Screen name="checklists"    options={{ href: null }} />
      <Tabs.Screen name="tasks"         options={{ href: null }} />
      <Tabs.Screen name="assignments"   options={{ href: null }} />
      <Tabs.Screen name="soft-requests" options={{ href: null }} />
    </Tabs>
  );
}
