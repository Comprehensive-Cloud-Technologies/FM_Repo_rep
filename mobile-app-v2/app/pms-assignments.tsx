/**
 * pms-assignments.tsx
 * Engineer's PMS assignment list → QR scan verification → Checklist fill → Complete
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert, TextInput, Modal, SafeAreaView as RNSafeAreaView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import {
  fetchMyPmsAssignments, fetchMyPmsChecklist,
  startPmsAssignment, submitPmsCompletion, verifyAssetQr,
} from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';

// ─── Capture submission metadata (GPS + device) ───────────────────────────────
async function captureSubmissionMetadata(): Promise<Record<string, any>> {
  const meta: Record<string, any> = {
    deviceName: Device.deviceName ?? 'Unknown',
    deviceModel: Device.modelName ?? 'Unknown',
    os: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    appVersion: Constants.expoConfig?.version ?? (Constants.manifest as any)?.version ?? '—',
    platform: Platform.OS,
    submittedAt: new Date().toISOString(),
  };

  // GPS
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      meta.gps = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy };
      const geo = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (geo.length > 0) {
        const g = geo[0];
        meta.address = [g.name, g.street, g.district, g.city, g.region, g.country].filter(Boolean).join(', ');
      }
    }
  } catch { /* GPS unavailable, skip */ }

  return meta;
}

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: 'Assigned',    color: '#2563EB', bg: '#dbeafe' },
  in_progress:      { label: 'In Progress', color: '#D97706', bg: '#ffedd5' },
  completed:        { label: 'Completed',   color: '#059669', bg: '#dcfce7' },
  pending_approval: { label: 'Completed',   color: '#059669', bg: '#dcfce7' },
  closed:           { label: 'Closed',      color: '#0891b2', bg: '#e0f2fe' },
  rework_required:  { label: 'Rework',      color: '#D97706', bg: '#ffedd5' },
  rejected:         { label: 'Rejected',    color: '#DC2626', bg: '#fee2e2' },
  missed:           { label: 'Missed',      color: '#DC2626', bg: '#fee2e2' },
};
const getStatus = (s: string) => STATUS[s] || STATUS.pending;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function PmsAssignmentsScreen() {
  const { theme } = useTheme();
  const { status: initialStatus } = useLocalSearchParams<{ status?: string }>();

  // List view state
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filterStatus, setFilterStatus] = useState(initialStatus || '');

  // Detail / QR / Checklist state
  const [view, setView] = useState<'list' | 'qr' | 'checklist'>('list');
  const [selected, setSelected] = useState<any>(null);
  const [checklistData, setChecklistData] = useState<any>(null);
  const [responses, setResponses]         = useState<Record<number, string>>({});
  const [submitting, setSubmitting]       = useState(false);

  // QR Scanner state
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned]           = useState(false);
  const [scanError, setScanError]       = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchMyPmsAssignments(filterStatus || undefined);
      setAssignments(Array.isArray(data) ? data : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { void load(); }, [load]);

  const openItem = (item: any) => {
    setSelected(item);
    setScanned(false);
    setScanError('');
    setView('qr');
  };

  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    const scannedVal = data.trim();

    // Step 1: fast local check against every known ID for this asset
    const candidates = [
      (selected?.assetQrCode     || '').trim(),
      (selected?.assetUniqueId   || '').trim(),
      (selected?.generatedAssetId || '').trim(),
    ].filter(Boolean);
    const localMatch = candidates.some(exp =>
      scannedVal === exp || data.includes(exp) || exp.includes(scannedVal)
    );
    if (localMatch) { loadChecklist(); return; }

    // Step 2: server-side lookup — the QR may be stored only in asset_pre_qr
    //         or the local IDs were not populated (e.g. asset_unique_id is null)
    verifyAssetQr(scannedVal, selected?.assetId ?? selected?.asset_id ?? selected?.id)
      .then((serverMatch) => {
        if (serverMatch) {
          loadChecklist();
        } else {
          const displayExpected = selected?.generatedAssetId || selected?.assetUniqueId || selected?.assetQrCode || '';
          setScanError(`QR mismatch.\nScanned: ${data}\nExpected: ${displayExpected}`);
        }
      })
      .catch(() => {
        // Network failure — fall back to showing the mismatch error
        const displayExpected = selected?.generatedAssetId || selected?.assetUniqueId || selected?.assetQrCode || '';
        setScanError(`QR mismatch.\nScanned: ${data}\nExpected: ${displayExpected}`);
      });
  };

  const loadChecklist = async () => {
    if (!selected) return;
    try {
      await startPmsAssignment(selected.id).catch(() => {}); // Mark in_progress
      const data = await fetchMyPmsChecklist(selected.id);
      setChecklistData(data);
      // Init responses
      const init: Record<number, string> = {};
      (data.checklistItems || []).forEach((item: any) => { init[item.id] = ''; });
      setResponses(init);
      setView('checklist');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not load checklist');
      setScanned(false);
    }
  };

  const submitChecklist = async () => {
    const items: any[] = checklistData?.checklistItems || [];
    const missing = items.filter((it: any) => it.is_mandatory && !responses[it.id]?.trim());
    if (missing.length) {
      Alert.alert('Required', `Please complete all mandatory questions (${missing.length} remaining).`);
      return;
    }
    setSubmitting(true);
    try {
      const responsePayload = items.map((it: any) => ({
        checklistItemId: it.id,
        responseValue: responses[it.id] ?? '',
      }));
      const meta = await captureSubmissionMetadata();
      await submitPmsCompletion(selected.id, { responses: responsePayload, submissionMetadata: meta });
      Alert.alert(
        'PMS Completed',
        'Checklist submitted successfully. Awaiting Department Head to close the PMS.',
        [{ text: 'OK', onPress: () => { setView('list'); void load(); } }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not complete');
    } finally { setSubmitting(false); }
  };

  // ── QR Scanner View ────────────────────────────────────────────────────────
  if (view === 'qr') {
    return (
      <SafeAreaView style={[ss.safe, { backgroundColor: '#000' }]}>
        {/* Header */}
        <View style={[ss.header, { backgroundColor: '#000', borderBottomColor: '#333' }]}>
          <TouchableOpacity onPress={() => setView('list')} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={[ss.headerTitle, { color: '#fff', marginLeft: 10 }]}>Scan Asset QR</Text>
        </View>
        <View style={{ flex: 1 }}>
          {/* Asset info banner */}
          <View style={ss.scanBanner}>
            <MaterialCommunityIcons name="hospital-box-outline" size={20} color="#1d4ed8" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontWeight: '700', fontSize: 14, color: '#0f172a' }}>{selected?.assetName}</Text>
              <Text style={{ fontSize: 12, color: '#64748b' }}>ID: {selected?.generatedAssetId || selected?.assetUniqueId} · {selected?.departmentName || '—'}</Text>
            </View>
          </View>

          {scanError ? (
            <View style={ss.scanErrorBox}>
              <MaterialCommunityIcons name="alert-circle" size={36} color="#DC2626" />
              <Text style={ss.scanErrorText}>{scanError}</Text>
              <TouchableOpacity style={ss.retryBtn} onPress={() => { setScanned(false); setScanError(''); }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ss.retryBtn, { backgroundColor: '#64748b', marginTop: 8 }]} onPress={loadChecklist}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Skip QR & Continue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {!permission?.granted ? (
                <View style={ss.scanErrorBox}>
                  <Text style={{ color: '#fff', marginBottom: 12 }}>Camera permission required</Text>
                  <TouchableOpacity style={ss.retryBtn} onPress={requestPermission}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Grant Permission</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <CameraView style={StyleSheet.absoluteFill} facing="back"
                  onBarcodeScanned={scanned ? undefined : handleScan}>
                  <View style={ss.scanOverlay}>
                    <View style={ss.scanFrame} />
                    <Text style={ss.scanHint}>Point camera at the QR code on the asset</Text>
                  </View>
                </CameraView>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Checklist View ─────────────────────────────────────────────────────────
  if (view === 'checklist' && checklistData) {
    const items: any[] = checklistData.checklistItems || [];
    return (
      <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]}>
        <View style={[ss.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setView('list')} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[ss.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {checklistData.checklistName || 'PMS Checklist'}
            </Text>
            <Text style={[ss.headerSub, { color: theme.textMuted }]} numberOfLines={1}>
              {checklistData.assetName} · {checklistData.schedule_number}
            </Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={ss.scroll} keyboardShouldPersistTaps="handled">
          {/* Info banner */}
          <View style={[ss.infoBanner, { borderColor: theme.border }]}>
            <Text style={{ fontWeight: '700', color: theme.textPrimary, fontSize: 13 }}>
              {checklistData.assetName}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              {checklistData.generatedAssetId || checklistData.assetUniqueId}{checklistData.departmentName ? ` · ${checklistData.departmentName}` : ''}
            </Text>
            <Text style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>
              Date: {(checklistData.maintenance_date || '').split('T')[0]}
            </Text>
          </View>

          {/* Questions */}
          {items.map((item: any, i: number) => (
            <View key={item.id} style={[ss.questionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <Text style={[ss.questionNum, { backgroundColor: theme.primaryBg, color: theme.primary }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[ss.questionText, { color: theme.textPrimary }]}>
                    {item.inspection_point}
                    {item.is_mandatory ? <Text style={{ color: '#DC2626' }}> *</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                    {item.check_type} · {item.response_type}
                  </Text>
                </View>
              </View>
              {/* Response input based on response_type */}
              {item.response_type === 'Pass/Fail' || item.response_type === 'Yes/No' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(item.response_type === 'Pass/Fail' ? ['Pass', 'Fail'] : ['Yes', 'No']).map(opt => (
                    <TouchableOpacity key={opt}
                      style={[ss.optBtn, {
                        backgroundColor: responses[item.id] === opt ? (opt === 'Pass' || opt === 'Yes' ? '#dcfce7' : '#fee2e2') : theme.background,
                        borderColor: responses[item.id] === opt ? (opt === 'Pass' || opt === 'Yes' ? '#16a34a' : '#dc2626') : theme.border,
                      }]}
                      onPress={() => setResponses(p => ({ ...p, [item.id]: opt }))}>
                      <Text style={{ fontWeight: '700', color: responses[item.id] === opt ? (opt === 'Pass' || opt === 'Yes' ? '#15803d' : '#dc2626') : theme.textMuted }}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={[ss.responseInput, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }]}
                  placeholder={item.response_type === 'Numeric' ? 'Enter value…' : 'Enter response…'}
                  placeholderTextColor={theme.textMuted}
                  value={responses[item.id] || ''}
                  onChangeText={v => setResponses(p => ({ ...p, [item.id]: v }))}
                  keyboardType={item.response_type === 'Numeric' ? 'numeric' : 'default'}
                  multiline={item.response_type === 'Text'}
                />
              )}
              {item.tolerance_value ? (
                <Text style={{ fontSize: 11, color: '#d97706', marginTop: 5 }}>Tolerance: {item.tolerance_value}</Text>
              ) : null}
            </View>
          ))}

          {items.length === 0 && (
            <View style={ss.emptyBox}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={40} color={theme.textMuted} />
              <Text style={[ss.emptyText, { color: theme.textMuted }]}>No checklist questions defined.</Text>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity style={[ss.submitBtn, { opacity: submitting ? 0.6 : 1 }]}
            onPress={submitChecklist} disabled={submitting}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={ss.submitText}>✓ Mark PMS Complete</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────────
  const filters = ['', 'pending', 'in_progress', 'completed', 'rework_required', 'missed'];
  const filterLabels: Record<string, string> = {
    '': 'All', pending: 'Assigned', in_progress: 'In Progress', completed: 'Completed',
    rework_required: 'Rework', missed: 'Missed',
  };

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]}>
      <View style={[ss.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[ss.headerTitle, { color: theme.textPrimary, marginLeft: 10 }]}>My PMS Tasks</Text>
        <TouchableOpacity onPress={() => void load()} style={{ marginLeft: 'auto', padding: 4 }}>
          <MaterialCommunityIcons name="refresh" size={20} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' }}>
        {filters.map(f => (
          <TouchableOpacity key={f}
            style={[ss.chip, { backgroundColor: filterStatus === f ? theme.primary : theme.surface, borderColor: filterStatus === f ? theme.primary : theme.border }]}
            onPress={() => setFilterStatus(f)}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: filterStatus === f ? '#fff' : theme.textSecondary }}>
              {filterLabels[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[ss.scroll, { paddingTop: 4 }]} showsVerticalScrollIndicator={false}>
          {assignments.length === 0 ? (
            <View style={ss.emptyBox}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={48} color={theme.textMuted} />
              <Text style={[ss.emptyText, { color: theme.textMuted }]}>No PMS assignments found.</Text>
            </View>
          ) : (
            assignments.map(item => {
              const st = getStatus(item.status);
              return (
                <TouchableOpacity key={item.id}
                  style={[ss.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => openItem(item)} activeOpacity={0.75}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[ss.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                        {item.assetName}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
                        {item.generatedAssetId || item.assetUniqueId}{item.departmentName ? ` · ${item.departmentName}` : ''}
                      </Text>
                    </View>
                    <View style={[ss.badge, { backgroundColor: st.bg }]}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: st.color }}>{st.label}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                    <Text style={ss.meta}>📅 {(item.maintenance_date || '').split('T')[0]}</Text>
                    {item.schedule_number ? <Text style={ss.meta}>🔖 {item.schedule_number}</Text> : null}
                    {item.checklistName ? <Text style={ss.meta}>📋 {item.checklistName}</Text> : null}
                    {item.frequency ? <Text style={ss.meta}>🔁 {item.frequency}</Text> : null}
                  </View>
                  {item.status !== 'completed' && (
                    <View style={ss.tapHint}>
                      <MaterialCommunityIcons name="qrcode-scan" size={13} color={theme.primary} />
                      <Text style={{ fontSize: 11, color: theme.primary, marginLeft: 4 }}>Tap to scan QR & start checklist</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  headerSub:     { fontSize: 11, marginTop: 1 },
  scroll:        { padding: 14, gap: 12, paddingBottom: 40 },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  card:          { borderRadius: 12, borderWidth: 1, padding: 14, gap: 4 },
  cardTitle:     { fontSize: 15, fontWeight: '700' },
  badge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  meta:          { fontSize: 12, color: '#64748b' },
  tapHint:       { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  emptyBox:      { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:     { fontSize: 14, fontWeight: '600' },
  // QR scanner
  scanBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dbeafe', padding: 14, margin: 14, borderRadius: 10 },
  scanOverlay:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scanFrame:     { width: 220, height: 220, borderWidth: 3, borderColor: '#fff', borderRadius: 12, marginBottom: 16 },
  scanHint:      { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 30 },
  scanErrorBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12, backgroundColor: '#111' },
  scanErrorText: { color: '#fca5a5', textAlign: 'center', fontSize: 13, lineHeight: 20 },
  retryBtn:      { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 11, borderRadius: 8 },
  // Checklist
  infoBanner:    { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 4 },
  questionCard:  { borderWidth: 1, borderRadius: 10, padding: 14 },
  questionNum:   { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '700' },
  questionText:  { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  optBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, borderWidth: 1.5 },
  responseInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14, minHeight: 42 },
  submitBtn:     { backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  submitText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
});
