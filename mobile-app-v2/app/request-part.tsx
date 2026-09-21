/**
 * request-part.tsx — engineer raises a spare-part indent while solving a ticket.
 * Pick one or more parts + quantity, add a note, submit for admin approval.
 * Opened from a ticket (passes ticketId / assetId) or standalone.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchParts, createIndent, Part } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';

export default function RequestPartScreen() {
  const { theme } = useTheme();
  const { ticketId, assetId, assetName } = useLocalSearchParams<{ ticketId?: string; assetId?: string; assetName?: string }>();

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<{ partId: number | null; qty: string }[]>([{ partId: null, qty: '1' }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setParts(await fetchParts()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setRow = (i: number, patch: Partial<{ partId: number | null; qty: string }>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { partId: null, qty: '1' }]);
  const rmRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  const partName = (id: number | null) => parts.find((p) => p.id === id)?.partName;

  const submit = async () => {
    const items = rows
      .map((r) => ({ partId: Number(r.partId), qty: Math.max(1, parseInt(r.qty, 10) || 0) }))
      .filter((r) => r.partId && r.qty > 0);
    if (!items.length) { Alert.alert('Add a part', 'Select at least one part and quantity.'); return; }
    setSaving(true);
    try {
      await createIndent({
        ticketId: ticketId ? Number(ticketId) : null,
        assetId: assetId ? Number(assetId) : null,
        notes: notes.trim() || null,
        items,
      });
      Alert.alert('Indent submitted', 'Your part request has been sent for approval.', [
        { text: 'View my indents', onPress: () => router.replace('/my-indents') },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not submit the indent.');
    } finally { setSaving(false); }
  };

  const inputStyle = [ss.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <View style={[ss.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[ss.title, { color: theme.textPrimary }]}>Request a Part</Text>
          {assetName ? <Text style={{ fontSize: 12, color: theme.textMuted }} numberOfLines={1}>For: {assetName}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => router.push('/my-indents')} style={{ padding: 4 }}>
          <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>My Indents</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md }} keyboardShouldPersistTaps="handled">
            {parts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <MaterialCommunityIcons name="cog-outline" size={44} color={theme.textMuted} />
                <Text style={{ color: theme.textMuted }}>No parts in the register yet. Add parts first.</Text>
              </View>
            ) : (
              <>
                {rows.map((r, i) => (
                  <View key={i} style={[ss.rowCard, Shadows.xs, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                    <TouchableOpacity onPress={() => setPickerFor(pickerFor === i ? null : i)} style={[inputStyle, { justifyContent: 'center' }]}>
                      <Text style={{ color: r.partId ? theme.textPrimary : theme.textMuted, fontSize: 14 }}>
                        {r.partId ? partName(r.partId) : 'Select part…'}
                      </Text>
                    </TouchableOpacity>
                    {pickerFor === i && (
                      <View style={[ss.picker, { borderColor: theme.border, backgroundColor: theme.background }]}>
                        {parts.map((p) => (
                          <TouchableOpacity key={p.id} onPress={() => { setRow(i, { partId: p.id }); setPickerFor(null); }}
                            style={[ss.pickItem, { borderBottomColor: theme.borderLight }]}>
                            <Text style={{ color: theme.textPrimary, fontSize: 13.5, fontWeight: '600' }}>{p.partName}</Text>
                            <Text style={{ color: theme.textMuted, fontSize: 11.5 }}>
                              {[p.make, p.model].filter(Boolean).join(' · ')}  ·  avail {p.availableQuantity ?? 0}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: 10 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 13 }}>Qty</Text>
                      <TextInput style={[inputStyle, { width: 90 }]} value={r.qty} onChangeText={(v) => setRow(i, { qty: v })}
                        keyboardType="number-pad" placeholder="1" placeholderTextColor={theme.textMuted} />
                      <View style={{ flex: 1 }} />
                      {rows.length > 1 && (
                        <TouchableOpacity onPress={() => rmRow(i)}>
                          <MaterialCommunityIcons name="trash-can-outline" size={22} color="#dc2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                <TouchableOpacity onPress={addRow} style={[ss.addBtn, { borderColor: theme.border }]}>
                  <MaterialCommunityIcons name="plus" size={18} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13.5 }}>Add another part</Text>
                </TouchableOpacity>

                <Text style={[ss.label, { color: theme.textMuted }]}>Note (why is this part needed?)</Text>
                <TextInput style={[inputStyle, { minHeight: 70, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes}
                  multiline placeholder="Optional note for the approver" placeholderTextColor={theme.textMuted} />

                <TouchableOpacity onPress={submit} disabled={saving}
                  style={[ss.submit, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
                  {saving ? <ActivityIndicator color="#fff" />
                    : <><MaterialCommunityIcons name="send" size={18} color="#fff" /><Text style={ss.submitText}>Submit for approval</Text></>}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  header:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title:    { fontSize: 17, fontWeight: '800' },
  rowCard:  { borderRadius: Radius.lg, borderWidth: 1, padding: 12 },
  input:    { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 42 },
  picker:   { borderWidth: 1, borderRadius: Radius.md, marginTop: 8, maxHeight: 220, overflow: 'hidden' },
  pickItem: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1 },
  addBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 12 },
  label:    { fontSize: 12, fontWeight: '600', marginTop: 6 },
  submit:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.md, paddingVertical: 15, marginTop: 8 },
  submitText:{ color: '#fff', fontWeight: '800', fontSize: 15 },
});
