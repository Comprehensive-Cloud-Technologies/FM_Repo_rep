/**
 * my-indents.tsx — the engineer's spare-part indents and their live status.
 * Tap one to see line items + approval history, and cancel while it's still open.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchIndents, fetchIndent, cancelIndent, IndentSummary } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending_approval: { label: 'Pending', color: '#b45309', bg: '#fef3c7' },
  approved:         { label: 'Approved', color: '#4338ca', bg: '#e0e7ff' },
  issued:           { label: 'Issued', color: '#15803d', bg: '#dcfce7' },
  rejected:         { label: 'Rejected', color: '#b91c1c', bg: '#fee2e2' },
  cancelled:        { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9' },
};
const stCfg = (s: string) => STATUS[s] || STATUS.cancelled;

export default function MyIndentsScreen() {
  const { theme } = useTheme();
  const [list, setList] = useState<IndentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    try { setList(await fetchIndents('mine')); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (id: number) => {
    try { setDetail(await fetchIndent(id)); } catch (e: any) { Alert.alert('Error', e?.message || 'Could not load'); }
  };

  const doCancel = (id: number) => {
    Alert.alert('Cancel indent?', 'This will withdraw the request.', [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel indent', style: 'destructive', onPress: async () => {
        try { await cancelIndent(id); setDetail(null); load(); } catch (e: any) { Alert.alert('Error', e?.message || 'Could not cancel'); }
      } },
    ]);
  };

  // ── Detail view ──
  if (detail) {
    const c = stCfg(detail.status);
    const canCancel = ['pending_approval', 'approved'].includes(detail.status);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <View style={[ss.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setDetail(null)} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[ss.title, { color: theme.textPrimary, marginLeft: 10 }]}>{detail.indent_number || `Indent #${detail.id}`}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[ss.badge, { backgroundColor: c.bg }]}><Text style={{ color: c.color, fontWeight: '700', fontSize: 12 }}>{c.label}</Text></View>
            {detail.assetName ? <Text style={{ color: theme.textMuted, fontSize: 13 }}>{detail.assetName}</Text> : null}
          </View>
          {detail.companyName ? (
            <Text style={{ color: theme.textPrimary, fontSize: 13.5, fontWeight: '700' }}>
              <MaterialCommunityIcons name="hospital-building" size={13} color={theme.textMuted} /> {detail.companyName}
            </Text>
          ) : null}
          {detail.notes ? <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{detail.notes}</Text> : null}

          {detail.asset && (
            <View style={[ss.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <Text style={[ss.cardTitle, { color: theme.textMuted }]}>ASSET</Text>
              <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 14 }}>
                {detail.asset.name || '—'}{detail.asset.code ? `  ·  ${detail.asset.code}` : ''}
              </Text>
              {([
                ['Category', detail.asset.category], ['Department', detail.asset.department],
                ['Location', detail.asset.location], ['Make', detail.asset.make],
                ['Model', detail.asset.model], ['Serial No', detail.asset.serialNo],
              ] as [string, any][]).filter(([, v]) => v).map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                  <Text style={{ width: 96, color: theme.textMuted, fontSize: 12 }}>{k}</Text>
                  <Text style={{ flex: 1, color: theme.textSecondary, fontSize: 12.5, fontWeight: '600' }}>{String(v)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={[ss.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[ss.cardTitle, { color: theme.textMuted }]}>PARTS</Text>
            {(detail.items || []).map((it: any) => (
              <View key={it.id} style={[ss.itemRow, { borderTopColor: theme.borderLight }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>{it.partNameCurrent || it.part_name || `Part #${it.part_id}`}</Text>
                  {it.partSku ? <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 11.5, fontFamily: 'monospace', marginTop: 2 }}>{it.partSku}</Text> : null}
                </View>
                <Text style={{ color: theme.textMuted, fontSize: 12.5, textAlign: 'right' }}>
                  req {it.qty_requested}{it.qty_approved != null ? ` · appr ${it.qty_approved}` : ''}{it.qty_issued ? ` · issued ${it.qty_issued}` : ''}
                </Text>
              </View>
            ))}
          </View>

          {(detail.history || []).length > 0 && (
            <View style={[ss.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <Text style={[ss.cardTitle, { color: theme.textMuted }]}>HISTORY</Text>
              {detail.history.map((h: any, i: number) => (
                <View key={i} style={[ss.itemRow, { borderTopColor: theme.borderLight }]}>
                  <Text style={{ color: theme.textPrimary, fontSize: 12.5, flex: 1, textTransform: 'capitalize' }}>
                    {h.action}{h.actorName ? ` — ${h.actorName}` : ''}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11 }}>{new Date(h.createdAt).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          )}

          {canCancel && (
            <TouchableOpacity onPress={() => doCancel(detail.id)} style={[ss.cancelBtn]}>
              <Text style={{ color: '#dc2626', fontWeight: '700' }}>Cancel indent</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List view ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[ss.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={[ss.title, { color: theme.textPrimary, marginLeft: 10, flex: 1 }]}>My Indents</Text>
        <TouchableOpacity onPress={() => router.push('/request-part')} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="plus-circle" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}>
          {list.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={48} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted }}>No indents yet.</Text>
              <TouchableOpacity onPress={() => router.push('/request-part')} style={[ss.newBtn, { backgroundColor: theme.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Request a Part</Text>
              </TouchableOpacity>
            </View>
          ) : list.map((r) => {
            const c = stCfg(r.status);
            return (
              <TouchableOpacity key={r.id} onPress={() => open(r.id)}
                style={[ss.listCard, Shadows.xs, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 14 }}>{r.indentNumber || `Indent #${r.id}`}</Text>
                  {r.companyName ? (
                    <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
                      <MaterialCommunityIcons name="hospital-building" size={12} color={theme.textMuted} /> {r.companyName}
                    </Text>
                  ) : null}
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    {r.itemCount} item(s) · {r.totalQty} qty{r.assetName ? ` · ${r.assetName}` : ''}
                  </Text>
                </View>
                <View style={[ss.badge, { backgroundColor: c.bg }]}><Text style={{ color: c.color, fontWeight: '700', fontSize: 11.5 }}>{c.label}</Text></View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:     { fontSize: 17, fontWeight: '800' },
  listCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.md, borderWidth: 1, padding: 14 },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  card:      { borderRadius: Radius.lg, borderWidth: 1, padding: 14 },
  cardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1 },
  cancelBtn: { alignItems: 'center', paddingVertical: 13, borderRadius: Radius.md, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  newBtn:    { paddingHorizontal: 18, paddingVertical: 11, borderRadius: Radius.md, marginTop: 6 },
});
