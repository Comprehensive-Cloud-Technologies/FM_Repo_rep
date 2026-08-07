import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssignedQueries, resolveAssetQuery, uploadQueryImage, getToken } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';
import Header from '../components/Header';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open:        { bg: '#FEF9C3', text: '#92400E', label: 'Open' },
  in_progress: { bg: '#DBEAFE', text: '#1D4ED8', label: 'In Progress' },
  resolved:    { bg: '#DCFCE7', text: '#166534', label: 'Resolved ✓' },
  closed:      { bg: '#F1F5F9', text: '#64748B', label: 'Closed' },
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

// ─── Small photo strip used in the modal ──────────────────────────────────────
function PhotoStrip({
  label, photos, onAdd, onRemove, uploading, theme, max = 3,
}: {
  label: string; photos: string[]; onAdd: () => void; onRemove: (i: number) => void;
  uploading: boolean; theme: any; max?: number;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((uri, i) => (
          <View key={i} style={{ position: 'relative' }}>
            <Image source={{ uri }} style={styles.thumb} />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(i)}
              hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < max && (
          <TouchableOpacity
            style={[styles.addPhotoBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={onAdd}
            disabled={uploading}
            activeOpacity={0.7}
          >
            {uploading
              ? <ActivityIndicator size="small" color={theme.primary} />
              : <MaterialCommunityIcons name="camera-plus-outline" size={24} color={theme.textMuted} />
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function AssignedQueriesScreen() {
  const { theme } = useTheme();
  const [queries, setQueries]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve modal
  const [resolveModal, setResolveModal] = useState<{ id: number; title: string } | null>(null);
  const [resNote, setResNote]           = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [partsReplaced, setPartsReplaced]   = useState('');
  const [beforePhotos, setBeforePhotos]     = useState<string[]>([]);
  const [afterPhotos, setAfterPhotos]       = useState<string[]>([]);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter]   = useState(false);
  const [resolving, setResolving]             = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const resetModal = () => {
    setResolveModal(null);
    setResNote(''); setCompletionNote(''); setPartsReplaced('');
    setBeforePhotos([]); setAfterPhotos([]);
  };

  const load = useCallback(async () => {
    try {
      const data = await fetchAssignedQueries();
      setQueries(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // ── Photo picker helper ────────────────────────────────────────────────────
  const pickPhoto = async (
    side: 'before' | 'after',
  ) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (result.canceled || !result.assets?.length) return;

    const uri = result.assets[0].uri;
    const token = await getToken();
    if (!token) return;

    if (side === 'before') setUploadingBefore(true);
    else setUploadingAfter(true);

    try {
      const url = await uploadQueryImage(token, uri);
      if (side === 'before') setBeforePhotos((p) => [...p, url]);
      else setAfterPhotos((p) => [...p, url]);
    } catch {
      Alert.alert('Upload failed', 'Could not upload the photo. Please try again.');
    } finally {
      setUploadingBefore(false);
      setUploadingAfter(false);
    }
  };

  // ── Resolve submit ─────────────────────────────────────────────────────────
  const handleResolve = async () => {
    if (!resolveModal) return;
    if (!resNote.trim()) {
      Alert.alert('Required', 'Please enter resolution remarks before submitting.');
      return;
    }
    setResolving(true);
    try {
      const fullNote = [resNote.trim(), completionNote.trim()].filter(Boolean).join('\n\n');
      const result = await resolveAssetQuery(resolveModal.id, {
        resolutionNote: fullNote,
        partsReplaced: partsReplaced.trim() || undefined,
        beforePhotos:  beforePhotos.length ? beforePhotos : undefined,
        afterPhotos:   afterPhotos.length  ? afterPhotos  : undefined,
      });
      setQueries((prev) =>
        prev.map((q) => q.id === resolveModal.id ? { ...q, status: 'resolved' } : q)
      );
      resetModal();
      Alert.alert(
        '✅ Issue Resolved',
        `The requester has been notified.\n\nClose code sent: ${result.closeCode}\n\n(The requester must enter this code to formally close the issue.)`,
        [{ text: 'OK' }]
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
              style={[styles.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
            >
              <View style={styles.cardTop}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>{q.title}</Text>
                  <Text style={[styles.assetName, { color: theme.textSecondary }]}>
                    {q.assetName}{q.assetUniqueId ? ` · ${q.assetUniqueId}` : ''}
                  </Text>
                </View>
                <StatusBadge status={q.status} />
              </View>

              <View style={styles.metaRow}>
                <MaterialCommunityIcons name="account-outline" size={13} color={theme.textMuted} />
                <Text style={[styles.meta, { color: theme.textSecondary }]}>Raised by {q.raisedByName || 'Unknown'}</Text>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY_COLORS[q.priority] || '#94A3B8', marginLeft: Spacing.sm }} />
                <Text style={[styles.meta, { color: theme.textMuted, textTransform: 'capitalize' }]}>{q.priority}</Text>
              </View>

              {q.description ? (
                <Text style={[styles.desc, { color: theme.textSecondary }]} numberOfLines={3}>{q.description}</Text>
              ) : null}

              {/* Resolution summary for already-resolved issues */}
              {q.resolutionNote ? (
                <View style={[styles.noteBox, { backgroundColor: theme.primaryBg, borderColor: theme.primaryLight + '40' }]}>
                  <Text style={[styles.noteLabel, { color: theme.primary }]}>Resolution remarks</Text>
                  <Text style={[styles.noteText, { color: theme.textSecondary }]}>{q.resolutionNote}</Text>
                  {q.partsReplaced ? (
                    <>
                      <Text style={[styles.noteLabel, { color: theme.primary, marginTop: 6 }]}>Parts replaced</Text>
                      <Text style={[styles.noteText, { color: theme.textSecondary }]}>{q.partsReplaced}</Text>
                    </>
                  ) : null}
                  {/* After photos from resolved query */}
                  {Array.isArray(q.afterPhotos) && q.afterPhotos.length > 0 ? (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {q.afterPhotos.map((u: string, i: number) => (
                        <Image key={i} source={{ uri: u }} style={{ width: 64, height: 64, borderRadius: 8 }} />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Text style={[styles.date, { color: theme.textMuted }]}>
                {new Date(q.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>

              {/* Complete Issue — only for open/in-progress */}
              {(q.status === 'open' || q.status === 'in_progress') ? (
                <TouchableOpacity
                  style={[styles.resolveBtn, { backgroundColor: theme.primary }]}
                  onPress={() => { setResolveModal({ id: q.id, title: q.title }); }}
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

      {/* ── Rich Resolve Modal ─────────────────────────────────────────────── */}
      <Modal visible={!!resolveModal} transparent animationType="slide" onRequestClose={resetModal}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Complete Issue</Text>
                  <Text style={[styles.modalSub, { color: theme.textSecondary }]} numberOfLines={1}>
                    {resolveModal?.title}
                  </Text>
                </View>
                <TouchableOpacity onPress={resetModal} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ maxHeight: '85%' }} contentContainerStyle={{ gap: Spacing.md, paddingBottom: 16 }}>
                {/* Info banner */}
                <View style={[styles.infoBanner, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                  <MaterialCommunityIcons name="information-outline" size={15} color="#1d4ed8" />
                  <Text style={{ fontSize: 12, color: '#1d4ed8', flex: 1, lineHeight: 17 }}>
                    After submitting, a 6-digit close code will be sent to the requester. They must enter it to officially close the issue.
                  </Text>
                </View>

                {/* Resolution Remarks (required) */}
                <View style={{ gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    Resolution Remarks <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={[styles.textArea, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                    value={resNote}
                    onChangeText={setResNote}
                    placeholder="Describe the work performed and what was fixed…"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Completion Notes */}
                <View style={{ gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Completion Notes (optional)</Text>
                  <TextInput
                    style={[styles.textArea, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background, minHeight: 60 }]}
                    value={completionNote}
                    onChangeText={setCompletionNote}
                    placeholder="Any additional notes for the admin or requester…"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                </View>

                {/* Parts Replaced */}
                <View style={{ gap: 6 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Parts Replaced (optional)</Text>
                  <TextInput
                    style={[styles.textArea, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background, minHeight: 50 }]}
                    value={partsReplaced}
                    onChangeText={setPartsReplaced}
                    placeholder="e.g. Pressure valve, O-ring, filter cartridge…"
                    placeholderTextColor={theme.textMuted}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                </View>

                {/* Before Photos */}
                <PhotoStrip
                  label="Before Photos (optional)"
                  photos={beforePhotos}
                  onAdd={() => pickPhoto('before')}
                  onRemove={(i) => setBeforePhotos((p) => p.filter((_, idx) => idx !== i))}
                  uploading={uploadingBefore}
                  theme={theme}
                />

                {/* After Photos */}
                <PhotoStrip
                  label="After Photos (optional)"
                  photos={afterPhotos}
                  onAdd={() => pickPhoto('after')}
                  onRemove={(i) => setAfterPhotos((p) => p.filter((_, idx) => idx !== i))}
                  uploading={uploadingAfter}
                  theme={theme}
                />
              </ScrollView>

              {/* Action buttons */}
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.border }]}
                  onPress={resetModal}
                >
                  <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.primary, opacity: resolving ? 0.7 : 1, flex: 2 }]}
                  onPress={handleResolve}
                  disabled={resolving}
                >
                  {resolving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <MaterialCommunityIcons name="check-decagram" size={16} color="#fff" />
                        <Text style={[styles.modalBtnText, { color: '#fff' }]}>Submit & Send Code</Text>
                      </>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, gap: Spacing.sm,
  },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title:    { fontSize: 15, fontWeight: '700', lineHeight: 21 },
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

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: {
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    gap: Spacing.md, maxHeight: '92%',
  },
  modalTitle:    { fontSize: 17, fontWeight: '700' },
  modalSub:      { fontSize: 12 },
  infoBanner:    { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  fieldLabel:    { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  textArea:      { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 13, minHeight: 80 },
  modalBtns:     { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  modalBtn:      { flex: 1, paddingVertical: 13, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  modalBtnText:  { fontSize: 14, fontWeight: '700' },

  // Photo strip
  thumb:      { width: 72, height: 72, borderRadius: Radius.md },
  removeBtn:  { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 12 },
  addPhotoBtn:{ width: 72, height: 72, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
