/**
 * audit-scan.tsx — scan-first asset audit.
 * Scan an asset QR → see all its details → confirm to complete the audit for it
 * (mark Verified / Not Found). Then scan the next one.
 */
import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { withPermission } from '../components/withPermission';
import { lookupAuditAsset, markAuditItem } from '../utils/api';
import { useTheme, Radius } from '../utils/theme';

function AuditScanScreen() {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<'scan' | 'details'>('scan');
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>(null);          // lookup result
  const [marked, setMarked] = useState<string | null>(null); // 'found' | 'not_found' after saving
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const lastScan = useRef(0);

  const handleScan = async ({ data: code }: { data: string }) => {
    const now = Date.now();
    if (scanned || busy || now - lastScan.current < 1500) return;
    lastScan.current = now; setScanned(true); setBusy(true); setError(null);
    try {
      const r = await lookupAuditAsset({ code: String(code).trim() });
      if (r.outcome === 'unknown') {
        setError(r.message || 'That code doesn’t match any asset.');
        setTimeout(() => setScanned(false), 1200);
      } else {
        setData(r); setMarked(null); setStage('details');
      }
    } catch (e: any) {
      setError(e?.message || 'Scan failed'); setTimeout(() => setScanned(false), 1200);
    } finally { setBusy(false); }
  };

  const doMark = async (status: 'found' | 'not_found') => {
    if (!data?.audit?.id || !data?.item?.id) return;
    setBusy(true);
    try {
      await markAuditItem(data.audit.id, data.item.id, status);
      setMarked(status);
      if (status === 'found' && data.item.status !== 'found') setCount((c) => c + 1);
    } catch (e: any) { setError(e?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  const scanNext = () => { setData(null); setMarked(null); setError(null); setStage('scan'); setScanned(false); };

  // ── Details stage ──
  if (stage === 'details' && data) {
    const a = data.asset || {};
    const inAudit = data.outcome === 'in_audit';
    const already = data.item?.status === 'found';
    const rows: [string, any][] = [
      ['Code', a.code], ['Department', a.department], ['Location', a.location],
      ['Category', a.category], ['Make', a.make], ['Model', a.model],
      ['Serial No', a.serialNo], ['Working status', a.status],
    ];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <View style={styles.hdr}>
          <Text style={[styles.hdrTitle, { color: theme.textPrimary }]}>Asset details</Text>
          <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="close" size={24} color={theme.textSecondary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {/* asset name + badges */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>{a.name || `Asset #${a.id}`}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {inAudit ? (
                <Badge text={`Audit: ${data.audit.title}`} bg="#eef2ff" color="#4338ca" />
              ) : (
                <Badge text="No active audit" bg="#fef2f2" color="#b91c1c" />
              )}
              {data.item && <Badge text={data.item.status === 'found' ? 'Verified' : data.item.status === 'not_found' ? 'Missing' : 'Pending'} bg={data.item.status === 'found' ? '#dcfce7' : data.item.status === 'not_found' ? '#fee2e2' : '#f1f5f9'} color={data.item.status === 'found' ? '#059669' : data.item.status === 'not_found' ? '#dc2626' : '#64748b'} />}
            </View>

            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: theme.borderLight, paddingTop: 4 }}>
              {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                  <Text style={{ width: 118, color: theme.textMuted, fontSize: 12.5 }}>{k}</Text>
                  <Text style={{ flex: 1, color: theme.textPrimary, fontSize: 13, fontWeight: '600' }}>{String(v)}</Text>
                </View>
              ))}
            </View>
          </View>

          {error && <Text style={{ color: '#dc2626', marginTop: 12 }}>{error}</Text>}

          {marked ? (
            <View style={[styles.resultBanner, { backgroundColor: marked === 'found' ? '#065f46' : '#7f1d1d' }]}>
              <MaterialCommunityIcons name={marked === 'found' ? 'check-circle' : 'alert-circle'} size={22} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                {marked === 'found' ? 'Marked Verified (Found)' : 'Marked Not Found'}
              </Text>
            </View>
          ) : inAudit ? (
            <View style={{ marginTop: 18 }}>
              {already && <Text style={{ color: theme.textMuted, fontSize: 12.5, marginBottom: 10 }}>This asset is already verified — you can re-confirm or change it.</Text>}
              <TouchableOpacity disabled={busy} onPress={() => doMark('found')} style={[styles.btn, { backgroundColor: '#059669', opacity: busy ? 0.6 : 1 }]}>
                <MaterialCommunityIcons name="check-bold" size={20} color="#fff" />
                <Text style={styles.btnText}>Complete audit — mark Verified</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} onPress={() => doMark('not_found')} style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fca5a5', marginTop: 10 }]}>
                <MaterialCommunityIcons name="close-thick" size={18} color="#dc2626" />
                <Text style={[styles.btnText, { color: '#dc2626' }]}>Mark Not Found</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ marginTop: 16, backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: Radius.md, padding: 12 }}>
              <Text style={{ color: '#9a3412', fontSize: 12.5 }}>This asset isn’t part of any audit that’s currently in progress, so it can’t be verified right now.</Text>
            </View>
          )}

          <TouchableOpacity onPress={scanNext} style={[styles.btn, { backgroundColor: theme.primary, marginTop: 16 }]}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
            <Text style={styles.btnText}>Scan next asset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={[styles.btn, { backgroundColor: '#334155', marginTop: 10 }]}>
            <Text style={styles.btnText}>Done{count > 0 ? ` · ${count} verified` : ''}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Scan stage ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text style={styles.topTitle}>Scan asset to audit</Text>
        <TouchableOpacity onPress={() => router.back()}><MaterialCommunityIcons name="close" size={26} color="#fff" /></TouchableOpacity>
      </View>
      {count > 0 && <Text style={styles.counter}>{count} verified this session</Text>}
      {error && <View style={styles.errBanner}><Text style={{ color: '#fff', fontWeight: '600' }}>{error}</Text></View>}
      <View style={{ flex: 1 }}>
        {!permission?.granted ? (
          <View style={styles.center}>
            <Text style={{ color: '#fff', marginBottom: 14, textAlign: 'center' }}>Camera permission is needed to scan asset QR codes.</Text>
            <TouchableOpacity onPress={requestPermission} style={[styles.btn, { backgroundColor: theme.primary }]}>
              <Text style={styles.btnText}>Grant permission</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={scanned ? undefined : handleScan}>
            <View style={styles.center}>
              <View style={styles.frame} />
              <Text style={styles.hint}>Point the camera at the QR label on the asset</Text>
              {busy && <ActivityIndicator color="#fff" style={{ marginTop: 14 }} />}
            </View>
          </CameraView>
        )}
      </View>
    </SafeAreaView>
  );
}

function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}><Text style={{ color, fontSize: 11.5, fontWeight: '700' }}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  counter: { color: '#a7f3d0', textAlign: 'center', fontSize: 12.5, marginBottom: 4 },
  errBanner: { backgroundColor: '#7f1d1d', marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: 20, opacity: 0.9 },
  hint: { color: '#fff', marginTop: 16, fontSize: 13 },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  hdrTitle: { fontSize: 17, fontWeight: '800' },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: 16 },
  resultBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, padding: 12, marginTop: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, width: '100%' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
});

export default withPermission(AuditScanScreen, 'audit:conduct');
