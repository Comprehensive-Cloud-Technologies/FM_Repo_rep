/**
 * parts-list.tsx — all registered parts (opened from Profile → Parts, or the
 * Parts tab's "View all parts"). Tap a part to see its full details.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchParts, Part } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';

export default function PartsListScreen() {
  const { theme } = useTheme();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Part | null>(null);

  const load = useCallback(async () => {
    try { setParts(await fetchParts()); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = parts.filter((p) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [p.partName, p.make, p.model].some((v) => (v || '').toLowerCase().includes(s));
  });

  // ── Detail view ──
  if (selected) {
    const p = selected;
    const rows: [string, any][] = [
      ['Make', p.make], ['Model', p.model], ['Unit', p.unit],
      ['Total quantity', p.totalQuantity], ['Available', p.availableQuantity],
      ['Added by', p.createdByName], ['Added on', p.createdAt ? new Date(p.createdAt).toLocaleDateString() : null],
    ];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
        <View style={[ss.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => setSelected(null)} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[ss.title, { color: theme.textPrimary, marginLeft: 10 }]} numberOfLines={1}>{p.partName}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
          {p.photoUrl ? (
            <Image source={{ uri: p.photoUrl }} style={ss.hero} resizeMode="cover" />
          ) : (
            <View style={[ss.hero, ss.heroPlaceholder, { backgroundColor: theme.surface }]}>
              <MaterialCommunityIcons name="cog" size={56} color={theme.textMuted} />
            </View>
          )}
          <View style={[ss.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>{p.partName}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: (p.availableQuantity ?? 0) <= 0 ? '#dc2626' : theme.primary }}>{p.availableQuantity ?? 0}</Text>
                <Text style={{ fontSize: 11, color: theme.textMuted }}>Available</Text>
              </View>
              <View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: theme.textPrimary }}>{p.totalQuantity ?? 0}</Text>
                <Text style={{ fontSize: 11, color: theme.textMuted }}>Total</Text>
              </View>
            </View>
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: theme.borderLight, paddingTop: 4 }}>
              {rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
                  <Text style={{ width: 120, color: theme.textMuted, fontSize: 12.5 }}>{k}</Text>
                  <Text style={{ flex: 1, color: theme.textPrimary, fontSize: 13, fontWeight: '600' }}>{String(v)}</Text>
                </View>
              ))}
            </View>
          </View>
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
        <Text style={[ss.title, { color: theme.textPrimary, marginLeft: 10 }]}>Parts</Text>
      </View>
      <View style={{ padding: Spacing.lg, paddingBottom: 0 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search parts…" placeholderTextColor={theme.textMuted}
          style={[ss.search, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.surface }]} />
      </View>
      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
              <MaterialCommunityIcons name="cog-outline" size={48} color={theme.textMuted} />
              <Text style={{ color: theme.textMuted }}>No parts found.</Text>
            </View>
          ) : filtered.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => setSelected(p)}
              style={[ss.row, Shadows.xs, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              {p.photoUrl ? (
                <Image source={{ uri: p.photoUrl }} style={ss.thumb} />
              ) : (
                <View style={[ss.thumb, ss.thumbPh, { backgroundColor: theme.background }]}>
                  <MaterialCommunityIcons name="cog" size={22} color={theme.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textPrimary, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{p.partName}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {[p.make, p.model].filter(Boolean).join(' · ') || 'No make / model'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: (p.availableQuantity ?? 0) <= 0 ? '#dc2626' : theme.primary }}>{p.availableQuantity ?? 0}</Text>
                <Text style={{ fontSize: 10.5, color: theme.textMuted }}>of {p.totalQuantity ?? 0}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:    { fontSize: 17, fontWeight: '800' },
  search:   { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.md, borderWidth: 1, padding: 10 },
  thumb:    { width: 48, height: 48, borderRadius: Radius.sm },
  thumbPh:  { alignItems: 'center', justifyContent: 'center' },
  card:     { borderRadius: Radius.lg, borderWidth: 1, padding: 16 },
  hero:     { width: '100%', height: 200, borderRadius: Radius.lg },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
});
