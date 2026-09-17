/**
 * audit-detail.tsx — verify assets in an audit.
 * Scan QR codes to mark Found, or mark items manually. Live progress.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { withPermission } from '../components/withPermission';
import { useAuth } from '../context/AuthContext';
import { fetchAudit, fetchAuditItems, scanAuditAsset, markAuditItem, completeAudit, AuditItem } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';

const ITEM = {
  pending: { label: 'Pending', color: '#64748b', bg: '#f1f5f9' },
  found: { label: 'Found', color: '#059669', bg: '#dcfce7' },
  not_found: { label: 'Not Found', color: '#dc2626', bg: '#fee2e2' },
} as const;

function AuditDetailScreen() {
  const { theme } = useTheme();
  const { can } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const auditId = Number(id);
  const canConduct = can('audit:conduct');
  const canManage = can('audit:manage');

  const [audit, setAudit] = useState<any>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [filter, setFilter] = useState<'pending' | 'found' | 'not_found'>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef(0);

  const load = useCallback(async () => {
    try {
      const [a, its] = await Promise.all([fetchAudit(auditId), fetchAuditItems(auditId, filter)]);
      setAudit(a); setItems(Array.isArray(its) ? its : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [auditId, filter]);
  useEffect(() => { load(); }, [load]);

  const inProgress = audit?.status === 'in_progress';

  const handleScan = async ({ data }: { data: string }) => {
    const now = Date.now();
    if (scanned || now - lastScan.current < 1500) return;
    lastScan.current = now; setScanned(true); setBusy(true);
    try {
      const r = await scanAuditAsset(auditId, { code: String(data).trim() });
      const map: Record<string, { ok: boolean; msg: string }> = {
        found: { ok: true, msg: `✓ Found: ${r.item?.name || 'asset'}` },
        already_found: { ok: true, msg: `Already verified: ${r.item?.name || 'asset'}` },
        out_of_scope: { ok: false, msg: r.message || 'Asset not in this audit' },
        unknown: { ok: false, msg: r.message || 'Unknown code' },
      };
      setBanner(map[r.outcome] || { ok: false, msg: 'Could not record scan' });
      if (r.stats) setAudit((p: any) => ({ ...p, stats: r.stats }));
    } catch (e: any) {
      setBanner({ ok: false, msg: e?.message || 'Scan failed' });
    } finally {
      setBusy(false);
      setTimeout(() => setScanned(false), 1200);
      load();
    }
  };

  const mark = async (item: AuditItem, status: 'found' | 'not_found') => {
    setBusy(true);
    try { const r = await markAuditItem(auditId, item.id, status); if (r.stats) setAudit((p: any) => ({ ...p, stats: r.stats })); await load(); }
    catch { /* ignore */ } finally { setBusy(false); }
  };

  const doComplete = () => {
    const pend = audit?.stats?.pending || 0;
    Alert.alert(
      'Complete audit?',
      pend > 0
        ? `${pend} asset${pend !== 1 ? 's are' : ' is'} still pending — they will be marked "Not Found" (missing). Continue?`
        : 'This will finish the audit and lock in the results.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await completeAudit(auditId);
              Alert.alert('Audit completed', 'Results are saved and now visible on the dashboard.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (e: any) {
              Alert.alert('Could not complete', e?.message || 'Please try again.');
            } finally { setBusy(false); }
          },
        },
      ]
    );
  };

  if (loading || !audit) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><ActivityIndicator style={{ marginTop: 60 }} color={theme.primary} /></SafeAreaView>
  );
  const s = audit.stats || { total: 0, found: 0, notFound: 0, pending: 0, verifiedPct: 0 };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>{audit.title}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginBottom: 12 }}>{audit.scopeLabel || audit.scopeType}</Text>

        {/* stats */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {[['Found', s.found, '#059669'], ['Missing', s.notFound, '#dc2626'], ['Pending', s.pending, '#c2410c'], ['Verified', `${s.verifiedPct}%`, theme.primary]].map(([k, v, c]) => (
            <View key={k as string} style={{ flexGrow: 1, minWidth: 74, backgroundColor: theme.surface, borderColor: theme.borderLight, borderWidth: 1, borderRadius: Radius.md, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 19, fontWeight: '800', color: c as string }}>{v as any}</Text>
              <Text style={{ fontSize: 10.5, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase' }}>{k as string}</Text>
            </View>
          ))}
        </View>

        {!inProgress && (
          <View style={{ backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: Radius.md, padding: 12, marginBottom: 12 }}>
            <Text style={{ color: '#9a3412', fontSize: 12.5 }}>
              This audit is <Text style={{ fontWeight: '700' }}>{audit.status}</Text>. {audit.status === 'draft' ? 'Ask a supervisor to start it before verifying.' : 'Verification is closed.'}
            </Text>
          </View>
        )}

        {inProgress && canConduct && (
          <TouchableOpacity onPress={() => { setBanner(null); setScanOpen(true); }}
            style={{ backgroundColor: theme.primary, borderRadius: Radius.lg, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
            <MaterialCommunityIcons name="qrcode-scan" size={22} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Scan asset to verify</Text>
          </TouchableOpacity>
        )}

        {inProgress && canManage && (
          <TouchableOpacity disabled={busy} onPress={doComplete}
            style={{ backgroundColor: '#059669', borderRadius: Radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 14, opacity: busy ? 0.6 : 1 }}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Complete audit</Text>
          </TouchableOpacity>
        )}

        {/* filter tabs */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {(['pending', 'found', 'not_found'] as const).map((f) => (
            <TouchableOpacity key={f} onPress={() => setFilter(f)}
              style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: filter === f ? theme.primary : theme.borderLight, backgroundColor: filter === f ? theme.primary + '18' : theme.surface }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: filter === f ? theme.primary : theme.textSecondary }}>{ITEM[f].label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {items.length === 0 ? (
          <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 24 }}>No {ITEM[filter].label.toLowerCase()} items.</Text>
        ) : items.map((it) => {
          const st = ITEM[it.status as keyof typeof ITEM] ?? ITEM.pending;
          return (
            <View key={it.id} style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '700', color: theme.textPrimary }} numberOfLines={1}>{it.name || `Asset #${it.assetId}`}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 2 }} numberOfLines={1}>{it.code || '—'}{it.location ? ` · ${it.location}` : ''}</Text>
              </View>
              {inProgress && canConduct ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity disabled={busy} onPress={() => mark(it, 'found')} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: '#6ee7b7', backgroundColor: it.status === 'found' ? '#059669' : '#ecfdf5' }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: it.status === 'found' ? '#fff' : '#059669' }}>Found</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} onPress={() => mark(it, 'not_found')} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: it.status === 'not_found' ? '#dc2626' : '#fef2f2' }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: it.status === 'not_found' ? '#fff' : '#dc2626' }}>Missing</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ backgroundColor: st.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ color: st.color, fontSize: 11, fontWeight: '700' }}>{st.label}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Scanner modal */}
      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Scan asset QR</Text>
            <TouchableOpacity onPress={() => setScanOpen(false)}><MaterialCommunityIcons name="close" size={26} color="#fff" /></TouchableOpacity>
          </View>
          {banner && (
            <View style={{ marginHorizontal: 14, marginBottom: 8, padding: 12, borderRadius: 10, backgroundColor: banner.ok ? '#065f46' : '#7f1d1d' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{banner.msg}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            {!permission?.granted ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={{ color: '#fff', marginBottom: 12 }}>Camera permission required</Text>
                <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: theme.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Grant permission</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={scanned ? undefined : handleScan}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 230, height: 230, borderWidth: 3, borderColor: '#fff', borderRadius: 18, opacity: 0.9 }} />
                  <Text style={{ color: '#fff', marginTop: 16 }}>Point at the QR label on the asset</Text>
                  {busy && <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />}
                </View>
              </CameraView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: Radius.md, padding: 12, marginBottom: 8 },
});

export default withPermission(AuditDetailScreen, 'audit:view');
