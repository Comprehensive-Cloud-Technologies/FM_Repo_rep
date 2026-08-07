import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { logout, logoutUser, getStoredCompany } from '../../utils/api';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../../utils/theme';
import type { RoleCapabilities } from '../../utils/permissions';

function CapBadge({ label, active }: { label: string; active: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.capBadge, { backgroundColor: active ? theme.primaryBg : theme.surfaceAlt, borderColor: active ? theme.primary + '50' : theme.border }]}>
      <MaterialCommunityIcons name={active ? 'check-circle' : 'circle-outline'} size={14} color={active ? theme.primary : theme.textMuted} />
      <Text style={[styles.capText, { color: active ? theme.primary : theme.textMuted }]}>{label}</Text>
    </View>
  );
}

const CAP_LABELS: { key: keyof RoleCapabilities; label: string }[] = [
  { key: 'isTechnicalSupervisor', label: 'Technical Supervisor' },
  { key: 'isTechnician',          label: 'Technician'           },
  { key: 'isSoftManager',         label: 'Soft Service Manager' },
  { key: 'canResolveSoftIssue',   label: 'Resolve Soft Issues'  },
  { key: 'canRaiseSoftIssue',     label: 'Raise Soft Issues'    },
];

export default function ProfileTab() {
  const { theme, isDark, setPreference, preference } = useTheme();
  const { user, capabilities, clearUser } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        // Keep company in storage so app returns to login, not company-code entry
        const company = await getStoredCompany();
        await logoutUser();
        clearUser();
        if (company) {
          router.replace({
            pathname: '/login',
            params: { companyId: String(company.companyId), companyName: company.companyName },
          });
        } else {
          // Fallback: full clear, go to company code screen
          await logout();
          router.replace('/');
        }
      }},
    ]);
  };

  const toggleTheme = () => {
    setPreference(isDark ? 'light' : 'dark');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Avatar + name */}
        <View style={[styles.hero, Shadows.sm, { backgroundColor: theme.surface }]}>
          <View style={[styles.avatarRing, { backgroundColor: theme.primaryBg }]}>
            <View style={[styles.avatar, Shadows.brand, { backgroundColor: theme.primary }]}>
              <Text style={styles.avatarText}>{(user?.fullName ?? 'U').charAt(0).toUpperCase()}</Text>
            </View>
          </View>
          <Text style={[styles.name, { color: theme.textPrimary }]}>{user?.fullName}</Text>
          <Text style={[styles.company, { color: theme.textSecondary }]}>{user?.companyName}</Text>
          <View style={[styles.rolePill, { backgroundColor: theme.primaryBg }]}>
            <MaterialCommunityIcons name="shield-account" size={13} color={theme.primary} />
            <Text style={[styles.roleText, { color: theme.primary }]}>{user?.role ?? 'Employee'}</Text>
          </View>
        </View>

        {/* Settings */}
        <View style={[styles.section, Shadows.sm, { backgroundColor: theme.surface }]}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Settings</Text>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.menuIcon, { backgroundColor: theme.secondary + '18' }]}>
                <MaterialCommunityIcons name="weather-night" size={20} color={theme.secondary} />
              </View>
              <Text style={[styles.settingLabel, { color: theme.textPrimary }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={isDark ? '#fff' : theme.textMuted}
            />
          </View>
        </View>

        {/* Menu items */}
        <View style={[styles.section, styles.sectionPad, Shadows.sm, { backgroundColor: theme.surface }]}>
          {[
            { icon: 'history',       label: 'Submission History', color: theme.primary, onPress: () => router.push('/history')      },
            { icon: 'alert-outline', label: 'My Warnings',        color: theme.warning, onPress: () => router.push('/warnings')     },
            { icon: 'school-outline',label: 'Training',           color: theme.success, onPress: () => router.push('/training')     },
            { icon: 'bell-outline',  label: 'Notifications',      color: theme.info,    onPress: () => router.push('/notifications') },
          ].map((item, idx, arr) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.borderLight }]}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.color + '18' }]}>
                <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>{item.label}</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign out */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: theme.danger + '50', backgroundColor: theme.dangerBg }]} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={20} color={theme.danger} />
          <Text style={[styles.logoutText, { color: theme.danger }]}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: theme.textMuted }]}>FM App v2.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.xxl },
  hero:         { alignItems: 'center', paddingVertical: Spacing.xl, borderRadius: Radius.xxl },
  avatarRing:   { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  avatar:       { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 30, color: '#fff', fontWeight: '800' },
  name:         { ...Typography.h2, marginBottom: 4 },
  company:      { ...Typography.body, marginBottom: Spacing.md },
  rolePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  roleText:     { ...Typography.label, textTransform: 'capitalize' },
  section:      { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md },
  sectionPad:   { paddingVertical: Spacing.xs },
  sectionTitle: { ...Typography.h4 },
  sectionSub:   { ...Typography.bodyS, marginTop: -Spacing.sm },
  capsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  capBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1 },
  capText:      { ...Typography.micro },
  settingRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  settingLabel: { ...Typography.body, fontWeight: '600' },
  menuIcon:     { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  menuLabel:    { ...Typography.body, fontWeight: '600', flex: 1 },
  logoutBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  logoutText:   { ...Typography.h4 },
  version:      { ...Typography.micro, textAlign: 'center' },
});
