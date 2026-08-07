/**
 * My Case Logs — Staff view (Nurse / Doctor / Ward Boy)
 * Also used by Admin for full list.
 * Route: /hc-case-logs
 * Params: status? (filter)
 */
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text,
  TouchableOpacity, View, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authenticatedFetch } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';

const STATUS_COLOR: Record<string, string> = {
  open: '#DC2626', assigned: '#2563EB', in_progress: '#D97706',
  resolved: '#059669', closed: '#64748B',
};

const ALL_STATUSES = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

export default function HCCaseLogs() {
  const { theme } = useTheme();
  const { capabilities } = useAuth();
  const params = useLocalSearchParams<{ status?: string }>();
  const [statusFilter, setStatusFilter] = useState(params.status || '');
  const [cases, setCases]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage]       = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (reset = false) => {
    const p = reset ? 1 : page;
    try {
      const qs = new URLSearchParams({ limit: '20', page: String(p) });
      if (statusFilter) qs.set('status', statusFilter);
      const res = await authenticatedFetch(`/api/mobile/case-logs?${qs}`);
      const data = await res.json() as any;
      const rows = data.data || [];
      setCases(prev => reset ? rows : [...prev, ...rows]);
      setHasMore(rows.length === 20);
      if (reset) setPage(2); else setPage(p + 1);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [page, statusFilter]);

  useEffect(() => { setLoading(true); void load(true); }, [statusFilter]);

  // Auto-refresh on focus + 30s polling (without blinking)
  useFocusEffect(
    useCallback(() => {
      void load(true);
      const interval = setInterval(() => { void load(true); }, 30000);
      return () => clearInterval(interval);
    }, [statusFilter])
  );

  const renderItem = ({ item }: { item: any }) => {
    const color = STATUS_COLOR[item.status] || '#64748B';
    const isResolved = item.status === 'resolved';
    return (
      <TouchableOpacity
        style={[ss.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight, borderLeftColor: color }]}
        onPress={() => router.push({ pathname: '/hc-case-log-detail', params: { id: String(item.id), sourceType: item.source_type || 'work_order' } })}
        activeOpacity={0.7}
      >
        <View style={ss.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[ss.cardNum, { color: theme.primary }]}>{item.work_order_number}</Text>
            <Text style={[ss.cardAsset, { color: theme.textPrimary }]} numberOfLines={1}>{item.asset_name || 'Asset'}</Text>
          </View>
          <View style={[ss.badge, { backgroundColor: color + '18' }]}>
            <Text style={[ss.badgeText, { color }]}>{(item.status || '').replace(/_/g, ' ')}</Text>
          </View>
        </View>
        <Text style={[ss.cardDesc, { color: theme.textSecondary }]} numberOfLines={2}>{item.issue_description}</Text>
        <View style={ss.cardFooter}>
          <Text style={[ss.cardMeta, { color: theme.textMuted }]}>
            {item.department_name || item.location || '—'}
          </Text>
          <Text style={[ss.cardMeta, { color: theme.textMuted }]}>
            {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
          </Text>
        </View>
        {isResolved && capabilities.isHCStaff && (
          <TouchableOpacity
            style={[ss.closeBtn, { backgroundColor: '#059669' }]}
            onPress={() => router.push({ pathname: '/hc-case-log-detail', params: { id: String(item.id), action: 'close', sourceType: item.source_type || 'work_order' } })}
          >
            <Text style={ss.closeBtnText}>Close Case</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[ss.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: theme.textPrimary }]}>
          {capabilities.isHCAdmin ? 'All Case Logs' : 'My Case Logs'}
        </Text>
        {capabilities.isHCStaff && (
          <TouchableOpacity
            style={[ss.raiseBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push('/hc-raise-case-log')}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter chips */}
      <View style={[ss.chipBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {ALL_STATUSES.map(s => (
          <TouchableOpacity
            key={s.value}
            style={[ss.chip, { backgroundColor: statusFilter === s.value ? theme.primary : theme.background, borderColor: statusFilter === s.value ? theme.primary : theme.border }]}
            onPress={() => { setPage(1); setStatusFilter(s.value); }}
          >
            <Text style={[ss.chipText, { color: statusFilter === s.value ? '#fff' : theme.textSecondary }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={cases}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor={theme.primary} />}
          onEndReached={() => { if (hasMore) void load(); }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <MaterialCommunityIcons name="clipboard-off-outline" size={48} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, marginTop: 12, fontSize: 14 }}>No case logs found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  headerTitle: { flex: 1, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  raiseBtn:    { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', ...Shadows.brand },
  chipBar:     { flexDirection: 'row', gap: 6, padding: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: 1, flexWrap: 'wrap' },
  chip:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  chipText:    { fontSize: 11, fontWeight: '700' },
  card:        { borderRadius: Radius.lg, borderWidth: 1, borderLeftWidth: 4, padding: Spacing.md, gap: 8 },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardNum:     { fontSize: 12, fontWeight: '800' },
  cardAsset:   { fontSize: 15, fontWeight: '700', marginTop: 2 },
  badge:       { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  badgeText:   { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardDesc:    { fontSize: 13 },
  cardFooter:  { flexDirection: 'row', justifyContent: 'space-between' },
  cardMeta:    { fontSize: 11 },
  closeBtn:    { padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  closeBtnText:{ color: '#fff', fontWeight: '700', fontSize: 13 },
});
