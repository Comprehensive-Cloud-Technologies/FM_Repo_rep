/**
 * Screen-level RBAC guard.
 *
 * Wrap a screen's default export so it renders only when the signed-in user
 * holds the required permission. Reachable-but-forbidden screens (deep links,
 * stale navigation) show a friendly "No access" panel instead of a form the
 * server would 403 anyway.
 *
 *   export default withPermission(RegisterAssetScreen, 'asset:create');
 *
 * While the permission list is still loading (empty), access is allowed so the
 * screen never flash-blocks before permissions arrive; the server remains the
 * real gate.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Typography } from '../utils/theme';

function NoAccess() {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.wrap}>
        <View style={[styles.iconWrap, { backgroundColor: theme.dangerBg }]}>
          <MaterialCommunityIcons name="lock-outline" size={34} color={theme.danger} />
        </View>
        <Text style={[styles.title, { color: theme.textPrimary }]}>You don't have access</Text>
        <Text style={[styles.msg, { color: theme.textSecondary }]}>
          This screen isn't available for your role. Ask your administrator if you need access.
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary }]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color="#fff" />
          <Text style={styles.btnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  permission: string,
) {
  return function Guarded(props: P) {
    const { can, isLoaded } = useAuth();
    // Allow only while auth is still loading; once loaded, enforce strictly
    // (an explicitly-empty permission set correctly blocks access).
    const allowed = !isLoaded ? true : can(permission);
    if (!allowed) return <NoAccess />;
    return <Component {...props} />;
  };
}

const styles = StyleSheet.create({
  safe:     { flex: 1 },
  wrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  title:    { ...Typography.h3, textAlign: 'center' },
  msg:      { ...Typography.body, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  btn:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm },
  btnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});
