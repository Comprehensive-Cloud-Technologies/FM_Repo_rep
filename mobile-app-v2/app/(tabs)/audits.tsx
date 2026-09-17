/**
 * (tabs)/audits.tsx — Asset Audits tab.
 * Lists audits the user can work on; tap one to scan/verify and complete.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAudits, AuditSummary } from '../../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../../utils/theme';

const STATUS = {
  draft: { label: 'Draft', color: '#64748b', bg: '#f1f5f9' },
  in_progress: { label: 'In Progress', color: '#c2410c', bg: '#ffedd5' },
  completed: { label: 'Completed', color: '#059669', bg: '#dcfce7' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fee2e2' },
} as const;

export default function AuditsTab() {
  const { theme } = useTheme();
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setAudits(await fetchAudits()); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Refresh every time the tab regains focus (so completing an audit is reflected).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Asset Audits</Text>
        <TouchableOpacity onPress={() => { setRefreshing(true); load(); }} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="refresh" size={22} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {audits.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 50 }}>
              <MaterialCommunityIcons name="clipboard-check-multiple-outline" size={44} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 12 }}>No audits assigned yet.</Text>
            </View>
          ) : audits.map((a) => {
            const st = STATUS[a.status as keyof typeof STATUS] ?? STATUS.draft;
            return (
              <TouchableOpacity key={a.id} activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/audit-detail' as any, params: { id: String(a.id) } })}
                style={[styles.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>{a.title}</Text>
                  <View style={{ backgroundColor: st.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 }}>
                    <Text style={{ color: st.color, fontSize: 11, fontWeight: '700' }}>{st.label}</Text>
                  </View>
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 3 }}>{a.scopeLabel || a.scopeType}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1, height: 7, borderRadius: 5, backgroundColor: '#eef1f6', overflow: 'hidden' }}>
                    <View style={{ width: `${a.verifiedPct}%`, height: '100%', backgroundColor: '#059669' }} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary }}>{a.verifiedPct}%</Text>
                </View>
                <Text style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 6 }}>
                  <Text style={{ color: '#059669', fontWeight: '700' }}>{a.foundCount} found</Text>
                  {'  ·  '}<Text style={{ color: '#dc2626', fontWeight: '700' }}>{a.notFoundCount} missing</Text>
                  {'  ·  '}{a.pendingCount} pending of {a.expectedCount}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  card: { borderRadius: Radius.lg, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
});
