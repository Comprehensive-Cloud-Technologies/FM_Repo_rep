/**
 * Healthcare Requests Screen
 * Shows QR-submitted asset queries + work orders.
 * Each item is clickable to view details and update status.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchHCRequests } from '../utils/api';
import { useTheme, Spacing, Radius, Typography, Shadows } from '../utils/theme';
import Header from '../components/Header';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Request {
  id: number;
  work_order_number: string;
  asset_name: string;
  location: string;
  issue_description: string;
  priority: string;
  status: string;
  source_label: string;
  source_type: string;
  assigned_to_name: string;
  department_name: string;
  created_at: string;
  requester_name?: string;
  requester_phone?: string;
}

interface Summary {
  open: number;
  inProgress: number;
  completed: number;
  closed: number;
  escalated: number;
  overdue: number;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:        { bg: '#FEF3C7', text: '#92400E' },
  in_progress: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:   { bg: '#D1FAE5', text: '#065F46' },
  resolved:    { bg: '#D1FAE5', text: '#065F46' },
  closed:      { bg: '#F1F5F9', text: '#64748B' },
  escalated:   { bg: '#FCE7F3', text: '#9D174D' },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6B7280', medium: '#D97706', high: '#DC2626', critical: '#7C3AED',
};

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryChip({ label, count, color, active, onPress }: {
  label: string; count: number; color: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? color : '#E2E8F0', backgroundColor: active ? color + '18' : '#F8FAFC' }]}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipCount, { color }]}>{count}</Text>
      <Text style={[styles.chipLabel, { color: active ? color : '#64748B' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Request Row ──────────────────────────────────────────────────────────────
function RequestRow({ item, onPress }: { item: Request; onPress: () => void }) {
  const { theme } = useTheme();
  const sc = STATUS_COLORS[item.status] ?? { bg: '#F1F5F9', text: '#64748B' };
  const pc = PRIORITY_COLORS[item.priority] ?? '#6B7280';
  const isQR = item.source_type === 'asset_query';
  return (
    <TouchableOpacity onPress={onPress} style={[styles.row, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]} activeOpacity={0.75}>
      <View style={styles.rowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowWO, { color: theme.primary }]}>{item.work_order_number}</Text>
          <Text style={[styles.rowAsset, { color: theme.textPrimary }]} numberOfLines={1}>{item.asset_name || '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.text }]}>{statusLabel(item.status)}</Text>
          </View>
          {isQR ? (
            <View style={[styles.sourceBadge, { backgroundColor: '#EFF6FF' }]}>
              <MaterialCommunityIcons name="qrcode-scan" size={10} color="#2563EB" />
              <Text style={[styles.badgeText, { color: '#2563EB' }]}>QR Scan</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={[styles.rowDesc, { color: theme.textSecondary }]} numberOfLines={2}>{item.issue_description || 'No description'}</Text>

      <View style={styles.rowMeta}>
        {item.department_name ? (
          <View style={styles.metaChip}>
            <MaterialCommunityIcons name="office-building-outline" size={11} color="#64748B" />
            <Text style={styles.metaText}>{item.department_name}</Text>
          </View>
        ) : null}
        {item.assigned_to_name ? (
          <View style={styles.metaChip}>
            <MaterialCommunityIcons name="account-outline" size={11} color="#64748B" />
            <Text style={styles.metaText}>{item.assigned_to_name}</Text>
          </View>
        ) : (
          <View style={[styles.metaChip, { backgroundColor: '#FFF7ED' }]}>
            <Text style={[styles.metaText, { color: '#C2410C' }]}>Unassigned</Text>
          </View>
        )}
        <View style={[styles.priorityDot, { backgroundColor: pc }]} />
        <Text style={[styles.metaText, { color: pc, fontWeight: '700', textTransform: 'capitalize' }]}>{item.priority}</Text>
        <Text style={[styles.metaText, { marginLeft: 'auto' }]}>
          {new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ item, onClose }: { item: Request; onClose: () => void }) {
  const { theme } = useTheme();
  const sc = STATUS_COLORS[item.status] ?? { bg: '#F1F5F9', text: '#64748B' };

  const Field = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</Text>
        <Text style={{ fontSize: 14, color: theme.textPrimary, lineHeight: 20 }}>{value}</Text>
      </View>
    ) : null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>{item.work_order_number}</Text>
              <View style={[styles.badge, { backgroundColor: sc.bg, alignSelf: 'flex-start', marginTop: 4 }]}>
                <Text style={[styles.badgeText, { color: sc.text }]}>{statusLabel(item.status)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Field label="Asset" value={item.asset_name} />
            <Field label="Location" value={item.location} />
            <Field label="Department" value={item.department_name} />
            <Field label="Issue" value={item.issue_description} />
            <Field label="Priority" value={item.priority?.charAt(0).toUpperCase() + item.priority?.slice(1)} />
            <Field label="Source" value={item.source_label || (item.source_type === 'asset_query' ? 'QR Scan' : 'Work Order')} />
            <Field label="Assigned To" value={item.assigned_to_name} />
            {item.requester_name ? <Field label="Reported By" value={item.requester_name} /> : null}
            {item.requester_phone ? <Field label="Reporter Phone" value={item.requester_phone} /> : null}
            <Field label="Created" value={new Date(item.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HCRequestsScreen() {
  const { theme } = useTheme();
  const [requests,   setRequests]   = useState<Request[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected,   setSelected]   = useState<Request | null>(null);

  const load = useCallback(async (q?: string, st?: string) => {
    try {
      const res = await fetchHCRequests({ search: q, status: st, limit: 50 });
      setRequests((res as any).data ?? []);
      setSummary((res as any).summary ?? null);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(search, statusFilter); }, []);

  const onSearch = (t: string) => { setSearch(t); void load(t, statusFilter); };
  const onFilter = (s: string) => {
    const next = statusFilter === s ? '' : s;
    setStatusFilter(next);
    void load(search, next);
  };
  const onRefresh = () => { setRefreshing(true); void load(search, statusFilter); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Requests" showBack />

      {/* Summary chips */}
      {summary ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {[
            { label: 'Open',     count: summary.open,       color: '#D97706', key: 'open' },
            { label: 'Progress', count: summary.inProgress, color: '#2563EB', key: 'in_progress' },
            { label: 'Done',     count: summary.completed,  color: '#059669', key: 'completed' },
            { label: 'Closed',   count: summary.closed,     color: '#64748B', key: 'closed' },
            { label: 'Escalated',count: summary.escalated,  color: '#9D174D', key: 'escalated' },
            { label: 'Overdue',  count: summary.overdue,    color: '#DC2626', key: 'overdue' },
          ].map((c) => (
            <SummaryChip key={c.key} label={c.label} count={c.count} color={c.color}
              active={statusFilter === c.key} onPress={() => onFilter(c.key)} />
          ))}
        </ScrollView>
      ) : null}

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.inputText }]}
          value={search}
          onChangeText={onSearch}
          placeholder="Search requests..."
          placeholderTextColor={theme.inputPlaceholder}
        />
        {search ? (
          <TouchableOpacity onPress={() => onSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <RequestRow item={item as Request} onPress={() => setSelected(item as Request)} />}
          contentContainerStyle={requests.length === 0 ? { flex: 1 } : { paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={48} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, fontSize: 14 }}>No requests found</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {selected ? <DetailModal item={selected} onClose={() => setSelected(null)} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  chipsRow:     { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', minWidth: 64 },
  chipCount:    { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  chipLabel:    { fontSize: 10, fontWeight: '700', marginTop: 1 },
  searchWrap:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.sm, paddingVertical: 8, gap: 8 },
  searchInput:  { flex: 1, fontSize: 14 },
  row:          { marginHorizontal: Spacing.lg, marginTop: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: 14, gap: 8 },
  rowHeader:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowWO:        { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  rowAsset:     { fontSize: 15, fontWeight: '700', marginTop: 2 },
  rowDesc:      { fontSize: 13, lineHeight: 18 },
  rowMeta:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaChip:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  metaText:     { fontSize: 11, color: '#64748B' },
  priorityDot:  { width: 7, height: 7, borderRadius: 4 },
  badge:        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sourceBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeText:    { fontSize: 11, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 12 },
  modalTitle:   { fontSize: 16, fontWeight: '800' },
  closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
});
