/**
 * Case Log Detail
 * Route: /hc-case-log-detail?id=<id>&action?=close
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authenticatedFetch, API_BASE, closeAssetQuery } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';

const STATUS_COLOR: Record<string, string> = {
  open: '#DC2626', assigned: '#2563EB', in_progress: '#D97706',
  resolved: '#059669', closed: '#64748B',
};

export default function HCCaseLogDetail() {
  const { theme } = useTheme();
  const { capabilities, user } = useAuth();
  const { id, action, sourceType } = useLocalSearchParams<{ id: string; action?: string; sourceType?: string }>();

  const isAQ = sourceType === 'asset_query';

  const [wo, setWo]           = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [engineers, setEngineers] = useState<any[]>([]);
  const [showAssign, setShowAssign] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const url = isAQ
        ? `/api/mobile/case-logs/${id}?source_type=asset_query`
        : `/api/mobile/case-logs/${id}`;
      const res = await authenticatedFetch(url);
      const data = await res.json() as any;
      if (res.ok) setWo(data.data);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [id, isAQ]);

  useEffect(() => { void load(); }, [load]);

  // Admin: load engineers list
  useEffect(() => {
    if (!capabilities.isHCAdmin) return;
    authenticatedFetch('/api/mobile/case-logs/engineers')
      .then(r => r.json())
      .then((d: any) => setEngineers(d.data || []))
      .catch(() => {});
  }, [capabilities.isHCAdmin]);

  // Auto-prompt close if action param — for AQ items close without code then navigate to review
  useEffect(() => {
    if (action === 'close' && wo?.status === 'resolved') {
      void handleAQClose();
    }
  }, [action, wo?.status]);

  // Close asset_query without code, then go to review
  const handleAQClose = async () => {
    setUpdating(true);
    try {
      await closeAssetQuery(Number(id), '');
      router.replace({
        pathname: '/issue-review',
        params: { queryId: String(id), queryTitle: wo?.issue_description || wo?.asset_name || 'Issue' },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not close the request. Please try again.');
      setUpdating(false);
    }
  };

  const updateStatus = async (newStatus: string, extraRemarks?: string) => {
    setUpdating(true);
    try {
      const url = isAQ
        ? `/api/mobile/case-logs/${id}/status?source_type=asset_query`
        : `/api/mobile/case-logs/${id}/status`;
      const res = await authenticatedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, remarks: extraRemarks }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || 'Failed');
      Alert.alert('Updated', `Status changed to ${newStatus.replace(/_/g, ' ')}`);
      void load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setUpdating(false); }
  };

  const saveRemarks = async () => {
    if (!remarks.trim()) return;
    setUpdating(true);
    try {
      const url = isAQ
        ? `/api/mobile/case-logs/${id}/remarks?source_type=asset_query`
        : `/api/mobile/case-logs/${id}/remarks`;
      const res = await authenticatedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ remarks: remarks.trim() }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || 'Failed');
      Alert.alert('Saved', 'Remarks saved.');
      setRemarks('');
      void load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setUpdating(false); }
  };

  const assignEngineer = async (engineerId: number) => {
    setUpdating(true);
    try {
      const res = await authenticatedFetch(`/api/mobile/case-logs/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ engineerId }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || 'Failed');
      Alert.alert('Assigned', 'Engineer assigned successfully.');
      setShowAssign(false);
      void load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setUpdating(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <ActivityIndicator color={theme.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!wo) {
    return (
      <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: theme.textMuted }}>Case log not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const color = STATUS_COLOR[wo.status] || '#64748B';

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[ss.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[ss.headerTitle, { color: theme.textPrimary }]}>{wo.work_order_number}</Text>
          <View style={[ss.statusBadge, { backgroundColor: color + '18' }]}>
            <Text style={[ss.statusText, { color }]}>{(wo.status || '').replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={ss.scroll} showsVerticalScrollIndicator={false}>
          {/* Details */}
          <View style={[ss.section, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>DETAILS</Text>
            {[
              { label: 'Request #',   value: wo.work_order_number || '—' },
              { label: 'Asset',       value: wo.asset_name || '—' },
              { label: 'Location',    value: wo.location   || '—' },
              { label: 'Department',  value: wo.department_name || '—' },
              { label: 'Issue',       value: wo.issue_description || '—' },
              { label: 'Priority',    value: (wo.priority || '').toUpperCase() },
              { label: 'Raised by',   value: wo.raised_by_name || '—' },
              { label: 'Assigned to', value: wo.assigned_to_name || 'Unassigned' },
              { label: 'Remarks',     value: wo.remarks || '—' },
              { label: 'Raised on',   value: wo.created_at ? new Date(wo.created_at).toLocaleString() : '—' },
            ].map(row => (
              <View key={row.label} style={ss.detailRow}>
                <Text style={[ss.detailLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                <Text style={[ss.detailValue, { color: theme.textPrimary }]} numberOfLines={4}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Photos */}
          {Array.isArray(wo.images) && wo.images.length > 0 && (
            <View style={[ss.section, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
              <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>PHOTOS ({wo.images.length})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {wo.images.map((url: string, idx: number) => (
                  <TouchableOpacity key={idx} onPress={() => Linking.openURL(url.startsWith('http') ? url : `${API_BASE}${url}`)}
                    activeOpacity={0.8}>
                    <Image
                      source={{ uri: url.startsWith('http') ? url : `${API_BASE}${url}` }}
                      style={{ width: 90, height: 90, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── HC Staff Actions ── */}
          {capabilities.isHCStaff && wo.status === 'resolved' && (
            isAQ ? (
              // Asset query: close directly and go to review (no code required)
              <TouchableOpacity
                style={[ss.actionBtn, { backgroundColor: '#059669' }]}
                onPress={handleAQClose}
                disabled={updating}
              >
                {updating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={ss.actionBtnText}>Close &amp; Review</Text>
                }
              </TouchableOpacity>
            ) : (
              // Work order: direct confirmation
              <TouchableOpacity
                style={[ss.actionBtn, { backgroundColor: '#059669' }]}
                onPress={() => Alert.alert('Close Case?', 'Mark this case as closed?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Close', onPress: () => updateStatus('closed') },
                ])}
                disabled={updating}
              >
                {updating ? <ActivityIndicator color="#fff" /> : <Text style={ss.actionBtnText}>Close Case</Text>}
              </TouchableOpacity>
            )
          )}

          {/* ── Engineer Actions ── */}
          {capabilities.isHCEngineer && (
            <>
              {(wo.status === 'assigned' || (isAQ && wo.status === 'open')) && (
                <TouchableOpacity
                  style={[ss.actionBtn, { backgroundColor: '#D97706' }]}
                  onPress={() => updateStatus('in_progress')}
                  disabled={updating}
                >
                  {updating ? <ActivityIndicator color="#fff" /> : <Text style={ss.actionBtnText}>Mark In Progress</Text>}
                </TouchableOpacity>
              )}
              {wo.status === 'in_progress' && (
                <TouchableOpacity
                  style={[ss.actionBtn, { backgroundColor: '#059669' }]}
                  onPress={() => Alert.alert('Resolve?', 'Mark as resolved?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Resolve', onPress: () => updateStatus('resolved', remarks || undefined) },
                  ])}
                  disabled={updating}
                >
                  {updating ? <ActivityIndicator color="#fff" /> : <Text style={ss.actionBtnText}>Mark Resolved</Text>}
                </TouchableOpacity>
              )}

              {/* Remarks input */}
              <View style={[ss.section, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>ADD WORK NOTES</Text>
                <TextInput
                  style={[ss.textarea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Describe work done..."
                  placeholderTextColor={theme.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[ss.actionBtn, { backgroundColor: theme.primary, marginTop: 0 }]}
                  onPress={saveRemarks}
                  disabled={updating || !remarks.trim()}
                >
                  {updating ? <ActivityIndicator color="#fff" /> : <Text style={ss.actionBtnText}>Save Notes</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Admin Actions ── */}
          {capabilities.isHCAdmin && (
            <>
              {/* Assign to engineer */}
              {!['closed'].includes(wo.status) && (
                <TouchableOpacity
                  style={[ss.actionBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => setShowAssign(!showAssign)}
                >
                  <Text style={ss.actionBtnText}>{wo.cp_assigned_to ? 'Reassign Engineer' : 'Assign Engineer'}</Text>
                </TouchableOpacity>
              )}

              {showAssign && (
                <View style={[ss.section, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                  <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>SELECT ENGINEER</Text>
                  {engineers.length === 0
                    ? <Text style={{ color: theme.textMuted, fontSize: 13 }}>No engineers found</Text>
                    : engineers.map(eng => (
                      <TouchableOpacity
                        key={eng.id}
                        style={[ss.engOption, { borderColor: theme.border }]}
                        onPress={() => assignEngineer(eng.id)}
                        disabled={updating}
                      >
                        <View style={[ss.engAvatar, { backgroundColor: theme.primaryBg }]}>
                          <Text style={{ color: theme.primary, fontWeight: '700' }}>{(eng.fullName || '?')[0]}</Text>
                        </View>
                        <View>
                          <Text style={[{ color: theme.textPrimary, fontWeight: '600', fontSize: 13 }]}>{eng.fullName}</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{eng.designation || 'Engineer'}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                </View>
              )}

              {/* Status override */}
              <View style={[ss.section, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>CHANGE STATUS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {STATUS_FLOW.filter(s => s.key !== wo.status).map(s => {
                    const c = STATUS_COLOR[s.key] || '#64748B';
                    return (
                      <TouchableOpacity
                        key={s.key}
                        style={[ss.statusBtn, { borderColor: c, backgroundColor: c + '14' }]}
                        onPress={() => updateStatus(s.key)}
                        disabled={updating}
                      >
                        <Text style={[{ color: c, fontWeight: '700', fontSize: 12 }]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Admin remarks */}
              <View style={[ss.section, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                <Text style={[ss.sectionTitle, { color: theme.textMuted }]}>ADD NOTES</Text>
                <TextInput
                  style={[ss.textarea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.textPrimary }]}
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Notes..."
                  placeholderTextColor={theme.textMuted}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[ss.actionBtn, { backgroundColor: theme.primary, marginTop: 0 }]}
                  onPress={saveRemarks}
                  disabled={updating || !remarks.trim()}
                >
                  <Text style={ss.actionBtnText}>Save Notes</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  headerTitle:   { flex: 1, fontSize: 17, fontWeight: '700' },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText:    { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  scroll:        { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },
  section:       { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  sectionTitle:  { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  timeline:      { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  timelineItem:  { alignItems: 'center', flex: 1 },
  dot:           { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  line:          { width: 1, height: 20, marginTop: 2 },
  timelineLabel: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  detailRow:     { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  detailLabel:   { fontSize: 12, fontWeight: '600', width: 90 },
  detailValue:   { fontSize: 13, flex: 1, textAlign: 'right' },
  actionBtn:     { padding: Spacing.md, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.xs },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  textarea:      { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 13, minHeight: 90 },
  engOption:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  engAvatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statusBtn:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1.5 },
  hintBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm },
});
