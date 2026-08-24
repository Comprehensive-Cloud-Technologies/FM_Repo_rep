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
  fetchCaseLogDashboard, fetchCaseLogs,
  fetchMyPmsStats, fetchMyTrainings,
} from '../../utils/api';
import { useTheme, Spacing, Radius, Shadows, Typography } from '../../utils/theme';

const LOGO = require('../../assets/images/AssetPro.jpg');

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color, onPress }: {
  label: string; value: string | number; icon: string; color: string; onPress?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress} activeOpacity={onPress ? 0.75 : 1}
    >
      <View style={[styles.statIconBox, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Quick action tile ────────────────────────────────────────────────────────
function ActionTile({ icon, label, color, onPress }: {
  icon: string; label: string; color: string; onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.actionTile, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress} activeOpacity={0.75}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={24} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Module card (Trainings / PMS) ────────────────────────────────────────────
function ModuleCard({ icon, label, value, sub, color, onPress }: {
  icon: string; label: string; value: string | number; sub?: string; color: string; onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.modCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress} activeOpacity={0.8}
    >
      <View style={[styles.modIcon, { backgroundColor: color + '18' }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[styles.modValue, { color: theme.textPrimary }]}>{value}</Text>
          <Text style={[styles.modLabel, { color: theme.textPrimary }]}>{label}</Text>
        </View>
        {sub ? <Text style={[styles.modSub, { color: theme.textMuted }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Recent work order row ────────────────────────────────────────────────────
function OrderRow({ item, theme }: { item: any; theme: any }) {
  const status: string = item.status ?? 'open';
  const statusColor =
    (status === 'completed' || status === 'resolved' || status === 'closed') ? theme.success :
    status === 'in_progress' ? theme.warning :
    theme.primary;
  const statusLabel =
    status === 'in_progress' ? 'In Progress' :
    status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <TouchableOpacity
      style={[styles.orderRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push({
        pathname: '/hc-case-log-detail',
        params: { id: String(item.id), sourceType: item.source_type ?? 'work_order' },
      })}
      activeOpacity={0.75}
    >
      <View style={[styles.orderStripe, { backgroundColor: statusColor }]} />
      <View style={styles.orderBody}>
        <Text style={[styles.orderTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.issue_description ?? item.asset_name ?? item.work_order_number ?? `Request #${item.id}`}
        </Text>
        <Text style={[styles.orderSub, { color: theme.textMuted }]} numberOfLines={1}>
          {item.asset_name ?? item.location ?? '—'}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function HomeTab() {
  const { theme } = useTheme();
  const { user, capabilities } = useAuth();
  const [caseLogs, setCaseLogs]               = useState<any[]>([]);   // merged WO + AQ assigned to / raised by me
  const [stats, setStats]                     = useState<any>(null);
  const [pms, setPms]                         = useState<any>(null);
  const [trainings, setTrainings]             = useState<any[]>([]);
  const [newTrainings, setNewTrainings]       = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [st, cl, pm, tr] = await Promise.allSettled([
        fetchCaseLogDashboard(),   // combined open/in-progress/resolved counts (role-filtered)
        fetchCaseLogs(),           // merged WO + AQ list for this user
        fetchMyPmsStats(),
        fetchMyTrainings(),
      ]);
      if (st.status === 'fulfilled') setStats(st.value);
      if (cl.status === 'fulfilled') setCaseLogs(Array.isArray(cl.value) ? cl.value : []);
      if (pm.status === 'fulfilled') setPms(pm.value);
      if (tr.status === 'fulfilled') {
        const arr = Array.isArray(tr.value) ? tr.value as any[] : (tr.value as any)?.data ?? [];
        setTrainings(arr);
        // Show new/pending trainings as alerts
        const pending = arr.filter((t: any) =>
          ['assigned', 'pending', 'scheduled', 'upcoming'].includes(
            (t.status ?? t.assignmentStatus ?? '').toLowerCase()
          )
        );
        setNewTrainings(pending);
      }
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); void load(true); };

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  // Combined counts from the case-log dashboard (WO + AQ)
  const open       = stats?.open       ?? caseLogs.filter(o => o.status === 'open').length;
  const inProgress = (stats?.inProgress ?? 0) + (stats?.assigned ?? 0);
  const completed  = (stats?.resolved  ?? 0) + (stats?.closed ?? 0);
  const total      = stats?.total      ?? caseLogs.length;
  const overdue    = 0;

  // Actionable case logs assigned to me → shown as alerts, tap opens the issue detail
  const actionable = caseLogs.filter((c: any) =>
    ['open', 'assigned', 'in_progress'].includes((c.status ?? '').toLowerCase())
  );
  const recent     = caseLogs.slice(0, 5);

  const trainingCount    = trainings.length;
  const trainingUpcoming = trainings.filter(t =>
    ['scheduled', 'upcoming'].includes((t.status ?? '').toLowerCase())
  ).length;

  const totalAlerts = actionable.length + newTrainings.length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#E8F1FF' }]} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#E8F1FF" />

      {/* Light header */}
      <View style={[styles.header, { backgroundColor: '#E8F1FF' }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.greeting, { color: '#4B7BE5' }]}>{greeting},</Text>
          <Text style={[styles.userName, { color: '#1A2C5A' }]} numberOfLines={1}>{user?.fullName ?? 'Welcome'}</Text>
          <Text style={[styles.companySub, { color: '#6B84B0' }]} numberOfLines={1}>{user?.companyName}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.logoWrap}>
            <Image source={LOGO} style={styles.logo} resizeMode="cover" />
          </View>
        </View>
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
            {/* Admin entry — HC admins only */}
            {capabilities?.isHCAdmin && (
              <TouchableOpacity
                style={[styles.adminBanner, { backgroundColor: theme.surface, borderColor: theme.primary + '40' }]}
                onPress={() => router.push('/admin-dashboard')}
                activeOpacity={0.85}
              >
                <View style={[styles.adminIcon, { backgroundColor: theme.primaryBg }]}>
                  <MaterialCommunityIcons name="view-dashboard-outline" size={22} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.adminTitle, { color: theme.textPrimary }]}>Admin Dashboard</Text>
                  <Text style={[styles.adminSub, { color: theme.textMuted }]}>Multi-company profiles & management</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.primary} />
              </TouchableOpacity>
            )}

            {/* Overview — Requests count hero */}
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Overview</Text>
            <View style={[styles.hero, { backgroundColor: theme.primary }]}>
              <View style={styles.heroTopRow}>
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
              {total > 0 && (
                <View style={styles.segTrack}>
                  <View style={{ flex: open,       backgroundColor: '#93C5FD' }} />
                  <View style={{ flex: inProgress, backgroundColor: '#FCD34D' }} />
                  <View style={{ flex: completed,  backgroundColor: '#86EFAC' }} />
                </View>
              )}
              <View style={styles.heroFooter}>
                <Text style={styles.heroFootText}>{total} total</Text>
                {overdue > 0 && (
                  <View style={styles.overduePill}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={12} color="#fff" />
                    <Text style={styles.overdueText}>{overdue} overdue</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Modules — Trainings + PMS */}
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Modules</Text>
            <View style={styles.modGrid}>
              <ModuleCard
                icon="school-outline" label="Trainings" color="#7C3AED"
                value={trainingCount}
                sub={trainingUpcoming > 0 ? `${trainingUpcoming} upcoming` : 'View sessions'}
                onPress={() => router.push('/training')}
              />
              <ModuleCard
                icon="calendar-clock" label="PMS" color={theme.warning}
                value={pms?.total ?? 0}
                sub={pms ? `${pms.completed ?? 0} done · ${pms.assigned ?? 0} due` : 'Scheduler'}
                onPress={() => router.push('/pms-assignments')}
              />
            </View>

            {/* Quick actions */}
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <ActionTile icon="package-variant"        label="Assets"      color={theme.primary}  onPress={() => router.push('/(tabs)/assets')} />
              <ActionTile icon="briefcase-check-outline" label="Requests"   color={theme.warning}  onPress={() => router.push('/(tabs)/requests')} />
              <ActionTile icon="chart-bar"              label="Reports"     color={theme.success}  onPress={() => router.push('/(tabs)/reports')} />
              <ActionTile icon="qrcode-scan"            label="Scan QR"     color={theme.info}     onPress={() => router.push('/qr-scanner')} />
              <ActionTile icon="clipboard-check"        label="Checklists"  color="#7C3AED"        onPress={() => router.push('/(tabs)/checklists')} />
              <ActionTile icon="bell-outline"           label="Alerts"      color={theme.danger}   onPress={() => router.push('/notifications')} />
            </View>

            {/* Alerts — assigned requests, case logs & trainings */}
            {(actionable.length > 0 || newTrainings.length > 0) && (
              <>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Alerts</Text>
                <View style={styles.alertList}>
                  {actionable.map((c, i) => {
                    const st = (c.status ?? '').toLowerCase();
                    const sub =
                      st === 'in_progress' ? 'In Progress · Tap to resolve' :
                      st === 'assigned'    ? 'Assigned · Tap to start' :
                                             'Tap to view & start';
                    return (
                      <TouchableOpacity
                        key={`cl-${c.source_type ?? 'wo'}-${c.id ?? i}`}
                        style={[styles.alertRow, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
                        onPress={() => router.push({
                          pathname: '/hc-case-log-detail',
                          params: { id: String(c.id), sourceType: c.source_type ?? 'work_order' },
                        })}
                        activeOpacity={0.8}
                      >
                        <View style={[styles.alertRowIcon, { backgroundColor: '#FEE2C6' }]}>
                          <MaterialCommunityIcons name="clipboard-alert-outline" size={18} color="#EA580C" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.alertRowTitle, { color: '#92400E' }]} numberOfLines={1}>
                            {c.issue_description ?? c.asset_name ?? c.work_order_number ?? `Request #${c.id}`}
                          </Text>
                          <Text style={[styles.alertRowSub, { color: '#B45309' }]}>
                            {c.asset_name ? `${c.asset_name} · ` : ''}{sub}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#EA580C" />
                      </TouchableOpacity>
                    );
                  })}
                  {newTrainings.map((tr, i) => (
                    <TouchableOpacity
                      key={`tr-${tr.id ?? i}`}
                      style={[styles.alertRow, { backgroundColor: '#F3E8FF', borderColor: '#C4B5FD' }]}
                      onPress={() => router.push('/training')}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.alertRowIcon, { backgroundColor: '#EDE9FE' }]}>
                        <MaterialCommunityIcons name="school-outline" size={18} color="#7C3AED" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.alertRowTitle, { color: '#5B21B6' }]} numberOfLines={1}>
                          {tr.title ?? tr.name ?? tr.sessionName ?? `Training #${tr.id}`}
                        </Text>
                        <Text style={[styles.alertRowSub, { color: '#7C3AED' }]}>Training assigned to you</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#7C3AED" />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Recent requests */}
            {recent.length > 0 && (
              <>
                <View style={styles.recentHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>Recent Requests</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/requests')}>
                    <Text style={[styles.seeAll, { color: theme.primary }]}>See all</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.orderList}>
                  {recent.map(item => (
                    <OrderRow key={item.id} item={item} theme={theme} />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1 },
  header:  { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerLeft:  { flex: 1 },
  greeting:    { fontSize: 13, fontWeight: '500', marginBottom: 2 },
  userName:    { ...Typography.h2 },
  companySub:  { fontSize: 13, marginTop: 2 },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 16, fontWeight: '800', color: '#fff' },
  logoWrap:     { width: 42, height: 42, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', padding: 2 },
  logo:         { width: '100%', height: '100%', borderRadius: 10 },

  // Alert bell
  alertBell:      { position: 'relative', padding: 4 },
  alertBadge:     { position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center' },
  alertBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  // Alert rows (below quick actions)
  alertList:     { marginHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  alertRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, ...Shadows.sm },
  alertRowIcon:  { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  alertRowTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  alertRowSub:   { fontSize: 11, marginTop: 1 },

  scroll: { paddingBottom: Spacing.xxl, gap: 0 },

  // Admin banner
  adminBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, ...Shadows.sm },
  adminIcon:   { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  adminTitle:  { fontSize: 15, fontWeight: '800' },
  adminSub:    { fontSize: 12, marginTop: 1 },

  // Requests hero band
  hero:      { marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md, ...Shadows.md },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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

  // Module cards
  modGrid: { flexDirection: 'row', marginHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  modCard: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, gap: Spacing.sm, borderWidth: 1, ...Shadows.sm },
  modIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  modValue: { fontSize: 18, fontWeight: '800' },
  modLabel: { fontSize: 12, fontWeight: '700' },
  modSub:   { fontSize: 10, fontWeight: '500' },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  statCard: { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, alignItems: 'center', gap: 2, borderWidth: 1, ...Shadows.sm },
  statIconBox: { width: 28, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  statLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  sectionTitle: { ...Typography.h4, marginHorizontal: Spacing.lg, marginBottom: Spacing.md },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.lg },
  actionTile:  { width: '31%', borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', gap: Spacing.sm, borderWidth: 1, ...Shadows.sm },
  actionIcon:  { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  seeAll:       { fontSize: 13, fontWeight: '700' },

  orderList: { marginHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  orderRow:  { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', ...Shadows.sm },
  orderStripe: { width: 4, alignSelf: 'stretch' },
  orderBody:   { flex: 1, padding: Spacing.md, gap: 2 },
  orderTitle:  { ...Typography.bodyS, fontWeight: '700' },
  orderSub:    { fontSize: 12, fontWeight: '400' },
  statusPill:  { marginRight: Spacing.md, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusText:  { fontSize: 11, fontWeight: '700' },
});
