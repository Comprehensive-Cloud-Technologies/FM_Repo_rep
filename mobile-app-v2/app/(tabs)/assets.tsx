import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssets } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../context/CompanyScopeContext';
import { useTheme, Spacing, Radius, Shadows, Typography } from '../../utils/theme';
import EmptyState from '../../components/EmptyState';

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status, theme }: { status: string; theme: any }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active:      { bg: theme.successBg, fg: theme.success, label: 'Active' },
    maintenance: { bg: theme.warningBg, fg: theme.warning, label: 'Maintenance' },
    inactive:    { bg: theme.surfaceAlt, fg: theme.textMuted, label: 'Inactive' },
    repair:      { bg: theme.dangerBg,   fg: theme.danger,  label: 'Repair' },
  };
  const s = map[status?.toLowerCase()] ?? { bg: theme.primaryBg, fg: theme.primary, label: status ?? 'Unknown' };
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.full }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: s.fg }}>{s.label}</Text>
    </View>
  );
}

// ─── Asset card ──────────────────────────────────────────────────────────────
function AssetCard({ item, theme }: { item: any; theme: any }) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push({ pathname: '/asset-details', params: { assetId: String(item.id) } })}
      activeOpacity={0.75}
    >
      {/* Color stripe by type */}
      <View style={[styles.cardStripe, { backgroundColor: theme.primary }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {item.assetName ?? item.name ?? `Asset #${item.id}`}
            </Text>
            <Text style={[styles.cardId, { color: theme.textMuted }]}>
              {item.uniqueId ?? item.assetUniqueId ?? '—'}
            </Text>
          </View>
          <StatusBadge status={item.status} theme={theme} />
        </View>

        <View style={styles.cardMeta}>
          {item.department && (
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="office-building-outline" size={12} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{item.department}</Text>
            </View>
          )}
          {item.location && (
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="map-marker-outline" size={12} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{item.location}</Text>
            </View>
          )}
          {item.category && (
            <View style={styles.metaChip}>
              <MaterialCommunityIcons name="tag-outline" size={12} color={theme.textMuted} />
              <Text style={[styles.metaText, { color: theme.textMuted }]}>{item.category}</Text>
            </View>
          )}
        </View>
      </View>

      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} style={{ marginRight: Spacing.sm }} />
    </TouchableOpacity>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function AssetsTab() {
  const { theme } = useTheme();
  const { can } = useAuth();
  const { scopedCompanyId } = useCompanyScope();
  const [assets,     setAssets]     = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [myOnly,     setMyOnly]     = useState(false);

  const canCreateAsset = can('asset:create');

  const load = useCallback(async (q = '', mine = false) => {
    try {
      const data = await fetchAssets({
        ...(q ? { search: q } : {}),
        ...(mine ? { assignedToMe: true } : {}),
        ...(scopedCompanyId ? { companyId: scopedCompanyId } : {}),
      });
      setAssets(Array.isArray(data) ? data : []);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [scopedCompanyId]);

  useEffect(() => { void load('', myOnly); }, [load, myOnly]);

  const onSearch = (t: string) => { setSearch(t); void load(t, myOnly); };
  const onRefresh = () => { setRefreshing(true); void load(search, myOnly); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />

      {/* Blue header */}
      <View style={[styles.header, { backgroundColor: theme.primary }]}>
        <View>
          <Text style={styles.headerTitle}>Assets</Text>
          <Text style={styles.headerSub}>{assets.length} registered</Text>
        </View>
        <View style={styles.headerActions}>
          {canCreateAsset && (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push('/bulk-import-assets')}
            >
              <MaterialCommunityIcons name="file-excel-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {canCreateAsset && (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.push('/register-asset')}
            >
              <MaterialCommunityIcons name="plus" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* White content area */}
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Search + filter */}
        <View style={styles.searchBlock}>
          <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: theme.inputText }]}
              value={search}
              onChangeText={onSearch}
              placeholder="Search by name, ID, location…"
              placeholderTextColor={theme.inputPlaceholder}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => onSearch('')}>
                <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterRow}>
            {[{ key: false, label: 'All Assets' }, { key: true, label: 'My Assets' }].map(f => (
              <TouchableOpacity
                key={String(f.key)}
                onPress={() => setMyOnly(f.key)}
                style={[styles.filterPill, { backgroundColor: myOnly === f.key ? theme.primary : theme.surface, borderColor: myOnly === f.key ? theme.primary : theme.border }]}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: myOnly === f.key ? '#fff' : theme.textSecondary }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} size="large" color={theme.primary} />
        ) : (
          <FlatList
            data={assets}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => <AssetCard item={item} theme={theme} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onRefresh={onRefresh}
            refreshing={refreshing}
            ListEmptyComponent={
              <EmptyState
                icon="package-variant-closed"
                title="No assets found"
                message={search ? 'Try a different search term' : 'No assets have been registered yet'}
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  headerTitle: { ...Typography.h3, color: '#fff' },
  headerSub:   { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: Spacing.sm },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },

  searchBlock: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.sm },
  searchBar:  { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: Spacing.sm },
  searchInput: { flex: 1, fontSize: 15 },
  filterRow:  { flexDirection: 'row', gap: Spacing.sm },
  filterPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5 },

  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 120, gap: Spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', ...Shadows.sm },
  cardStripe: { width: 4, alignSelf: 'stretch' },
  cardBody:   { flex: 1, padding: Spacing.md, gap: Spacing.xs },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle:  { ...Typography.bodyS, fontWeight: '700', flex: 1 },
  cardId:     { fontSize: 11, fontFamily: 'monospace' },
  cardMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: 2 },
  metaChip:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText:   { fontSize: 11 },
});
