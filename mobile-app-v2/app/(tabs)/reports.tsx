import { router, useFocusEffect } from 'expo-router';
import { withPermission } from '../../components/withPermission';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchWorkOrders } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme, Spacing, Radius, Shadows, Typography } from '../../utils/theme';

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, theme, onPress }: {
  icon: string; label: string; value: string | number; color: string; theme: any; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.kpiCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress} activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[styles.kpiIcon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color: theme.textPrimary }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
function ReportsTab() {
  const { theme } = useTheme();
  const { user }  = useAuth();
  const [myOrders,   setMyOrders]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const mine = await fetchWorkOrders({ assignedToMe: true });
      const arr = Array.isArray(mine) ? mine as any[] : (mine as any)?.data ?? [];
      setMyOrders(arr);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); void load(); };

  const now         = Date.now();
  const total       = myOrders.length;
  const open        = myOrders.filter(o => o.status === 'open').length;
  const inProgress  = myOrders.filter(o => o.status === 'in_progress').length;
  const completed   = myOrders.filter(o => o.status === 'completed').length;
  const overdue     = myOrders.filter(o =>
    o.status !== 'completed' && o.dueDate && new Date(o.dueDate).getTime() < now
  ).length;
  const closureRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />

      {/* Blue header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View>
          <Text style={styles.headerTitle}>My Work Orders</Text>
          <Text style={styles.headerSub}>{user?.fullName ?? user?.companyName ?? 'Overview'}</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={onRefresh}>
          <MaterialCommunityIcons name="refresh" size={20} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={theme.primary} />
        ) : (
          <>
            {/* KPI card grid */}
            <View style={styles.kpiGrid}>
              <KpiCard icon="format-list-bulleted" label="Total Assigned" value={total}      color={theme.primary} theme={theme} onPress={() => router.push('/(tabs)/requests')} />
              <KpiCard icon="alert-circle-outline" label="Open"           value={open}       color={theme.info}    theme={theme} onPress={() => router.push('/(tabs)/requests')} />
              <KpiCard icon="progress-wrench"      label="In Progress"    value={inProgress} color={theme.warning} theme={theme} onPress={() => router.push('/(tabs)/requests')} />
              <KpiCard icon="check-circle-outline" label="Completed"      value={completed}  color={theme.success} theme={theme} onPress={() => router.push('/(tabs)/requests')} />
              {overdue > 0 && (
                <KpiCard icon="clock-alert-outline" label="Overdue" value={overdue} color={theme.danger} theme={theme} onPress={() => router.push('/(tabs)/requests')} />
              )}
              <KpiCard icon="percent-outline" label="Closure Rate" value={`${closureRate}%`}
                color={closureRate >= 70 ? theme.success : closureRate >= 40 ? theme.warning : theme.danger}
                theme={theme} />
            </View>

            {/* Status breakdown bar chart */}
            <View style={[styles.barCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.barCardTitle, { color: theme.textPrimary }]}>Status Breakdown</Text>
              {[
                { label: 'Open',        value: open,       color: theme.primary },
                { label: 'In Progress', value: inProgress, color: theme.warning },
                { label: 'Completed',   value: completed,  color: theme.success },
                ...(overdue > 0 ? [{ label: 'Overdue', value: overdue, color: theme.danger }] : []),
              ].map(d => {
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <View key={d.label} style={styles.barRow}>
                    <Text style={[styles.barLabel, { color: theme.textSecondary }]}>{d.label}</Text>
                    <View style={[styles.barTrack, { backgroundColor: theme.border }]}>
                      <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: d.color }]} />
                    </View>
                    <Text style={[styles.barValue, { color: theme.textPrimary }]}>{d.value}</Text>
                  </View>
                );
              })}
            </View>

            {/* View all requests CTA */}
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '50' }]}
              onPress={() => router.push('/(tabs)/requests')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="briefcase-check-outline" size={20} color={theme.primary} />
              <Text style={[styles.ctaText, { color: theme.primary }]}>View All Requests</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.primary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  headerTitle: { ...Typography.h3, color: '#fff' },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingBottom: 120, paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg, gap: Spacing.lg },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  kpiCard: { width: '47.5%', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs, alignItems: 'center', ...Shadows.sm },
  kpiIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: 26, fontWeight: '800' },
  kpiLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

  barCard:      { borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md, ...Shadows.sm },
  barCardTitle: { ...Typography.h4 },
  barRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barLabel:     { fontSize: 12, fontWeight: '600', width: 86 },
  barTrack:     { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill:      { height: '100%', borderRadius: 5, minWidth: 4 },
  barValue:     { fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },

  cta:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1 },
  ctaText: { fontSize: 15, fontWeight: '700' },
});

export default withPermission(ReportsTab, 'report:view');
