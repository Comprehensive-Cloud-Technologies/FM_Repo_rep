import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssets } from '../utils/api';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../utils/theme';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { hasSoftAccess, hasTechAccess } from '../utils/permissions';

export default function AssetsScreen() {
  const { theme } = useTheme();
  const { capabilities, user } = useAuth();
  const [assets,      setAssets]      = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [showMyOnly,  setShowMyOnly]  = useState(true);

  const softOnly = hasSoftAccess(capabilities) && !hasTechAccess(capabilities);
  const techOnly = hasTechAccess(capabilities) && !hasSoftAccess(capabilities);
  const assetTypeFilter = softOnly ? 'soft' : techOnly ? 'technical' : undefined;

  const load = useCallback(async (q?: string, myOnly?: boolean) => {
    try {
      const data = await fetchAssets({
        ...(q ? { search: q } : {}),
        ...(assetTypeFilter ? { type: assetTypeFilter } : {}),
        ...(myOnly ? { assignedToMe: true } : {}),
      });
      setAssets(data as any[]);
    } catch { /* silent */ } finally { setLoading(false); setRefreshing(false); }
  }, [assetTypeFilter]);

  useEffect(() => { void load('', showMyOnly); }, [load, showMyOnly]);

  const onSearch = (t: string) => { setSearch(t); void load(t, showMyOnly); };

  const isAdminOrSupervisor = (user as any)?.role === 'admin' || (user as any)?.role === 'supervisor';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Assets" showBack />

      {/* Filter row + Import button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, gap: Spacing.sm }}>
        <TouchableOpacity
          onPress={() => { setShowMyOnly(false); void load(search, false); }}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.md, backgroundColor: !showMyOnly ? theme.primary : theme.inputBg, borderWidth: 1.5, borderColor: !showMyOnly ? theme.primary : theme.inputBorder }}>
          <Text style={{ color: !showMyOnly ? '#fff' : theme.textSecondary, fontSize: 13, fontWeight: '700' }}>All Assets</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setShowMyOnly(true); void load(search, true); }}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.md, backgroundColor: showMyOnly ? theme.primary : theme.inputBg, borderWidth: 1.5, borderColor: showMyOnly ? theme.primary : theme.inputBorder }}>
          <Text style={{ color: showMyOnly ? '#fff' : theme.textSecondary, fontSize: 13, fontWeight: '700' }}>My Assets</Text>
        </TouchableOpacity>
        {isAdminOrSupervisor && (
          <TouchableOpacity
            onPress={() => router.push('/bulk-import-assets')}
            style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md, backgroundColor: theme.primaryBg, borderWidth: 1.5, borderColor: theme.primary }}
          >
            <MaterialCommunityIcons name="file-excel-outline" size={15} color={theme.primary} />
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>Import</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.searchWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.inputText }]}
          value={search}
          onChangeText={onSearch}
          placeholder="Search assets..."
          placeholderTextColor={theme.inputPlaceholder}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => onSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => router.push('/qr-scanner')}>
            <MaterialCommunityIcons name="qrcode-scan" size={20} color={theme.primary} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ScrollView
          contentContainerStyle={assets.length === 0 ? { flex: 1 } : styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(search, showMyOnly); }} tintColor={theme.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {assets.length === 0 ? (
            <EmptyState icon="package-variant-closed" title={showMyOnly ? "No assets assigned to you" : "No assets found"} message={showMyOnly ? "Ask an admin to assign assets to you." : "Try a different search term."} />
          ) : assets.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
              onPress={() => router.push({ pathname: '/asset-details', params: { assetId: a.id } })}
              activeOpacity={0.8}
            >
              <View style={[styles.assetIcon, { backgroundColor: theme.primaryBg }]}>
                <MaterialCommunityIcons name="package-variant" size={24} color={theme.primary} />
              </View>
              <View style={styles.assetBody}>
                <Text style={[styles.assetName, { color: theme.textPrimary }]} numberOfLines={1}>{a.name ?? a.assetName}</Text>
                <Text style={[styles.assetId, { color: theme.textMuted }]}>{a.uniqueId ?? a.assetUniqueId ?? '—'}</Text>
                {a.assignedToName && <Text style={[styles.assetLoc, { color: theme.primary, fontSize: 11, fontWeight: '600' }]}><MaterialCommunityIcons name="account" size={11} color={theme.primary} /> {a.assignedToName}</Text>}
                {a.departmentName && <Text style={[styles.assetLoc, { color: theme.textSecondary }]}>{a.departmentName}</Text>}
                {/* Healthcare fields */}
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                  {a.criticality ? (
                    <View style={{ backgroundColor: a.criticality === 'Critical' ? '#FEE2E2' : '#D1FAE5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: a.criticality === 'Critical' ? '#991B1B' : '#065F46' }}>{a.criticality}</Text>
                    </View>
                  ) : null}
                  {a.working_status ? (
                    <View style={{ backgroundColor: a.working_status === 'WIP' ? '#FEF3C7' : a.working_status === 'Not_Working' ? '#FEE2E2' : '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: a.working_status === 'WIP' ? '#92400E' : a.working_status === 'Not_Working' ? '#991B1B' : '#166534' }}>{a.working_status.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
                {a.assignedTo === (user as any)?.id && (
                  <View style={{ backgroundColor: theme.primaryBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, color: theme.primary, fontWeight: '700' }}>MINE</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, paddingHorizontal: Spacing.md, height: 48, borderWidth: 1.5, borderRadius: Radius.lg, gap: Spacing.sm },
  searchInput:{ flex: 1, ...Typography.body },
  list:       { padding: Spacing.lg, gap: Spacing.md },
  card:       { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1 },
  assetIcon:  { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  assetBody:  { flex: 1, gap: 2 },
  assetName:  { ...Typography.h4 },
  assetId:    { ...Typography.micro },
  assetLoc:   { ...Typography.bodyS },
});
