import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchMyRaisedQueries, closeAssetQuery } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';
import EmptyState from '../components/EmptyState';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open:     { bg: '#FEF9C3', text: '#92400E', label: 'Open' },
  resolved: { bg: '#DCFCE7', text: '#166534', label: 'Resolved' },
  closed:   { bg: '#F1F5F9', text: '#64748B', label: 'Closed' },
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

  // Close code modal state
  const [closeModal, setCloseModal] = useState<{ id: number; title: string } | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyRaisedQueries();
      setQueries(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleClose = async () => {
    if (!closeModal || !codeInput.trim()) return;
    setClosing(true);
    try {
      await closeAssetQuery(closeModal.id, codeInput.trim());
      setQueries((prev) =>
        prev.map((q) => q.id === closeModal.id ? { ...q, status: 'closed' } : q)
      );
      setCloseModal(null);
      setCodeInput('');
      Alert.alert('Success', 'Request closed successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Invalid code. Please try again.');
    } finally { setClosing(false); }
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

              {/* Show close button only for resolved requests */}
              {q.status === 'resolved' ? (
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: '#166534' }]}
                  onPress={() => { setCloseModal({ id: q.id, title: q.title }); setCodeInput(''); }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
                  <Text style={styles.closeBtnText}>Enter Code to Close</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Close Code Modal */}
      <Modal visible={!!closeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Close Request</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]} numberOfLines={2}>
              {closeModal?.title}
            </Text>
            <Text style={[styles.modalInstruction, { color: theme.textSecondary }]}>
              Enter the 6-digit close code from your notification:
            </Text>
            <TextInput
              style={[styles.codeInput, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
              value={codeInput}
              onChangeText={setCodeInput}
              placeholder="e.g. 123456"
              placeholderTextColor={theme.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
                onPress={() => { setCloseModal(null); setCodeInput(''); }}
              >
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#166534', opacity: closing ? 0.7 : 1 }]}
                onPress={handleClose}
                disabled={closing || !codeInput.trim()}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>{closing ? 'Closing...' : 'Close Request'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox:     { width: '100%', borderRadius: Radius.xl, padding: 24, gap: Spacing.md },
  modalTitle:   { fontSize: 17, fontWeight: '700' },
  modalSub:     { fontSize: 13 },
  modalInstruction: { fontSize: 13, lineHeight: 18 },
  codeInput: {
    borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 22, fontWeight: '700', letterSpacing: 6, textAlign: 'center',
  },
  modalBtns:    { flexDirection: 'row', gap: Spacing.sm },
  modalBtn:     { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  modalBtnText: { fontSize: 14, fontWeight: '600' },
});
