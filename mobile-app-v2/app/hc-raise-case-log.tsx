/**
 * Raise Case Log — for HC Staff (Nurse / Doctor / Ward Boy)
 * Route: /hc-raise-case-log
 * Params: assetId?, assetName? (pre-filled from QR scan)
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authenticatedFetch } from '../utils/api';
import { useTheme, Spacing, Radius } from '../utils/theme';

const PRIORITIES = [
  { value: 'low',      label: 'Low',      color: '#64748B' },
  { value: 'medium',   label: 'Medium',   color: '#D97706' },
  { value: 'high',     label: 'High',     color: '#DC2626' },
  { value: 'critical', label: 'Critical', color: '#7C3AED' },
];

export default function HCRaiseCaseLog() {
  const { theme } = useTheme();
  const params = useLocalSearchParams<{ assetId?: string; assetName?: string; location?: string }>();

  const [assetName, setAssetName]   = useState(params.assetName || '');
  const [location, setLocation]     = useState(params.location  || '');
  const [issue, setIssue]           = useState('');
  const [priority, setPriority]     = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!issue.trim()) {
      Alert.alert('Required', 'Please describe the issue.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authenticatedFetch('/api/mobile/case-logs', {
        method: 'POST',
        body: JSON.stringify({
          assetId:          params.assetId ? Number(params.assetId) : undefined,
          assetName:        assetName.trim() || undefined,
          location:         location.trim() || undefined,
          issueDescription: issue.trim(),
          priority,
        }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.message || 'Failed to submit');
      Alert.alert('Success', `Case log ${data.workOrderNumber} raised successfully.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[ss.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[ss.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={ss.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text style={[ss.headerTitle, { color: theme.textPrimary }]}>Raise Case Log</Text>
        </View>

        <ScrollView contentContainerStyle={ss.scroll} keyboardShouldPersistTaps="handled">
          {/* Asset */}
          <Text style={[ss.label, { color: theme.textSecondary }]}>Asset Name</Text>
          <TextInput
            style={[ss.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={assetName}
            onChangeText={setAssetName}
            placeholder="e.g. Anesthesia Machine"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[ss.label, { color: theme.textSecondary }]}>Location / Ward</Text>
          <TextInput
            style={[ss.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. ICU Ward 3"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[ss.label, { color: theme.textSecondary }]}>Issue Description *</Text>
          <TextInput
            style={[ss.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={issue}
            onChangeText={setIssue}
            placeholder="Describe the problem in detail..."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />

          <Text style={[ss.label, { color: theme.textSecondary }]}>Priority</Text>
          <View style={ss.priorityRow}>
            {PRIORITIES.map(p => (
              <TouchableOpacity
                key={p.value}
                style={[ss.priorityBtn, {
                  backgroundColor: priority === p.value ? p.color : theme.surface,
                  borderColor: p.color,
                }]}
                onPress={() => setPriority(p.value)}
              >
                <Text style={[ss.priorityText, { color: priority === p.value ? '#fff' : p.color }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[ss.submitBtn, { backgroundColor: submitting ? theme.primaryBg : theme.primary }]}
            onPress={submit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={ss.submitText}>Submit Case Log</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  backBtn:     { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll:      { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 48 },
  label:       { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: -4 },
  input:       { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14 },
  textarea:    { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14, minHeight: 120 },
  priorityRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  priorityBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5 },
  priorityText:{ fontWeight: '700', fontSize: 12 },
  submitBtn:   { padding: Spacing.md + 2, borderRadius: Radius.lg, alignItems: 'center', marginTop: Spacing.md },
  submitText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
