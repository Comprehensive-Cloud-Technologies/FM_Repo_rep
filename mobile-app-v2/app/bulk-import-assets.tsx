/**
 * bulk-import-assets.tsx
 *
 * Allows admins/supervisors to register multiple assets at once by uploading
 * an Excel (.xlsx / .xls) or CSV file.
 *
 * Flow:
 *  1. User selects a department.
 *  2. User picks a file with expo-document-picker.
 *  3. File is uploaded to POST /api/company-portal/assets/bulk-import.
 *  4. Results screen shows created assets + any skipped rows.
 *  5. Each created asset already has a QR code (assetUniqueId) ready to scan.
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, Spacing, Radius, Typography } from '../utils/theme';
import {
  bulkImportAssets, assetImportTemplateUrl, getToken,
  type BulkImportResult,
} from '../utils/api';

// ── Main component ─────────────────────────────────────────────────────────────
export default function BulkImportAssetsScreen() {
  const { theme } = useTheme();

  const [pickedFile,   setPickedFile]   = useState<{ uri: string; name: string } | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [result,       setResult]       = useState<BulkImportResult | null>(null);
  const [showErrors,   setShowErrors]   = useState(false);

  // ── Pick file ──────────────────────────────────────────────────────────────
  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset) return;
      setPickedFile({ uri: asset.uri, name: asset.name });
      setResult(null);
    } catch {
      Alert.alert('Error', 'Could not open file picker.');
    }
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!pickedFile) { Alert.alert('No file', 'Please pick an Excel file first.'); return; }

    setUploading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('You must be logged in.');
      const data = await bulkImportAssets(token, pickedFile.uri, pickedFile.name);
      setResult(data);
    } catch (e: any) {
      Alert.alert('Import Failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => { setPickedFile(null); setResult(null); setShowErrors(false); };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const s = styles(theme);
  const canUpload = !!pickedFile && !uploading;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Bulk Import Assets</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Info banner */}
        <View style={[s.banner, { backgroundColor: theme.primaryBg }]}>
          <MaterialCommunityIcons name="information-outline" size={20} color={theme.primary} />
          <Text style={[s.bannerText, { color: theme.primary }]}>
            Upload an Excel sheet with asset details. Each row = one asset.
            QR codes are auto-generated for every imported asset.
          </Text>
        </View>

        {/* Column guide */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>Required Excel Columns</Text>
          <View style={[s.columnsBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {[
              { col: 'assetName*',     note: 'Required — asset display name' },
              { col: 'assetType',      note: 'e.g. general, healthcare' },
              { col: 'departmentName', note: 'Exact dept name (optional)' },
              { col: 'building',       note: 'Optional location' },
              { col: 'floor',          note: 'Optional' },
              { col: 'room',           note: 'Optional' },
              { col: 'assetUniqueId',  note: 'Auto-generated if blank' },
              { col: 'status',         note: 'Active / Inactive (default: Active)' },
            ].map(({ col, note }) => (
              <View key={col} style={s.colRow}>
                <Text style={[s.colName, { color: theme.textPrimary }]}>{col}</Text>
                <Text style={[s.colNote, { color: theme.textMuted }]}>{note}</Text>
              </View>
            ))}
          </View>
        </View>

        {!result && (
          <>
            {/* File picker */}
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>Select Excel File</Text>
              <TouchableOpacity
                style={[s.pickBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={pickFile}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="file-excel-outline" size={28} color={theme.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={[s.pickLabel, { color: pickedFile ? theme.textPrimary : theme.textMuted }]}>
                    {pickedFile ? pickedFile.name : 'Tap to choose .xlsx / .xls / .csv'}
                  </Text>
                  {pickedFile && (
                    <Text style={[s.pickSub, { color: theme.textMuted }]}>Tap to change file</Text>
                  )}
                </View>
                {pickedFile && <MaterialCommunityIcons name="check-circle" size={20} color="#22c55e" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.uploadBtn, {
                  backgroundColor: canUpload ? theme.primary : theme.inputBg,
                  borderColor: canUpload ? theme.primary : theme.border,
                }]}
                onPress={handleUpload}
                disabled={!canUpload}
                activeOpacity={0.85}
              >
                {uploading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={[s.uploadBtnText, { color: canUpload ? '#fff' : theme.textMuted }]}>
                      Upload &amp; Register Assets
                    </Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Results */}
        {result && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: theme.textPrimary }]}>Import Results</Text>

            <View style={s.summaryRow}>
              <SummaryCard value={result.total}   label="Total"   color="#64748b" theme={theme} />
              <SummaryCard value={result.created} label="Created" color="#22c55e" theme={theme} />
              <SummaryCard value={result.skipped} label="Skipped" color="#f59e0b" theme={theme} />
            </View>

            {result.assets.length > 0 && (
              <>
                <Text style={[s.listTitle, { color: theme.textPrimary }]}>
                  Registered Assets ({result.created})
                </Text>
                {result.assets.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[s.assetCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => router.push({ pathname: '/asset-details', params: { assetId: a.id } })}
                    activeOpacity={0.8}
                  >
                    <View style={[s.assetCardIcon, { backgroundColor: theme.primaryBg }]}>
                      <MaterialCommunityIcons name="qrcode" size={20} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.assetName, { color: theme.textPrimary }]} numberOfLines={1}>
                        {a.assetName}
                      </Text>
                      <Text style={[s.assetQr, { color: theme.primary }]}>QR: {a.qrCode}</Text>
                      {(a.building || a.room) && (
                        <Text style={[s.assetLoc, { color: theme.textMuted }]}>
                          {[a.building, a.floor, a.room].filter(Boolean).join(' › ')}
                        </Text>
                      )}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {result.errors.length > 0 && (
              <>
                <TouchableOpacity
                  style={[s.errHeader, { borderColor: '#f59e0b' }]}
                  onPress={() => setShowErrors(v => !v)}
                >
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#f59e0b" />
                  <Text style={[s.errHeaderText, { color: '#f59e0b' }]}>
                    {result.errors.length} rows skipped — tap to {showErrors ? 'hide' : 'view'}
                  </Text>
                  <MaterialCommunityIcons name={showErrors ? 'chevron-up' : 'chevron-down'} size={18} color="#f59e0b" />
                </TouchableOpacity>
                {showErrors && result.errors.map((e, idx) => (
                  <View key={idx} style={s.errRow}>
                    <Text style={s.errRowText}>
                      Row {e.row}{e.assetName ? ` — ${e.assetName}` : ''}: {e.reason}
                    </Text>
                  </View>
                ))}
              </>
            )}

            <View style={s.resultActions}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.primaryBg, borderColor: theme.primary }]}
                onPress={reset}
              >
                <Text style={[s.actionBtnText, { color: theme.primary }]}>Import Another File</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.back()}
              >
                <Text style={[s.actionBtnText, { color: '#fff' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Summary card
function SummaryCard({ value, label, color, theme }: { value: number; label: string; color: string; theme: any }) {
  return (
    <View style={[summStyles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[summStyles.value, { color }]}>{value}</Text>
      <Text style={[summStyles.label, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}
const summStyles = StyleSheet.create({
  card:  { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1, marginHorizontal: 4 },
  value: { fontSize: 28, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 2 },
});

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = (theme: any) => StyleSheet.create({
  safe:          { flex: 1, backgroundColor: theme.background },
  header:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.border, gap: Spacing.md },
  headerTitle:   { ...Typography.h3, color: theme.textPrimary },
  scroll:        { padding: Spacing.lg, gap: Spacing.lg },
  banner:        { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'flex-start' },
  bannerText:    { flex: 1, fontSize: 13, lineHeight: 19 },
  section:       { gap: Spacing.md },
  sectionTitle:  { ...Typography.h4, color: theme.textPrimary },
  columnsBox:    { borderRadius: Radius.md, padding: Spacing.md, gap: 6, borderWidth: 1 },
  colRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  colName:       { fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  colNote:       { fontSize: 12, flex: 1, textAlign: 'right', marginLeft: 8 },
  selector:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, gap: Spacing.sm },
  selectorText:  { flex: 1, fontSize: 14, fontWeight: '600' },
  pickBtn:       { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', gap: Spacing.sm },
  pickLabel:     { fontSize: 14, fontWeight: '600' },
  pickSub:       { fontSize: 12, marginTop: 2 },
  uploadBtn:     { paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5, marginTop: 4 },
  uploadBtnText: { fontSize: 15, fontWeight: '700' },
  summaryRow:    { flexDirection: 'row', gap: 0, marginBottom: 4 },
  listTitle:     { ...Typography.h4, marginTop: 4 },
  assetCard:     { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  assetCardIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  assetName:     { fontSize: 14, fontWeight: '700' },
  assetQr:       { fontSize: 12, fontWeight: '600', marginTop: 2 },
  assetLoc:      { fontSize: 11, marginTop: 1 },
  errHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, marginTop: 4 },
  errHeaderText: { flex: 1, fontSize: 13, fontWeight: '700' },
  errRow:        { padding: Spacing.sm, borderRadius: Radius.sm, marginTop: 4, backgroundColor: '#fef3c7' },
  errRowText:    { fontSize: 12, color: '#92400e' },
  resultActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  actionBtn:     { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1.5 },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet:    { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, maxHeight: '70%' },
  modalTitle:    { ...Typography.h3, marginBottom: Spacing.md },
  modalItem:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1 },
  modalItemText: { fontSize: 15 },
  emptyDept:     { textAlign: 'center', padding: Spacing.xl },
});
