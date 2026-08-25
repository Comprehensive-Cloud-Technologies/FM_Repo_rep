import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { withPermission } from '../../components/withPermission';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchCaseLogs, fetchCaseLogDashboard } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../context/CompanyScopeContext';
import { useTheme, Spacing, Radius, Shadows, Typography } from '../../utils/theme';
import EmptyState from '../../components/EmptyState';

type FilterType = 'all' | 'open' | 'in_progress' | 'completed';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
];

function priorityColor(priority: string, theme: any) {
  if (!priority) return theme.primary;
  const p = priority.toLowerCase();
  if (p === 'critical' || p === 'high') return theme.danger;
  if (p === 'medium') return theme.warning;
  return theme.success;
}

function statusColor(status: string, theme: any) {
  if (status === 'completed' || status === 'resolved' || status === 'closed') return theme.success;
  if (status === 'in_progress' || status === 'assigned') return theme.warning;
  return theme.primary;
}

function statusLabel(status: string) {
  if (status === 'in_progress') return 'In Progress';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Open';
}

// ─── Request card ─────────────────────────────────────────────────────────────
function RequestCard({ item, theme }: { item: any; theme: any }) {
  const sc = statusColor(item.status, theme);
  const pc = priorityColor(item.priority, theme);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push({
        pathname: '/hc-case-log-detail',
        params: { id: String(item.id), sourceType: item.source_type ?? 'work_order' },
      })}
      activeOpacity={0.75}
    >
      {/* Priority stripe on left */}
      <View style={[styles.stripe, { backgroundColor: pc }]} />

      <View style={styles.cardBody}>
        {/* Title row */}
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
            {item.issue_description ?? item.asset_name ?? item.work_order_number ?? `Request #${item.id}`}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: sc + '18' }]}>
            <Text style={[styles.statusText, { color: sc }]}>{statusLabel(item.status)}</Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          {item.asset_name && (
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="package-variant" size={12} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{item.asset_name}</Text>
            </View>
          )}
          {item.work_order_number && (
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="pound" size={12} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{item.work_order_number}</Text>
            </View>
          )}
        </View>

        {/* Footer row */}
        <View style={styles.footer}>
          {item.priority && (
            <View style={[styles.priorityTag, { backgroundColor: pc + '15', borderColor: pc + '40' }]}>
              <View style={[styles.priorityDot, { backgroundColor: pc }]} />
              <Text style={[styles.priorityText, { color: pc }]}>
                {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
              </Text>
            </View>
          )}
          {item.created_at && (
            <Text style={[styles.dateText, { color: theme.textMuted }]}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
          )}
          <MaterialCommunityIcons name="chevron-right" size={16} color={theme.textMuted} style={{ marginLeft: 'auto' }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
// Bucket a raw status into the tab it belongs to
function statusBucket(status: string): FilterType {
  const s = (status ?? '').toLowerCase();
  if (s === 'open') return 'open';
  if (s === 'in_progress' || s === 'assigned') return 'in_progress';
  if (s === 'resolved' || s === 'closed' || s === 'completed') return 'completed';
  return 'open';
}

function RequestsTab() {
  const { theme } = useTheme();
  const { can } = useAuth();
  const { scopedCompanyId } = useCompanyScope();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [orders, setOrders]         = useState<any[]>([]);
  const [filter, setFilter]         = useState<FilterType>('all');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Honor an initial filter passed from the dashboard (Open / In Progress / Completed tap)
  useEffect(() => {
    const f = params.filter;
    if (f === 'open' || f === 'in_progress' || f === 'completed' || f === 'all') {
      setFilter(f);
    }
  }, [params.filter]);

  const canCreate = can('work_order:create');

  const load = useCallback(async () => {
    try {
      // Unified case logs (work orders + asset queries); admins can scope to an assigned company
      const arr = await fetchCaseLogs(undefined, scopedCompanyId);
      setOrders(Array.isArray(arr) ? arr : []);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [scopedCompanyId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); void load(); };

  const counts = {
    all:         orders.length,
    open:        orders.filter(o => statusBucket(o.status) === 'open').length,
    in_progress: orders.filter(o => statusBucket(o.status) === 'in_progress').length,
    completed:   orders.filter(o => statusBucket(o.status) === 'completed').length,
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => statusBucket(o.status) === filter);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />

      {/* Blue header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View>
          <Text style={styles.headerTitle}>Requests</Text>
          <Text style={styles.headerSub}>Work orders & maintenance</Text>
        </View>
        {canCreate && (
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/work-order-create')}
          >
            <MaterialCommunityIcons name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Summary pills */}
      <View style={[styles.summaryRow, { backgroundColor: theme.primary }]}>
        <View style={styles.summaryPill}>
          <Text style={styles.summaryNum}>{counts.open}</Text>
          <Text style={styles.summaryLabel}>Open</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.summaryPill}>
          <Text style={styles.summaryNum}>{counts.in_progress}</Text>
          <Text style={styles.summaryLabel}>In Progress</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.summaryPill}>
          <Text style={styles.summaryNum}>{counts.completed}</Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
      </View>

      {/* White content area */}
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Filter tabs */}
        <View style={[styles.filterBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, filter === f.key && { borderBottomColor: theme.primary }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, { color: filter === f.key ? theme.primary : theme.textMuted }]}>
                {f.label}
              </Text>
              {counts[f.key] > 0 && (
                <View style={[styles.filterCount, { backgroundColor: filter === f.key ? theme.primaryBg : theme.surfaceAlt }]}>
                  <Text style={[styles.filterCountText, { color: filter === f.key ? theme.primary : theme.textMuted }]}>
                    {counts[f.key]}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={theme.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => `${item.source_type ?? 'wo'}-${item.id}`}
            renderItem={({ item }) => <RequestCard item={item} theme={theme} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onRefresh={onRefresh}
            refreshing={refreshing}
            ListEmptyComponent={
              <EmptyState
                icon="briefcase-check-outline"
                title="No requests"
                message={filter !== 'all' ? `No ${filter.replace('_', ' ')} requests` : 'All clear — no requests yet'}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  headerTitle: { ...Typography.h3, color: '#fff' },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.lg, gap: Spacing.xl },
  summaryPill: { alignItems: 'center', gap: 2 },
  summaryNum:  { fontSize: 22, fontWeight: '800', color: '#fff' },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  summaryDivider: { width: 1, height: 28 },

  filterBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: Spacing.md },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md, flexDirection: 'row', justifyContent: 'center', gap: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterText: { fontSize: 13, fontWeight: '700' },
  filterCount: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, minWidth: 20, alignItems: 'center' },
  filterCountText: { fontSize: 11, fontWeight: '700' },

  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 120, gap: Spacing.sm },
  card: { flexDirection: 'row', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', ...Shadows.sm },
  stripe: { width: 4 },
  cardBody: { flex: 1, padding: Spacing.md, gap: Spacing.sm },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle: { ...Typography.bodyS, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full, flexShrink: 0 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  metaRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12 },
  footer:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  priorityTag:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  priorityDot:  { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11 },
});

export default withPermission(RequestsTab, 'case_log:view');
