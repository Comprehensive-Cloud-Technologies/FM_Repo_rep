import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Image, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  fetchWorkOrderStats, fetchWorkOrders,
  fetchMyPmsStats, fetchMyTrainings,
} from '../../utils/api';
import { useTheme, Spacing, Radius, Typography, Shadows } from '../../utils/theme';

const LOGO = require('../../assets/images/AssetPro.jpg');

// ─── Module card (Trainings, PMS, Calibration…) ───────────────────────────────
function ModuleCard({ icon, label, value, sub, color, theme, onPress }: {
  icon: string; label: string; value: string | number; sub?: string; color: string; theme: any; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.modCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress} activeOpacity={0.8}
    >
      <View style={[styles.modIcon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.modValue, { color: theme.textPrimary }]}>{value}</Text>
      <Text style={[styles.modLabel, { color: theme.textPrimary }]}>{label}</Text>
      {sub ? <Text style={[styles.modSub, { color: theme.textMuted }]}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Recent WO row ────────────────────────────────────────────────────────────
function WORow({ item, theme }: { item: any; theme: any }) {
  const s: string = item.status ?? 'open';
  const sc = s === 'completed' ? theme.success : s === 'in_progress' ? theme.warning : theme.primary;
  const sl = s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1);
  const now = Date.now();
  const isOverdue = s !== 'completed' && item.expectedCompletionAt && new Date(item.expectedCompletionAt).getTime() < now;

  return (
    <TouchableOpacity
      style={[styles.woRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push({ pathname: '/work-order-details', params: { orderId: String(item.id) } })}
      activeOpacity={0.75}
    >
      <View style={[styles.woStripe, { backgroundColor: isOverdue ? theme.danger : sc }]} />
      <View style={styles.woBody}>
        <Text style={[styles.woTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.issueDescription ?? item.assetName ?? item.workOrderNumber ?? `WO-${item.id}`}
        </Text>
        <Text style={[styles.woSub, { color: theme.textMuted }]} numberOfLines={1}>
          {item.assetName ?? item.location ?? '—'}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: sc + '18' }]}>
        <Text style={[styles.statusText, { color: sc }]}>{sl}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardTab() {
  const { theme } = useTheme();
  const { user }  = useAuth();
  const [stats,      setStats]      = useState<any>(null);
  const [pms,        setPms]        = useState<any>(null);
  const [trainings,  setTrainings]  = useState<any[]>([]);
  const [recent,     setRecent]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [st, wo, pm, tr] = await Promise.allSettled([
        fetchWorkOrderStats(),
        fetchWorkOrders(),
        fetchMyPmsStats(),
        fetchMyTrainings(),
      ]);
      if (st.status === 'fulfilled') setStats(st.value);
      if (wo.status === 'fulfilled') {
        const arr = Array.isArray(wo.value) ? wo.value as any[] : (wo.value as any)?.data ?? [];
        setRecent(arr.slice(0, 6));
      }
      if (pm.status === 'fulfilled') setPms(pm.value);
      if (tr.status === 'fulfilled') {
        const arr = Array.isArray(tr.value) ? tr.value as any[] : (tr.value as any)?.data ?? [];
        setTrainings(arr);
      }
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); void load(); };

  const total       = stats?.total      ?? 0;
  const open        = stats?.open       ?? 0;
  const inProgress  = stats?.inProgress ?? 0;
  const completed   = stats?.completed  ?? 0;
  const overdue     = stats?.overdue    ?? 0;
  const closureRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const trainingCount   = trainings.length;
  const trainingUpcoming = trainings.filter(t =>
    (t.status ?? '').toLowerCase() === 'scheduled' || (t.status ?? '').toLowerCase() === 'upcoming'
  ).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />

      {/* Blue sticky header with logo */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Dashboard</Text>
          <Text style={styles.headerSub}>{user?.companyName ?? 'Company Overview'}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
            <MaterialCommunityIcons name="refresh" size={19} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          <View style={styles.logoWrap}>
            <Image source={LOGO} style={styles.logo} resizeMode="cover" />
          </View>
        </View>
      </View>

      {loading ? (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.background }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {/* ── Requests hero band ─────────────────────────── */}
          <View style={[styles.hero, { backgroundColor: theme.primary }]}>
            <View style={styles.heroTop}>
              <Text style={styles.heroTitle}>Requests</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/requests')} style={styles.heroLink} activeOpacity={0.7}>
                <Text style={styles.heroLinkText}>View all</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
            </View>
            <View style={styles.heroStats}>
              <TouchableOpacity style={styles.heroStat} onPress={() => router.push('/(tabs)/requests')} activeOpacity={0.7}>
                <Text style={styles.heroNum}>{open}</Text>
                <View style={styles.heroLabelRow}>
                  <View style={[styles.dot, { backgroundColor: '#93C5FD' }]} />
                  <Text style={styles.heroLabel}>Open</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.heroDivider} />
              <TouchableOpacity style={styles.heroStat} onPress={() => router.push('/(tabs)/requests')} activeOpacity={0.7}>
                <Text style={styles.heroNum}>{inProgress}</Text>
                <View style={styles.heroLabelRow}>
                  <View style={[styles.dot, { backgroundColor: '#FCD34D' }]} />
                  <Text style={styles.heroLabel}>In Progress</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.heroDivider} />
              <TouchableOpacity style={styles.heroStat} onPress={() => router.push('/(tabs)/requests')} activeOpacity={0.7}>
                <Text style={styles.heroNum}>{completed}</Text>
                <View style={styles.heroLabelRow}>
                  <View style={[styles.dot, { backgroundColor: '#86EFAC' }]} />
                  <Text style={styles.heroLabel}>Completed</Text>
                </View>
              </TouchableOpacity>
            </View>
            {/* segmented progress */}
            {total > 0 && (
              <View style={styles.segTrack}>
                <View style={{ flex: open,       backgroundColor: '#93C5FD' }} />
                <View style={{ flex: inProgress, backgroundColor: '#FCD34D' }} />
                <View style={{ flex: completed,  backgroundColor: '#86EFAC' }} />
              </View>
            )}
            <View style={styles.heroFooter}>
              <Text style={styles.heroFootText}>{total} total requests</Text>
              {overdue > 0 && (
                <View style={styles.overduePill}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={12} color="#fff" />
                  <Text style={styles.overdueText}>{overdue} overdue</Text>
                </View>
              )}
              <Text style={[styles.heroFootText, { marginLeft: 'auto' }]}>{closureRate}% closed</Text>
            </View>
          </View>

          {/* ── Modules ────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Modules</Text>
          <View style={styles.modGrid}>
            <ModuleCard
              icon="school-outline" label="Trainings" color="#7C3AED" theme={theme}
              value={trainingCount}
              sub={trainingUpcoming > 0 ? `${trainingUpcoming} upcoming` : 'View sessions'}
              onPress={() => router.push('/training')}
            />
            <ModuleCard
              icon="calendar-clock" label="PMS" color={theme.warning} theme={theme}
              value={pms?.total ?? 0}
              sub={pms ? `${pms.completed ?? 0} done · ${pms.assigned ?? 0} due` : 'Scheduler'}
              onPress={() => router.push('/pms-assignments')}
            />
            <ModuleCard
              icon="package-variant" label="Assets" color={theme.primary} theme={theme}
              value="›" sub="Browse assets"
              onPress={() => router.push('/(tabs)/assets')}
            />
            <ModuleCard
              icon="chart-bar" label="Reports" color={theme.success} theme={theme}
              value="›" sub="My performance"
              onPress={() => router.push('/(tabs)/reports')}
            />
          </View>

          {/* PMS mini-breakdown */}
          {pms && (pms.total ?? 0) > 0 && (
            <View style={[styles.pmsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.pmsHeader}>
                <MaterialCommunityIcons name="calendar-clock" size={18} color={theme.warning} />
                <Text style={[styles.pmsTitle, { color: theme.textPrimary }]}>PMS Schedule</Text>
                <TouchableOpacity onPress={() => router.push('/pms-assignments')} style={{ marginLeft: 'auto' }}>
                  <Text style={[styles.seeAll, { color: theme.primary }]}>Open</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pmsRow}>
                {[
                  { label: 'Assigned',    value: pms.assigned ?? 0,   color: theme.primary },
                  { label: 'In Progress', value: pms.inProgress ?? 0, color: theme.warning },
                  { label: 'Completed',   value: pms.completed ?? 0,  color: theme.success },
                  { label: 'Missed',      value: pms.missed ?? 0,     color: theme.danger },
                ].map(p => (
                  <View key={p.label} style={styles.pmsStat}>
                    <Text style={[styles.pmsNum, { color: p.color }]}>{p.value}</Text>
                    <Text style={[styles.pmsLabel, { color: theme.textMuted }]}>{p.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Recent work orders ─────────────────────────── */}
          {recent.length > 0 && (
            <>
              <View style={styles.recentHeader}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>Recent Requests</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/requests')}>
                  <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.woList}>
                {recent.map(item => <WORow key={item.id} item={item} theme={theme} />)}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.md },
  headerLeft:  { flex: 1 },
  headerTitle: { ...Typography.h3, color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  refreshBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  logoWrap:    { width: 40, height: 40, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', padding: 2 },
  logo:        { width: '100%', height: '100%', borderRadius: 10 },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 90, gap: Spacing.lg },

  // Requests hero band
  hero:      { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md, ...Shadows.md },
  heroTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  heroLink:  { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroLinkText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStat:  { flex: 1, alignItems: 'center', gap: 4 },
  heroNum:   { fontSize: 30, fontWeight: '900', color: '#fff', lineHeight: 34 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  dot:       { width: 7, height: 7, borderRadius: 4 },
  heroDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  segTrack:  { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heroFootText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  overduePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(239,68,68,0.85)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  overdueText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  sectionTitle: { ...Typography.h4 },

  // Module cards
  modGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  modCard: { width: '47.5%', borderRadius: Radius.lg, padding: Spacing.md, gap: 4, borderWidth: 1, ...Shadows.sm },
  modIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  modValue: { fontSize: 24, fontWeight: '800' },
  modLabel: { fontSize: 14, fontWeight: '700' },
  modSub:   { fontSize: 11, fontWeight: '500' },

  // PMS card
  pmsCard:   { borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, gap: Spacing.md, ...Shadows.sm },
  pmsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  pmsTitle:  { ...Typography.h4 },
  pmsRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  pmsStat:   { alignItems: 'center', gap: 2, flex: 1 },
  pmsNum:    { fontSize: 22, fontWeight: '800' },
  pmsLabel:  { fontSize: 11, fontWeight: '600' },

  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seeAll:       { fontSize: 13, fontWeight: '700' },

  woList:   { gap: Spacing.sm },
  woRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', ...Shadows.sm },
  woStripe: { width: 4, alignSelf: 'stretch' },
  woBody:   { flex: 1, padding: Spacing.md, gap: 3 },
  woTitle:  { ...Typography.bodyS, fontWeight: '700' },
  woSub:    { fontSize: 11 },
  statusPill: { marginRight: Spacing.md, paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
});
