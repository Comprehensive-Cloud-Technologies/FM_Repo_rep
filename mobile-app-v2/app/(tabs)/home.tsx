/**
 * Home — role-aware entry screen.
 *
 * HC Staff    → My Case Logs dashboard + raise button + recent cases
 * HC Engineer → Assigned cases dashboard + recent assigned list
 * HC Admin    → Full case log dashboard + engineer performance
 * Legacy      → Original quick-actions layout
 */

import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authenticatedFetch, fetchMyTodayProgress, fetchNotificationCount } from '../../utils/api';
import { useTheme, Spacing, Radius } from '../../utils/theme';
import { hasTechAccess, canManageTeam, canViewNotifications } from '../../utils/permissions';

// ─── Mini components ─────────────────────────────────────────────────────────

function StatCard({ label, value, color, onPress }: {
  label: string; value: number; color: string; onPress?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[ss.statCard, { backgroundColor: theme.surface, borderColor: color + '40' }]}
      onPress={onPress} activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={[ss.statValue, { color }]}>{value}</Text>
      <Text style={[ss.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const STATUS_COLOR: Record<string, string> = {
  open: '#DC2626', assigned: '#2563EB', in_progress: '#D97706',
  resolved: '#059669', closed: '#64748B',
};

function CaseRow({ item, onPress }: { item: any; onPress: () => void }) {
  const { theme } = useTheme();
  const color = STATUS_COLOR[item.status] || '#64748B';
  return (
    <TouchableOpacity
      style={[ss.caseRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress} activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={[ss.caseTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {item.work_order_number} · {item.asset_name || 'Asset'}
        </Text>
        <Text style={[ss.caseDesc, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.issue_description}
        </Text>
      </View>
      <View style={[ss.statusBadge, { backgroundColor: color + '18' }]}>
        <Text style={[ss.statusText, { color }]}>{(item.status || '').replace(/_/g, ' ')}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── HC Staff Home ────────────────────────────────────────────────────────────
function HCStaffHome({ user }: { user: any }) {
  const { theme } = useTheme();
  const [dash, setDash]     = useState<any>(null);
  const [cases, setCases]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dRes, cRes] = await Promise.allSettled([
        authenticatedFetch('/api/mobile/case-logs/dashboard').then(r => r.json()),
        authenticatedFetch('/api/mobile/case-logs?limit=10').then(r => r.json()),
      ]);
      if (dRes.status === 'fulfilled') setDash(dRes.value);
      if (cRes.status === 'fulfilled') setCases((cRes.value as any).data || []);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh on focus + 30s polling (without blinking)
  useFocusEffect(
    useCallback(() => {
      void load(true);
      const interval = setInterval(() => { void load(true); }, 30000);
      return () => clearInterval(interval);
    }, [load])
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';
  const roleLabel = (user?.role || '').replace(/_/g, ' ');

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={ss.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={ss.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={[ss.greeting, { color: theme.textSecondary }]}>{greeting} 👋</Text>
            <Text style={[ss.name, { color: theme.textPrimary }]}>{firstName}</Text>
            <Text style={[ss.roleTag, { color: theme.primary, backgroundColor: theme.primaryBg }]}>{roleLabel}</Text>
          </View>
          <TouchableOpacity style={[ss.qrBtn, { backgroundColor: theme.primary }]} onPress={() => router.push('/qr-scanner')}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Raise Case Log CTA */}
        <TouchableOpacity style={[ss.raiseCta, { backgroundColor: theme.primary }]} onPress={() => router.push('/hc-raise-case-log')} activeOpacity={0.85}>
          <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#fff" />
          <Text style={ss.raiseCtaText}>Raise New Case Log</Text>
        </TouchableOpacity>

        {/* Dashboard summary */}
        {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} /> : (
          <>
            <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>MY CASE LOGS</Text>
            <View style={ss.statsGrid}>
              <StatCard label="Total"    value={dash?.total    ?? 0} color="#2563EB" onPress={() => router.push('/hc-case-logs')} />
              <StatCard label="Open"     value={dash?.open     ?? 0} color="#DC2626" onPress={() => router.push({ pathname: '/hc-case-logs', params: { status: 'open' } })} />
              <StatCard label="Resolved" value={dash?.resolved ?? 0} color="#059669" onPress={() => router.push({ pathname: '/hc-case-logs', params: { status: 'resolved' } })} />
              <StatCard label="Closed"   value={dash?.closed   ?? 0} color="#64748B" onPress={() => router.push({ pathname: '/hc-case-logs', params: { status: 'closed' } })} />
            </View>

            {cases.length > 0 && (
              <>
                <View style={ss.rowBetween}>
                  <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>RECENT CASES</Text>
                  <TouchableOpacity onPress={() => router.push('/hc-case-logs')}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>View all</Text>
                  </TouchableOpacity>
                </View>
                {cases.map(item => (
                  <CaseRow key={item.id} item={item} onPress={() => router.push({ pathname: '/hc-case-log-detail', params: { id: String(item.id), sourceType: item.source_type || 'work_order' } })} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── HC Engineer Home ─────────────────────────────────────────────────────────
function HCEngineerHome({ user }: { user: any }) {
  const { theme } = useTheme();
  const [dash, setDash]     = useState<any>(null);
  const [cases, setCases]   = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dRes, cRes] = await Promise.allSettled([
        authenticatedFetch('/api/mobile/case-logs/dashboard').then(r => r.json()),
        authenticatedFetch('/api/mobile/case-logs?limit=10').then(r => r.json()),
      ]);
      if (dRes.status === 'fulfilled') setDash(dRes.value);
      if (cRes.status === 'fulfilled') setCases((cRes.value as any).data || []);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh on focus + 30s polling (without blinking)
  useFocusEffect(
    useCallback(() => {
      void load(true);
      const interval = setInterval(() => { void load(true); }, 30000);
      return () => clearInterval(interval);
    }, [load])
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={ss.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={ss.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={[ss.greeting, { color: theme.textSecondary }]}>{greeting} 👋</Text>
            <Text style={[ss.name, { color: theme.textPrimary }]}>{firstName}</Text>
            <Text style={[ss.roleTag, { color: '#1d4ed8', backgroundColor: '#dbeafe' }]}>Engineer</Text>
          </View>
          <TouchableOpacity style={[ss.qrBtn, { backgroundColor: theme.primary }]} onPress={() => router.push('/qr-scanner')}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} /> : (
          <>
            <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>MY ASSIGNMENTS</Text>
            <View style={ss.statsGrid}>
              <StatCard label="Assigned"    value={dash?.assigned   ?? 0} color="#2563EB" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'assigned' } })} />
              <StatCard label="In Progress" value={dash?.inProgress ?? 0} color="#D97706" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'in_progress' } })} />
              <StatCard label="Resolved"    value={dash?.resolved   ?? 0} color="#059669" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'resolved' } })} />
              <StatCard label="Total"       value={dash?.total      ?? 0} color="#64748B" onPress={() => router.push('/(tabs)/tasks')} />
            </View>

            {cases.filter(item => !['resolved','closed'].includes(item.status)).length > 0 && (
              <>
                <View style={ss.rowBetween}>
                  <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>ASSIGNED TO ME</Text>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>View all</Text>
                  </TouchableOpacity>
                </View>
                {cases.filter(item => !['resolved','closed'].includes(item.status)).map(item => (
                  <CaseRow key={item.id} item={item} onPress={() => router.push({ pathname: '/hc-case-log-detail', params: { id: String(item.id), sourceType: item.source_type || 'work_order' } })} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── HC Admin Home ────────────────────────────────────────────────────────────
function HCAdminHome({ user }: { user: any }) {
  const { theme } = useTheme();
  const [dash, setDash]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authenticatedFetch('/api/mobile/case-logs/dashboard').then(r => r.json());
      setDash(res);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh on focus + 30s polling (without blinking)
  useFocusEffect(
    useCallback(() => {
      void load(true);
      const interval = setInterval(() => { void load(true); }, 30000);
      return () => clearInterval(interval);
    }, [load])
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={ss.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={ss.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={[ss.greeting, { color: theme.textSecondary }]}>{greeting} 👋</Text>
            <Text style={[ss.name, { color: theme.textPrimary }]}>{firstName}</Text>
            <Text style={[ss.roleTag, { color: '#7c3aed', backgroundColor: '#f3e8ff' }]}>Admin</Text>
          </View>
          <TouchableOpacity style={[ss.qrBtn, { backgroundColor: theme.primary }]} onPress={() => router.push('/qr-scanner')}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} /> : (
          <>
            <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>CASE LOG OVERVIEW</Text>
            <View style={ss.statsGrid}>
              <StatCard label="Total"       value={dash?.total      ?? 0} color="#2563EB" onPress={() => router.push('/(tabs)/tasks')} />
              <StatCard label="Open"        value={dash?.open       ?? 0} color="#DC2626" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'open' } })} />
              <StatCard label="Assigned"    value={dash?.assigned   ?? 0} color="#2563EB" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'assigned' } })} />
              <StatCard label="In Progress" value={dash?.inProgress ?? 0} color="#D97706" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'in_progress' } })} />
              <StatCard label="Resolved"    value={dash?.resolved   ?? 0} color="#059669" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'resolved' } })} />
              <StatCard label="Closed"      value={dash?.closed     ?? 0} color="#64748B" onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { status: 'closed' } })} />
            </View>

            {(dash?.engineerStats?.length ?? 0) > 0 && (
              <>
                <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>ENGINEER PERFORMANCE</Text>
                {dash.engineerStats.map((e: any, i: number) => (
                  <View key={i} style={[ss.engRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[ss.engAvatar, { backgroundColor: theme.primaryBg }]}>
                      <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 16 }}>
                        {(e.engineer_name || '?')[0]}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[ss.engName, { color: theme.textPrimary }]}>{e.engineer_name}</Text>
                      <Text style={[ss.engSub, { color: theme.textSecondary }]}>
                        {e.pending} pending · {e.in_progress} in progress · {e.resolved} resolved
                      </Text>
                    </View>
                    <Text style={{ fontWeight: '700', color: theme.textPrimary }}>{e.total}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>QUICK ACTIONS</Text>
            <View style={ss.actionsRow}>
              {([
                { icon: 'package-variant',       label: 'Assets',     color: theme.primary, route: '/assets' },
                { icon: 'clipboard-text-outline', label: 'All Cases',  color: '#D97706',     route: '/(tabs)/tasks' },
                { icon: 'account-group-outline',  label: 'Users',      color: '#7C3AED',     route: '/(tabs)/assignments' },
              ] as const).map(a => (
                <TouchableOpacity key={a.label}
                  style={[ss.actionBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => router.push(a.route as any)} activeOpacity={0.7}
                >
                  <View style={[ss.actionIcon, { backgroundColor: a.color + '18' }]}>
                    <MaterialCommunityIcons name={a.icon as any} size={22} color={a.color} />
                  </View>
                  <Text style={[ss.actionLabel, { color: theme.textPrimary }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user, capabilities } = useAuth();
  if (capabilities.isHCStaff)    return <HCStaffHome    user={user} />;
  if (capabilities.isHCEngineer) return <HCEngineerHome user={user} />;
  if (capabilities.isHCAdmin)    return <HCAdminHome    user={user} />;
  return <LegacyHome user={user} capabilities={capabilities} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { padding: Spacing.lg, paddingBottom: 48, gap: Spacing.md },
  topBar:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  greeting:    { fontSize: 13, marginBottom: 2 },
  name:        { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  company:     { fontSize: 12, marginTop: 2 },
  roleTag:     { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20, fontSize: 11, fontWeight: '700', textTransform: 'capitalize', overflow: 'hidden' },
  qrBtn:       { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  raiseCta:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.md, borderRadius: Radius.lg },
  raiseCtaText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionTitle:{ fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  rowBetween:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:    { width: '47.5%', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, alignItems: 'center' },
  statValue:   { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  statLabel:   { fontSize: 11, marginTop: 2, fontWeight: '600' },
  caseRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  caseTitle:   { fontWeight: '600', fontSize: 13 },
  caseDesc:    { fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:  { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  engRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  engAvatar:   { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  engName:     { fontWeight: '600', fontSize: 13 },
  engSub:      { fontSize: 11, marginTop: 2 },
  actionsRow:  { flexDirection: 'row', gap: Spacing.sm },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn:   { flex: 1, alignItems: 'center', gap: 6, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  actionIcon:  { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  legacyCard:  { width: '47.5%', padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, gap: 8 },
});

// ─── Quick-action card ────────────────────────────────────────────────────────
function ActionCard({ icon, label, sublabel, color, onPress }: {
  icon: string; label: string; sublabel?: string; color: string; onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: color + '15' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: theme.textPrimary }]} numberOfLines={1}>{label}</Text>
      {sublabel ? <Text style={[styles.actionSub, { color: theme.textSecondary }]} numberOfLines={1}>{sublabel}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function LegacyHome({ user, capabilities }: { user: any; capabilities: any }) {
  const { theme } = useTheme();
  const [progress,   setProgress]   = useState<any>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // 5-second timeout so the spinner doesn't hang if the backend is unreachable
    const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
    try {
      const [prog, nc] = await Promise.allSettled([
        Promise.race([fetchMyTodayProgress(), timeout(5000)]),
        Promise.race([fetchNotificationCount(), timeout(5000)]),
      ]);
      if (prog.status === 'fulfilled') setProgress(prog.value);
      if (nc.status   === 'fulfilled') setNotifCount((nc.value as any).count ?? 0);
    } catch { /* silent */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); void load(); };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting} 👋</Text>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{firstName}</Text>
            <Text style={[styles.company, { color: theme.textMuted }]}>{user?.companyName}</Text>
          </View>
          <View style={styles.topActions}>
            {canViewNotifications(capabilities) ? (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => router.push('/notifications')}
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color={theme.textPrimary} />
                {notifCount > 0 ? (
                  <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                    <Text style={styles.badgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/qr-scanner')}
            >
              <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Today stats ───────────────────────────────────────────────── */}
        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.xl }} />
        ) : progress ? (
          <View style={[styles.statsRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {[
              { label: 'Assigned',  value: (progress as any).assigned  ?? 0, color: theme.primary },
              { label: 'Done',      value: (progress as any).completed ?? 0, color: '#059669' },
              { label: 'Pending',   value: (progress as any).pending   ?? 0, color: '#D97706' },
            ].map(({ label, value, color }, i, arr) => (
              <View key={label} style={[styles.statItem, i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: theme.border }]}>
                <Text style={[styles.statValue, { color }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          <ActionCard icon="package-variant" label="Assets" sublabel="Browse & scan" color={theme.primary} onPress={() => router.push('/assets')} />

          {hasTechAccess(capabilities) ? (
            <ActionCard icon="clipboard-check-outline" label="Checklists" sublabel="My assignments" color="#059669" onPress={() => router.push('/(tabs)/checklists')} />
          ) : null}

          {canManageTeam(capabilities) ? (
            <ActionCard icon="account-group-outline" label="My Team" sublabel="Assignments" color="#7C3AED" onPress={() => router.push('/(tabs)/assignments')} />
          ) : null}

          {hasTechAccess(capabilities) ? (
            <ActionCard icon="briefcase-outline" label="Work Orders" sublabel="Active orders" color="#D97706" onPress={() => router.push('/work-orders')} />
          ) : null}

          <ActionCard icon="clipboard-list-outline" label="HC Requests" sublabel="Queries & work orders" color="#0284C7" onPress={() => router.push('/hc-requests')} />

          <ActionCard icon="history" label="History" sublabel="Past submissions" color={theme.info} onPress={() => router.push('/history')} />

          {hasTechAccess(capabilities) ? (
            <ActionCard icon="school-outline" label="Training" sublabel="OJT modules" color="#059669" onPress={() => router.push('/training')} />
          ) : null}
        </View>

        {/* ── Role chip ─────────────────────────────────────────────────── */}
        <View style={[styles.roleChip, { backgroundColor: theme.primaryBg, borderColor: theme.primary + '30' }]}>
          <MaterialCommunityIcons name="shield-account-outline" size={16} color={theme.primary} />
          <Text style={[styles.roleText, { color: theme.primary }]}>{user?.role?.replace(/_/g, ' ')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, paddingBottom: 40, gap: Spacing.lg },

  topBar:       { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  greeting:     { fontSize: 13, marginBottom: 2 },
  name:         { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  company:      { fontSize: 12, marginTop: 2 },
  topActions:   { flexDirection: 'row', gap: Spacing.sm, paddingTop: 4 },
  iconBtn:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  badge:        { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText:    { fontSize: 9, color: '#fff', fontWeight: '700' },

  statsRow:     { flexDirection: 'row', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  statItem:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue:    { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  statLabel:    { fontSize: 11, marginTop: 2 },

  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionCard:   { width: '47.5%', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, gap: 4 },
  actionIconWrap:{ width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actionLabel:  { fontSize: 13, fontWeight: '600' },
  actionSub:    { fontSize: 11 },

  roleChip:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full, borderWidth: 1 },
  roleText:     { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
});
