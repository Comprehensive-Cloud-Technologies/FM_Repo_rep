import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssignedQueries, resolveAssetQuery } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open:     { bg: '#FEF9C3', text: '#92400E', label: 'Open' },
  resolved: { bg: '#DCFCE7', text: '#166534', label: 'Resolved' },
  closed:   { bg: '#F1F5F9', text: '#64748B', label: 'Closed' },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#DC2626', high: '#EA580C', normal: '#2563EB', low: '#16A34A',
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: c.text }}>{c.label}</Text>
    </View>
  );
}

export default function AssignedQueriesScreen() {
  const { theme } = useTheme();
  const [queries, setQueries]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve modal state
  const [resolveModal, setResolveModal] = useState<{ id: number; title: string } | null>(null);
  const [noteInput, setNoteInput]       = useState('');
  const [resolving, setResolving]       = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAssignedQueries();
      setQueries(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleResolve = async () => {
    if (!resolveModal) return;
    setResolving(true);
    try {
      const result = await resolveAssetQuery(resolveModal.id, noteInput.trim() || undefined);
      setQueries((prev) =>
        prev.map((q) => q.id === resolveModal.id ? { ...q, status: 'resolved' } : q)
      );
      setResolveModal(null);
      setNoteInput('');
      Alert.alert(
        'Issue Resolved',
        `A 6-digit close code has been sent to the requester via notification.\n\nClose code: ${result.closeCode}`,
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to resolve. Please try again.');
    } finally { setResolving(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Assigned Issues" showBack />

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={queries.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {queries.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={52} color={theme.textMuted} />
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No assigned issues</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Issues assigned to you will appear here.</Text>
            </View>
          ) : queries.map((q) => (
            <View
              key={q.id}
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.cardShadow }]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                  <Text style={[styles.assetName, { color: theme.textSecondary }]}>
                    {q.assetName}
                    {q.assetUniqueId ? ` · ${q.assetUniqueId}` : ''}
                  </Text>
                </View>
                <StatusBadge status={q.status} />
              </View>

              {/* Meta row */}
              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="account-outline" size={13} color={theme.textMuted} />
                <Text style={[styles.meta, { color: theme.textSecondary }]}>
                  Raised by {q.raisedByName || 'Unknown'}
                </Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY_COLORS[q.priority] || '#94A3B8', marginLeft: Spacing.sm }} />
                <Text style={[styles.meta, { color: theme.textMuted, textTransform: 'capitalize' }]}>{q.priority}</Text>
              </View>

              {q.description ? (
                <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={3}>{q.description}</Text>
              ) : null}

              {q.resolutionNote ? (
                <View style={[styles.noteBox, { backgroundColor: theme.primaryBg, borderColor: theme.primaryLight + '40' }]}>
                  <Text style={[styles.noteLabel, { color: theme.primary }]}>Your resolution note</Text>
                  <Text style={[styles.noteText, { color: theme.textSecondary }]}>{q.resolutionNote}</Text>
                </View>
              ) : null}

              <Text style={[styles.date, { color: theme.textMuted }]}>
                {new Date(q.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>

              {/* Complete Issue button — only for open requests */}
              {q.status === 'open' ? (
                <TouchableOpacity
                  style={[styles.resolveBtn, { backgroundColor: theme.primary }]}
                  onPress={() => { setResolveModal({ id: q.id, title: q.title }); setNoteInput(''); }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="check-decagram" size={16} color="#fff" />
                  <Text style={styles.resolveBtnText}>Complete Issue</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Resolve Modal */}
      <Modal visible={!!resolveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Complete Issue</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]} numberOfLines={2}>
              {resolveModal?.title}
            </Text>
            <Text style={[styles.modalInstruction, { color: theme.textSecondary }]}>
              Add an optional resolution note, then tap "Complete". A close code will be sent to the requester.
            </Text>
            <TextInput
              style={[styles.noteInput, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Resolution note (optional)..."
              placeholderTextColor={theme.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
                onPress={() => { setResolveModal(null); setNoteInput(''); }}
              >
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.primary, opacity: resolving ? 0.7 : 1 }]}
                onPress={handleResolve}
                disabled={resolving}
              >
                {resolving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Complete Issue</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  list:      { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },
  emptyWrap: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
  emptyBox:  { alignItems: 'center', gap: Spacing.md },
  emptyTitle:{ fontSize: 17, fontWeight: '700' },
  emptySub:  { fontSize: 13, textAlign: 'center' },

  card: {
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, gap: Spacing.sm,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title:    { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  assetName:{ fontSize: 12 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta:     { fontSize: 12 },
  desc:     { fontSize: 13, lineHeight: 18 },
  date:     { fontSize: 11 },
  noteBox:  { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, gap: 2 },
  noteLabel:{ fontSize: 11, fontWeight: '700' },
  noteText: { fontSize: 12 },

  resolveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.md },
  resolveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: 24, gap: Spacing.md },
  modalTitle:   { fontSize: 17, fontWeight: '700' },
  modalSub:     { fontSize: 13 },
  modalInstruction: { fontSize: 13, lineHeight: 18 },
  noteInput:    { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 13, minHeight: 80 },
  modalBtns:    { flexDirection: 'row', gap: Spacing.md },
  modalBtn:     { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 14, fontWeight: '700' },
});
