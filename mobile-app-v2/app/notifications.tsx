import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Clipboard, RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../utils/api';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../utils/theme';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';

// Extract a 6-digit close code from notification message if present
function extractCloseCode(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = message.match(/\b(\d{6})\b/);
  return m ? m[1] : null;
}

// Icon per notification type
function NotifIcon({ type, theme }: { type: string; theme: any }) {
  const map: Record<string, { name: string; color: string; bg: string }> = {
    request_resolved: { name: 'check-decagram',    color: '#16a34a', bg: '#dcfce7' },
    request_assigned: { name: 'account-arrow-right', color: '#2563eb', bg: '#dbeafe' },
    request_closed:   { name: 'lock-check',         color: '#475569', bg: '#f1f5f9' },
    calibration_due:  { name: 'calendar-alert',     color: '#d97706', bg: '#fef9c3' },
    flag_raised:      { name: 'flag',               color: '#dc2626', bg: '#fee2e2' },
  };
  const s = map[type] ?? { name: 'bell', color: theme.primary, bg: theme.primaryBg };
  return (
    <View style={{ width: 40, height: 40, borderRadius: Radius.md, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <MaterialCommunityIcons name={s.name as any} size={20} color={s.color} />
    </View>
  );
}

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
  };

  const handlePress = async (n: any) => {
    if (!n.isRead) {
      await markNotificationRead(n.id).catch(() => {});
      setItems((prev) => prev.map((i) => i.id === n.id ? { ...i, isRead: true } : i));
    }
    if (n.targetScreen) router.push(n.targetScreen);
  };

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    Alert.alert('Copied!', `Close code ${code} copied to clipboard.`);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header
        title="Notifications"
        showBack
        right={
          <TouchableOpacity onPress={handleMarkAll}>
            <Text style={[styles.markAll, { color: theme.primary }]}>Mark all read</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={items.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <EmptyState icon="bell-outline" title="No notifications" message="You're all caught up!" />
          ) : items.map((n) => {
            const closeCode = n.type === 'request_resolved' ? extractCloseCode(n.body ?? n.message) : null;
            return (
              <TouchableOpacity
                key={n.id}
                style={[
                  styles.card,
                  Shadows.sm,
                  {
                    backgroundColor: n.isRead ? theme.surface : theme.primaryBg,
                    borderColor: n.isRead ? theme.borderLight : theme.primaryLight + '55',
                  },
                ]}
                onPress={() => handlePress(n)}
                activeOpacity={0.8}
              >
                <NotifIcon type={n.type} theme={theme} />

                <View style={{ flex: 1, gap: 4 }}>
                  {/* Unread dot inline */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {!n.isRead && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
                    <Text style={[styles.title, { color: theme.textPrimary, fontWeight: n.isRead ? '500' : '700', flex: 1 }]} numberOfLines={2}>
                      {n.title ?? n.message}
                    </Text>
                  </View>

                  {/* Full message body */}
                  {n.body && n.body !== n.title ? (
                    <Text style={[styles.body, { color: theme.textSecondary }]}>{n.body}</Text>
                  ) : null}

                  {/* ── Close code highlight box ── */}
                  {closeCode ? (
                    <View style={styles.codeBox}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.codeLabel}>YOUR CLOSE CODE</Text>
                        <Text style={styles.codeValue}>{closeCode}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => handleCopyCode(closeCode)}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="content-copy" size={14} color="#166534" />
                        <Text style={styles.copyBtnText}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/* Quick action for resolved notifications */}
                  {n.type === 'request_resolved' ? (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => router.push('/my-requests')}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="check-circle-outline" size={15} color="#fff" />
                      <Text style={styles.actionBtnText}>Go to My Requests →</Text>
                    </TouchableOpacity>
                  ) : n.type === 'request_assigned' ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#2563eb' }]}
                      onPress={() => router.push('/assigned-queries')}
                      activeOpacity={0.85}
                    >
                      <MaterialCommunityIcons name="wrench-outline" size={15} color="#fff" />
                      <Text style={styles.actionBtnText}>View Assigned Issues →</Text>
                    </TouchableOpacity>
                  ) : null}

                  <Text style={[styles.time, { color: theme.textMuted }]}>
                    {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  markAll: { ...Typography.label },
  list:    { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 40 },
  card:    {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1,
  },
  dot:     { width: 7, height: 7, borderRadius: 4, marginTop: 2, flexShrink: 0 },
  title:   { ...Typography.body },
  body:    { ...Typography.bodyS, lineHeight: 18 },
  time:    { ...Typography.micro, marginTop: Spacing.xs },

  // Close code box
  codeBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#dcfce7', borderRadius: Radius.md, padding: Spacing.sm,
    borderWidth: 1, borderColor: '#86efac', marginTop: 4,
  },
  codeLabel: { fontSize: 9, fontWeight: '700', color: '#166534', letterSpacing: 1, textTransform: 'uppercase' },
  codeValue: { fontSize: 22, fontWeight: '900', color: '#15803d', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  copyBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: '#bbf7d0' },
  copyBtnText: { fontSize: 11, fontWeight: '700', color: '#166534' },

  // Action button
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#166534', borderRadius: Radius.md,
    paddingVertical: 7, paddingHorizontal: 12,
    alignSelf: 'flex-start', marginTop: 4,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});

