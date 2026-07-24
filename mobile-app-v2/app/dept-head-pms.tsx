/**
 * dept-head-pms.tsx
 * Department Head — PMS Review Screen
 *
 * Flow:
 *   Completed list → Tap item → Full detail (responses) → Close PMS
 */

import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { fetchDeptHeadPending, fetchDeptHeadDetail, submitDeptHeadReview } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';

// ─── Metadata capture ─────────────────────────────────────────────────────────
async function captureReviewMetadata(): Promise<Record<string, any>> {
  const meta: Record<string, any> = {
    deviceName: Device.deviceName ?? 'unknown',
    deviceModel: Device.modelName ?? 'unknown',
    os: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    platform: Platform.OS,
    reviewedAt: new Date().toISOString(),
  };
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      meta.gps = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy };
      const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (geo) {
        meta.address = [geo.name, geo.street, geo.city, geo.region, geo.country].filter(Boolean).join(', ');
      }
    }
  } catch {
    // GPS unavailable — skip silently
  }
  return meta;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PendingItem {
  id: number;
  assetName: string;
  generatedAssetId: string;
  departmentName: string;
  scheduleNumber: string;
  checklistName: string;
  maintenanceDate: string;
  submittedAt: string;
  engineerName: string;
  approvalStatus: string;
}

interface DetailItem extends PendingItem {
  engineerNotes?: string;
  engineerImages?: string[];
  approval_comments?: string;
  approvedByName?: string;
  approved_at?: string;
  responses: Array<{
    id: number;
    inspectionPoint: string;
    checkType: string;
    responseValue: string;
    remarks?: string;
    isMandatory: number | boolean;
    toleranceValue?: string;
  }>;
  auditLog: Array<{
    id: number;
    action: string;
    actor_name: string;
    actor_role: string;
    created_at: string;
    comments?: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const RESPONSE_PASS = new Set(['pass', 'yes', 'ok', 'cleaned', 'good', 'done', 'satisfactory']);
const RESPONSE_FAIL = new Set(['fail', 'no', 'not ok', 'not cleaned', 'bad', 'unsatisfactory']);

function responseColor(val: string): { bg: string; text: string } {
  const v = (val || '').toLowerCase().trim();
  if (RESPONSE_PASS.has(v)) return { bg: '#dcfce7', text: '#15803d' };
  if (RESPONSE_FAIL.has(v)) return { bg: '#fee2e2', text: '#dc2626' };
  return { bg: '#f1f5f9', text: '#374151' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <Text style={[s.sectionLabel, { color: theme.textMuted }]}>{text.toUpperCase()}</Text>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const { theme } = useTheme();
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <Text style={[s.infoLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[s.infoValue, { color: theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────────────────
function ReviewModal({
  visible, onClose, onSubmit, submitting,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (decision: 'closed' | 'rework_required', comments: string) => void;
  submitting: boolean;
}) {
  const { theme } = useTheme();
  const [comments, setComments] = useState('');

  const reset = () => setComments('');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { backgroundColor: theme.surface }]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: theme.textPrimary }]}>Review Submission</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <MaterialCommunityIcons name="close" size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[s.modalSub, { color: theme.textSecondary }]}>
            Add optional remarks, then close the PMS or request the engineer to redo it.
          </Text>

          {/* Comments */}
          <TextInput
            style={[s.commentInput, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
            placeholder="Remarks (optional)"
            placeholderTextColor={theme.textMuted}
            value={comments}
            onChangeText={setComments}
            multiline
            numberOfLines={3}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              style={[s.submitBtn, { flex: 1, backgroundColor: '#d97706', opacity: submitting ? 0.6 : 1 }]}
              onPress={() => onSubmit('rework_required', comments)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>↩  Request Rework</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submitBtn, { flex: 1, backgroundColor: '#0891b2', opacity: submitting ? 0.6 : 1 }]}
              onPress={() => onSubmit('closed', comments)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>🔒  Close PMS</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Detail Screen ────────────────────────────────────────────────────────────
function DetailView({ item, onBack, onReviewed }: { item: PendingItem; onBack: () => void; onReviewed: () => void }) {
  const { theme } = useTheme();
  const [detail, setDetail]       = useState<DetailItem | null>(null);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setFetchError(null);
    fetchDeptHeadDetail(item.id)
      .then(setDetail)
      .catch((err: any) => {
        setFetchError(err?.message || 'Could not load submission details.');
        setDetail(null);
      })
      .finally(() => setLoading(false));
  }, [item.id]);

  const handleReview = async (decision: 'closed' | 'rework_required', comments: string) => {
    setSubmitting(true);
    try {
      const reviewMetadata = await captureReviewMetadata();
      await submitDeptHeadReview(item.id, { decision, approvalComments: comments, reviewMetadata });
      setShowReview(false);
      const label = decision === 'closed' ? 'Closed' : 'Rework Requested';
      Alert.alert('Done', `Submission ${label} successfully.`, [{ text: 'OK', onPress: onReviewed }]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const OPEN_STATUSES = ['pending', 'auto_approved', 'completed'];
  const isOpen = detail
    ? (!['closed', 'rework_required', 'rejected'].includes(detail.approval_status ?? '') &&
       !['closed', 'rework_required'].includes(detail.status ?? ''))
    : !['closed', 'rework_required', 'rejected'].includes(item.approvalStatus ?? '');

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.assetName}</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>{item.scheduleNumber}</Text>
        </View>
        {isOpen && (
          <TouchableOpacity
            style={[s.reviewBtn, { backgroundColor: theme.primary }]}
            onPress={() => setShowReview(true)}
            activeOpacity={0.85}
          >
            <Text style={s.reviewBtnText}>Review</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : fetchError ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#dc2626" />
          <Text style={{ color: '#dc2626', fontSize: 14, fontWeight: '700', marginTop: 12, textAlign: 'center' }}>Failed to load details</Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 24 }}>{fetchError}</Text>
          <TouchableOpacity
            style={[s.reviewBtn, { backgroundColor: theme.primary, marginTop: 20, paddingHorizontal: 24 }]}
            onPress={() => {
              setLoading(true); setFetchError(null);
              fetchDeptHeadDetail(item.id).then(setDetail).catch((e: any) => setFetchError(e?.message || 'Error')).finally(() => setLoading(false));
            }}>
            <Text style={s.reviewBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !detail ? (
        <View style={s.center}><Text style={{ color: theme.textMuted }}>Could not load details.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.detailScroll} showsVerticalScrollIndicator={false}>

          {/* Summary card */}
          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionLabel text="Submission Summary" />
            <InfoRow label="Asset" value={detail.assetName} />
            <InfoRow label="Asset Code" value={detail.generatedAssetId} />
            <InfoRow label="Department" value={detail.departmentName} />
            <InfoRow label="Checklist" value={detail.checklistName} />
            <InfoRow label="Schedule" value={detail.scheduleNumber} />
            <InfoRow label="Scheduled Date" value={fmt(detail.maintenanceDate)} />
            <InfoRow label="Submitted" value={fmtTime((detail as any).submittedAt || (detail as any).submitted_at)} />
            <InfoRow label="Engineer" value={detail.engineerName} />
            {detail.engineerNotes ? (
              <View style={[s.notesBox, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e', marginBottom: 2 }}>ENGINEER REMARKS</Text>
                <Text style={{ fontSize: 13, color: '#78350f' }}>{detail.engineerNotes}</Text>
              </View>
            ) : null}
            {detail.approval_comments ? (
              <View style={[s.notesBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803d', marginBottom: 2 }}>DEPT. HEAD COMMENTS</Text>
                <Text style={{ fontSize: 13, color: '#166534' }}>{detail.approval_comments}</Text>
              </View>
            ) : null}
          </View>

          {/* Checklist responses */}
          <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionLabel text={`Checklist Responses (${detail.responses.length})`} />
            {detail.responses.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={36} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                  No checklist responses were recorded for this submission.
                </Text>
                {detail.engineerNotes ? null : (
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                    The engineer may have submitted without a checklist assigned to this asset.
                  </Text>
                )}
              </View>
            ) : detail.responses.map((r, idx) => {
              const rc = responseColor(r.responseValue);
              return (
                <View key={r.id} style={[s.responseRow, { borderBottomColor: theme.border }]}>
                  <View style={s.responseLeft}>
                    <Text style={[s.responseNum, { color: theme.textMuted }]}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.responsePoint, { color: theme.textPrimary }]}>
                      {r.inspectionPoint}
                      {r.isMandatory ? <Text style={{ color: '#ef4444' }}> *</Text> : null}
                    </Text>
                    <Text style={[s.responseType, { color: theme.textMuted }]}>{r.checkType}</Text>
                    {r.remarks ? <Text style={[s.responseRemarks, { color: theme.textSecondary }]}>{r.remarks}</Text> : null}
                  </View>
                  <View style={[s.responseBadge, { backgroundColor: rc.bg }]}>
                    <Text style={[s.responseBadgeText, { color: rc.text }]}>{r.responseValue || '—'}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Audit log */}
          {detail.auditLog.length > 0 && (
            <View style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SectionLabel text="Audit Timeline" />
              {detail.auditLog.map((log, idx) => (
                <View key={log.id} style={s.auditRow}>
                  <View style={[s.auditDot, { backgroundColor: idx === detail.auditLog.length - 1 ? theme.primary : theme.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.auditAction, { color: theme.textPrimary }]}>
                      {log.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Text>
                    <Text style={[s.auditMeta, { color: theme.textMuted }]}>
                      {log.actor_name} · {log.actor_role.replace(/_/g, ' ')} · {fmtTime(log.created_at)}
                    </Text>
                    {log.comments ? <Text style={[s.auditComment, { color: theme.textSecondary }]}>{log.comments}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Review button at bottom */}
          {isOpen && (
            <TouchableOpacity
              style={[s.bottomReviewBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowReview(true)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="clipboard-check-outline" size={20} color="#fff" />
              <Text style={s.reviewBtnText}>  Submit Review</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <ReviewModal
        visible={showReview}
        onClose={() => setShowReview(false)}
        onSubmit={handleReview}
        submitting={submitting}
      />
    </SafeAreaView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DeptHeadPmsScreen() {
  const { theme } = useTheme();
  const [items, setItems]         = useState<PendingItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]   = useState<PendingItem | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchDeptHeadPending();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (selected) {
    return (
      <DetailView
        item={selected}
        onBack={() => setSelected(null)}
        onReviewed={() => { setSelected(null); void load(); }}
      />
    );
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[s.headerTitle, { color: theme.textPrimary }]}>PMS Review</Text>
          <Text style={[s.headerSub, { color: theme.textMuted }]}>Pending engineer submissions</Text>
        </View>
        {items.length > 0 && (
          <View style={[s.countBadge, { backgroundColor: theme.primary }]}>
            <Text style={s.countBadgeText}>{items.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={52} color={theme.textMuted} />
              <Text style={[s.emptyTitle, { color: theme.textPrimary }]}>All Clear</Text>
              <Text style={[s.emptySub, { color: theme.textMuted }]}>No completed PMS submissions awaiting closure.</Text>
            </View>
          ) : items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[s.itemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => setSelected(item)}
              activeOpacity={0.75}
            >
              {/* Left accent */}
              <View style={[s.itemAccent, { backgroundColor: '#7c3aed' }]} />

              <View style={{ flex: 1, gap: 4 }}>
                {/* Asset name + schedule */}
                <View style={s.rowBetween}>
                  <Text style={[s.itemAsset, { color: theme.textPrimary }]} numberOfLines={1}>{item.assetName}</Text>
                  <Text style={[s.itemSchedule, { color: theme.primary }]}>{item.scheduleNumber}</Text>
                </View>

                {/* Department + checklist */}
                <Text style={[s.itemMeta, { color: theme.textSecondary }]}>
                  {item.departmentName}  ·  {item.checklistName}
                </Text>

                {/* Engineer + date */}
                <View style={s.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="account-outline" size={13} color={theme.textMuted} />
                    <Text style={[s.itemMeta, { color: theme.textMuted }]}>{item.engineerName}</Text>
                  </View>
                  <Text style={[s.itemDate, { color: theme.textMuted }]}>
                    {fmtTime(item.submittedAt)}
                  </Text>
                </View>
              </View>

              <View style={[s.pendingChip, { backgroundColor: '#e0f2fe' }]}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#0891b2' }}>COMPLETED</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:            { flex: 1 },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:          { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1 },
  headerTitle:     { fontSize: 16, fontWeight: '700' },
  headerSub:       { fontSize: 12, marginTop: 1 },
  reviewBtn:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.md },
  reviewBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  bottomReviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: Radius.lg, marginTop: 4 },
  countBadge:      { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countBadgeText:  { color: '#fff', fontWeight: '800', fontSize: 12 },

  // List
  listScroll:  { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 40 },
  itemCard:    { flexDirection: 'row', alignItems: 'stretch', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', gap: Spacing.sm },
  itemAccent:  { width: 4 },
  itemAsset:   { fontSize: 14, fontWeight: '700', flex: 1 },
  itemSchedule:{ fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  itemMeta:    { fontSize: 12 },
  itemDate:    { fontSize: 11 },
  pendingChip: { alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, marginRight: 8 },
  rowBetween:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Detail
  detailScroll:  { padding: Spacing.md, gap: Spacing.md, paddingBottom: 40 },
  card:          { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 6 },
  sectionLabel:  { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 3 },
  infoLabel:     { fontSize: 12, flex: 0.45 },
  infoValue:     { fontSize: 13, fontWeight: '600', flex: 0.55, textAlign: 'right' },
  notesBox:      { borderRadius: Radius.md, borderWidth: 1, padding: 10, marginTop: 6 },

  // Responses
  responseRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  responseLeft:  { width: 20, alignItems: 'center', paddingTop: 2 },
  responseNum:   { fontSize: 11, fontWeight: '700' },
  responsePoint: { fontSize: 13, fontWeight: '600' },
  responseType:  { fontSize: 11, marginTop: 1 },
  responseRemarks:{ fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  responseBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start', marginTop: 2 },
  responseBadgeText:{ fontSize: 11, fontWeight: '700' },

  // Audit
  auditRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  auditDot:    { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  auditAction: { fontSize: 13, fontWeight: '700' },
  auditMeta:   { fontSize: 11, marginTop: 1 },
  auditComment:{ fontSize: 12, marginTop: 3, fontStyle: 'italic' },

  // Empty
  emptyBox:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub:   { fontSize: 13, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, gap: Spacing.md, paddingBottom: 36 },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle:   { fontSize: 17, fontWeight: '800' },
  modalSub:     { fontSize: 13 },
  decisionRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  decisionBtn:  { width: '47%', alignItems: 'center', paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 2, gap: 2 },
  commentInput: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 13, minHeight: 72, textAlignVertical: 'top' },
  submitBtn:    { height: 50, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  submitBtnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
});
