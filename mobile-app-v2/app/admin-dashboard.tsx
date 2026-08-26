import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StatusBar,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useCompanyScope } from '../context/CompanyScopeContext';
import { fetchAllCompanies, fetchWorkOrderStats, fetchAssets } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows, Typography } from '../utils/theme';

// ─── Profile definitions ──────────────────────────────────────────────────────
type Profile = {
  key: string; title: string; icon: string; color: string; desc: string;
  route?: string; available: boolean;
};

const PROFILES: Profile[] = [
  { key: 'asset',       title: 'Asset Profile',        icon: 'package-variant',      color: '#2563EB', desc: 'Asset register & status',        route: '/(tabs)/assets',   available: true },
  { key: 'complaint',   title: 'Complaint Profile',    icon: 'clipboard-alert-outline', color: '#DC2626', desc: 'Work orders & complaints',    route: '/(tabs)/requests', available: true },
  { key: 'kpi',         title: 'KPI & Performance',    icon: 'speedometer',          color: '#059669', desc: 'Performance meter & SLA',        route: '/(tabs)/reports',  available: true },
  { key: 'pms',         title: 'PMS Scheduler',        icon: 'calendar-clock',       color: '#D97706', desc: 'Preventive maintenance plan',    route: '/pms-assignments', available: true },
  { key: 'calibration', title: 'Calibration Planner',  icon: 'tune-vertical',        color: '#7C3AED', desc: 'Calibration schedule & due',     available: false },
  { key: 'training',    title: 'Training Records',     icon: 'school-outline',       color: '#0891B2', desc: 'Sessions & attendance',          route: '/training',        available: true },
];

// ─── Company switcher modal ───────────────────────────────────────────────────
function CompanyPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { scopedCompany, setScopedCompany } = useCompanyScope();
  const [companies, setCompanies] = useState<Array<{ id: number; companyName: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchAllCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const ownId = (user as any)?.companyId;
  const selectedId = scopedCompany?.id ?? ownId;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Select Company</Text>
          <Text style={[styles.modalSub, { color: theme.textMuted }]}>View data for a company assigned to you</Text>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 32 }} color={theme.primary} />
          ) : (
            <FlatList
              data={companies}
              keyExtractor={c => String(c.id)}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => {
                const active = item.id === selectedId;
                const isOwn  = item.id === ownId;
                return (
                  <TouchableOpacity
                    style={[styles.companyRow, { borderColor: theme.borderLight }]}
                    onPress={() => {
                      setScopedCompany(isOwn ? null : { id: item.id, companyName: item.companyName });
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.companyIcon, { backgroundColor: active ? theme.primary : theme.primaryBg }]}>
                      <MaterialCommunityIcons name="office-building" size={18} color={active ? '#fff' : theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.companyName, { color: theme.textPrimary }]}>{item.companyName}</Text>
                      {isOwn && <Text style={[styles.companyOwn, { color: theme.textMuted }]}>Your company</Text>}
                    </View>
                    {active && <MaterialCommunityIcons name="check-circle" size={22} color={theme.primary} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={[styles.modalSub, { color: theme.textMuted, textAlign: 'center', marginVertical: 24 }]}>No companies available</Text>}
            />
          )}

          <TouchableOpacity style={[styles.modalClose, { backgroundColor: theme.surfaceAlt }]} onPress={onClose}>
            <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────────
function ProfileCard({ p, theme }: { p: Profile; theme: any }) {
  return (
    <TouchableOpacity
      style={[styles.profCard, { backgroundColor: theme.surface, borderColor: theme.border }, !p.available && { opacity: 0.65 }]}
      onPress={() => p.available && p.route ? router.push(p.route as any) : undefined}
      activeOpacity={p.available ? 0.8 : 1}
      disabled={!p.available}
    >
      <View style={[styles.profIcon, { backgroundColor: p.color + '18' }]}>
        <MaterialCommunityIcons name={p.icon as any} size={26} color={p.color} />
      </View>
      <Text style={[styles.profTitle, { color: theme.textPrimary }]}>{p.title}</Text>
      <Text style={[styles.profDesc, { color: theme.textMuted }]}>{p.desc}</Text>
      {!p.available && (
        <View style={[styles.soonPill, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={[styles.soonText, { color: theme.textMuted }]}>Coming soon</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { scopedCompany, scopedCompanyId } = useCompanyScope();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stats, setStats]     = useState<any>(null);
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const activeCompanyName = scopedCompany?.companyName ?? user?.companyName ?? 'Company';

  const load = useCallback(async () => {
    try {
      const [st, assets] = await Promise.allSettled([
        fetchWorkOrderStats(scopedCompanyId),
        fetchAssets(scopedCompanyId ? { companyId: scopedCompanyId } : undefined),
      ]);
      if (st.status === 'fulfilled') setStats(st.value);
      if (assets.status === 'fulfilled') setAssetCount(Array.isArray(assets.value) ? assets.value.length : 0);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [scopedCompanyId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); void load(); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')}>
          <MaterialCommunityIcons name={router.canGoBack() ? 'arrow-left' : 'account-circle'} size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSub}>Multi-company overview</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Company switcher */}
        <TouchableOpacity
          style={[styles.switcher, { backgroundColor: theme.surface, borderColor: theme.primary + '40' }]}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.8}
        >
          <View style={[styles.switcherIcon, { backgroundColor: theme.primaryBg }]}>
            <MaterialCommunityIcons name="office-building" size={22} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.switcherLabel, { color: theme.textMuted }]}>Viewing company</Text>
            <Text style={[styles.switcherName, { color: theme.textPrimary }]} numberOfLines={1}>{activeCompanyName}</Text>
          </View>
          <View style={[styles.switcherBtn, { backgroundColor: theme.primary }]}>
            <MaterialCommunityIcons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.switcherBtnText}>Switch</Text>
          </View>
        </TouchableOpacity>

        {/* Quick totals */}
        <View style={styles.totalsRow}>
          <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.totalNum, { color: theme.primary }]}>{loading ? '—' : assetCount ?? 0}</Text>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Assets</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.totalNum, { color: theme.info }]}>{loading ? '—' : stats?.open ?? 0}</Text>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Open</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.totalNum, { color: theme.warning }]}>{loading ? '—' : stats?.inProgress ?? 0}</Text>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]}>In Progress</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.totalNum, { color: theme.success }]}>{loading ? '—' : stats?.completed ?? 0}</Text>
            <Text style={[styles.totalLabel, { color: theme.textMuted }]}>Completed</Text>
          </View>
        </View>

        {/* Profiles */}
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Management Profiles</Text>
        <View style={styles.profGrid}>
          {PROFILES.map(p => <ProfileCard key={p.key} p={p} theme={theme} />)}
        </View>
      </ScrollView>

      <CompanyPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: Spacing.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 2 },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: 40, gap: Spacing.lg },

  switcher:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1.5, ...Shadows.sm },
  switcherIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  switcherLabel: { fontSize: 11, fontWeight: '600' },
  switcherName:  { fontSize: 16, fontWeight: '800', marginTop: 1 },
  switcherBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full },
  switcherBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  totalsRow:  { flexDirection: 'row', gap: Spacing.sm },
  totalCard:  { flex: 1, borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center', gap: 2, borderWidth: 1, ...Shadows.sm },
  totalNum:   { fontSize: 20, fontWeight: '800' },
  totalLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  sectionTitle: { ...Typography.h4, marginBottom: -Spacing.sm },

  profGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  profCard: { width: '47.5%', borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.xs, borderWidth: 1, ...Shadows.sm },
  profIcon: { width: 52, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  profTitle: { fontSize: 15, fontWeight: '800' },
  profDesc:  { fontSize: 11, lineHeight: 15 },
  soonPill:  { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, marginTop: 4 },
  soonText:  { fontSize: 10, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.4)', alignSelf: 'center', marginBottom: Spacing.sm },
  modalTitle:   { ...Typography.h3 },
  modalSub:     { fontSize: 13 },
  companyRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  companyIcon:  { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  companyName:  { fontSize: 15, fontWeight: '700' },
  companyOwn:   { fontSize: 11, marginTop: 1 },
  modalClose:   { marginTop: Spacing.md, paddingVertical: Spacing.md, borderRadius: Radius.lg, alignItems: 'center' },
  modalCloseText: { fontSize: 15, fontWeight: '700' },
});
