import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyRaisedQueries, closeAssetQuery } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open:        { bg: '#FEF9C3', text: '#92400E', label: 'Open' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8', label: 'In Progress' },
  resolved:    { bg: '#DCFCE7', text: '#166534', label: 'Resolved ✓' },
  closed:      { bg: '#F1F5F9', text: '#64748B', label: 'Closed' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c.text }}>{c.label}</Text>
    </View>
  );
}

export default function MyRequestsScreen() {
  const { theme } = useTheme();
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState<number | null>(null); // id of query being closed

  const load = useCallback(async () => {
    try {
      const data = await fetchMyRaisedQueries();
      setQueries(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 30 s so status changes (e.g., Resolved) appear without
  // the user having to manually pull-to-refresh.
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Close issue (no code required) then go directly to review screen
  const handleClose = async (queryId: number, queryTitle: string) => {
    setClosing(queryId);
    try {
      await closeAssetQuery(queryId, ''); // empty code = skip verification
      setQueries((prev) =>
        prev.map((q) => q.id === queryId ? { ...q, status: 'closed' } : q)
      );
      router.replace({ pathname: '/issue-review', params: { queryId: String(queryId), queryTitle } });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not close the request. Please try again.');
    } finally { setClosing(null); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="My Requests" showBack />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={queries.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {queries.length === 0 ? (
            <EmptyState icon="ticket-outline" title="No requests yet" message="Requests you raise by scanning an asset QR code will appear here." />
          ) : queries.map((q) => (
            <View
              key={q.id}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                  <Text style={[styles.assetName, { color: theme.textSecondary }]}>{q.assetName}</Text>
                </View>
                <StatusBadge status={q.status} />
              </View>

              {q.assignedToName ? (
                <View style={styles.row}>
                  <MaterialCommunityIcons name="account" size={14} color={theme.textMuted} />
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>{q.assignedToName}</Text>
                </View>
              ) : null}

              {q.resolutionNote ? (
                <View style={[styles.resolutionBox, { backgroundColor: theme.primaryBg, borderColor: theme.primaryLight + '40' }]}>
                  <Text style={[styles.resolutionLabel, { color: theme.primary }]}>Resolution note</Text>
                  <Text style={[styles.resolutionText, { color: theme.textSecondary }]}>{q.resolutionNote}</Text>
                </View>
              ) : null}

              <Text style={[styles.date, { color: theme.textMuted }]}>
                {new Date(q.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>

              {/* Already reviewed — show star badge */}
              {q.status === 'closed' && q.rating ? (
                <View style={[styles.hintBox, { backgroundColor: '#fefce8', borderColor: '#fde68a' }]}>
                  <MaterialCommunityIcons name="star" size={14} color="#F59E0B" />
                  <Text style={{ fontSize: 12, color: '#92400E' }}>
                    You rated this {q.rating}/5{q.reviewText ? ` · "${q.reviewText}"` : ''}
                  </Text>
                </View>
              ) : null}

              {/* Closed but not yet reviewed — prompt to review */}
              {q.status === 'closed' && !q.rating ? (
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: '#F59E0B' }]}
                  onPress={() => router.push({ pathname: '/issue-review', params: { queryId: String(q.id), queryTitle: q.title } })}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="star-outline" size={16} color="#fff" />
                  <Text style={styles.closeBtnText}>Rate & Review</Text>
                </TouchableOpacity>
              ) : null}

              {/* Close & Review — for resolved requests */}
              {q.status === 'resolved' ? (
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: '#166534', opacity: closing === q.id ? 0.7 : 1 }]}
                  onPress={() => handleClose(q.id, q.title)}
                  disabled={closing === q.id}
                  activeOpacity={0.8}
                >
                  {closing === q.id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
                        <Text style={styles.closeBtnText}>Close &amp; Review</Text>
                      </>
                  }
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  list:        { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },

  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.sm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title:    { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  assetName:{ fontSize: 12 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta:     { fontSize: 12 },
  date:     { fontSize: 11 },

  resolutionBox:   { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, gap: 3 },
  resolutionLabel: { fontSize: 11, fontWeight: '700' },
  resolutionText:  { fontSize: 12 },

  closeBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md },
  closeBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  hintBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm },
});
