import { Tabs, router } from 'expo-router';
import React, { useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme, Spacing } from '../../utils/theme';

export default function TabsLayout() {
  const { theme } = useTheme();
  const { user, capabilities, isLoaded } = useAuth();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isLoaded && !user) router.replace('/');
  }, [isLoaded, user]);

  const tabBarStyle = {
    backgroundColor: theme.tabBarBg,
    borderTopColor: theme.tabBarBorder,
    borderTopWidth: 1 as const,
    paddingBottom: Math.max(Spacing.sm, insets.bottom),
    paddingTop: Spacing.xs,
    height: 60 + insets.bottom,
  };
  const screenOpts = {
    headerShown: false,
    tabBarStyle,
    tabBarActiveTintColor:   theme.tabBarActive,
    tabBarInactiveTintColor: theme.tabBarInactive,
    tabBarLabelStyle:        { fontSize: 11, fontWeight: '600' as const, marginBottom: 2 },
  };

  const icon = (name: string) =>
    ({ color, size }: { color: string; size: number }) =>
      <MaterialCommunityIcons name={name as any} size={size} color={color} />;

  // ── Healthcare Staff (Nurse / Doctor / Ward Boy): Home + Profile only
  if (capabilities.isHCStaff) {
    return (
      <Tabs screenOptions={screenOpts}>
        <Tabs.Screen name="home"       options={{ title: 'Home',    tabBarIcon: icon('home-variant') }} />
        <Tabs.Screen name="profile"    options={{ title: 'Profile', tabBarIcon: icon('account-circle') }} />
        <Tabs.Screen name="dashboard"  options={{ href: null }} />
        <Tabs.Screen name="checklists" options={{ href: null }} />
        <Tabs.Screen name="tasks"      options={{ href: null }} />
        <Tabs.Screen name="assignments" options={{ href: null }} />
        <Tabs.Screen name="soft-requests" options={{ href: null }} />
      </Tabs>
    );
  }

  // ── Healthcare Engineer: Home + Cases + Profile
  if (capabilities.isHCEngineer) {
    return (
      <Tabs screenOptions={screenOpts}>
        <Tabs.Screen name="home"       options={{ title: 'Home',   tabBarIcon: icon('home-variant') }} />
        <Tabs.Screen name="tasks"      options={{ title: 'Cases',  tabBarIcon: icon('clipboard-text') }} />
        <Tabs.Screen name="profile"    options={{ title: 'Profile',tabBarIcon: icon('account-circle') }} />
        <Tabs.Screen name="dashboard"  options={{ href: null }} />
        <Tabs.Screen name="checklists" options={{ href: null }} />
        <Tabs.Screen name="assignments" options={{ href: null }} />
        <Tabs.Screen name="soft-requests" options={{ href: null }} />
      </Tabs>
    );
  }

  // ── Healthcare Admin: Home + Assets + Cases + Users + Profile
  if (capabilities.isHCAdmin) {
    return (
      <Tabs screenOptions={screenOpts}>
        <Tabs.Screen name="home"       options={{ title: 'Home',    tabBarIcon: icon('home-variant') }} />
        <Tabs.Screen name="dashboard"  options={{ title: 'Assets',  tabBarIcon: icon('database') }} />
        <Tabs.Screen name="tasks"      options={{ title: 'Cases',   tabBarIcon: icon('clipboard-text') }} />
        <Tabs.Screen name="assignments" options={{ title: 'Users',  tabBarIcon: icon('account-group') }} />
        <Tabs.Screen name="profile"    options={{ title: 'Profile', tabBarIcon: icon('account-circle') }} />
        <Tabs.Screen name="checklists" options={{ href: null }} />
        <Tabs.Screen name="soft-requests" options={{ href: null }} />
      </Tabs>
    );
  }

  // ── Legacy / non-HC roles (original layout)
  return (
    <Tabs screenOptions={screenOpts}>
      <Tabs.Screen name="home"     options={{ title: 'Home',      tabBarIcon: icon('home-variant') }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: icon('chart-donut') }} />
      <Tabs.Screen name="checklists" options={{
        title: 'Checklists', tabBarIcon: icon('clipboard-check'),
        href: (capabilities.isTechnicalSupervisor || capabilities.isTechnician) ? undefined : null,
      }} />
      <Tabs.Screen name="tasks" options={{
        title: 'Tasks', tabBarIcon: icon('format-list-checks'),
        href: capabilities.isTechnicalSupervisor ? undefined : null,
      }} />
      <Tabs.Screen name="assignments" options={{
        title: 'Team', tabBarIcon: icon('account-group'),
        href: capabilities.isTechnicalSupervisor ? undefined : null,
      }} />
      <Tabs.Screen name="soft-requests" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('account-circle') }} />
    </Tabs>
  );
}
