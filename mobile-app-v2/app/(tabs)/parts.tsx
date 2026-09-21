/**
 * (tabs)/parts.tsx — Part Generation.
 * Add a spare part (name, make, model, photo → S3) and see the parts already
 * registered for the company.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  StyleSheet, RefreshControl, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { createPart, fetchParts, uploadPartPhoto, Part } from '../../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../../utils/theme';

export default function PartsTab() {
  const { theme } = useTheme();

  // Form state
  const [partName, setPartName] = useState('');
  const [make, setMake]         = useState('');
  const [model, setModel]       = useState('');
  const [totalQty, setTotalQty] = useState('');
  const [availQty, setAvailQty] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  // List state
  const [parts, setParts]       = useState<Part[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setParts(await fetchParts()); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickFrom = async (mode: 'camera' | 'gallery') => {
    try {
      if (mode === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Allow camera access to take a photo.'); return; }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!r.canceled && r.assets?.[0]) setPhotoUri(r.assets[0].uri);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
        if (!r.canceled && r.assets?.[0]) setPhotoUri(r.assets[0].uri);
      }
    } catch { Alert.alert('Error', 'Could not pick an image.'); }
  };

  const reset = () => { setPartName(''); setMake(''); setModel(''); setTotalQty(''); setAvailQty(''); setPhotoUri(null); };

  const submit = async () => {
    if (!partName.trim()) { Alert.alert('Required', 'Please enter a part name.'); return; }
    const total = totalQty.trim() ? Math.max(0, parseInt(totalQty, 10) || 0) : 0;
    let avail = availQty.trim() ? Math.max(0, parseInt(availQty, 10) || 0) : total;
    if (avail > total) avail = total;
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (photoUri) {
        try { photoUrl = await uploadPartPhoto(photoUri); }
        catch { Alert.alert('Photo not uploaded', 'The part will be saved without the photo (image upload failed).'); }
      }
      await createPart({ partName: partName.trim(), make: make.trim(), model: model.trim(), photoUrl, totalQuantity: total, availableQuantity: avail });
      reset();
      Alert.alert('Part added', 'The part has been saved.');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save the part.');
    } finally { setSaving(false); }
  };

  const inputStyle = [styles.input, { borderColor: theme.border, color: theme.textPrimary, backgroundColor: theme.background }];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Part Generation</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40, gap: Spacing.lg }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
        >
          {/* ── Add-part form ── */}
          <View style={[styles.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Add a new part</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Part name *</Text>
            <TextInput style={inputStyle} value={partName} onChangeText={setPartName}
              placeholder="e.g. Air filter" placeholderTextColor={theme.textMuted} />

            <Text style={[styles.label, { color: theme.textMuted }]}>Make</Text>
            <TextInput style={inputStyle} value={make} onChangeText={setMake}
              placeholder="e.g. Philips" placeholderTextColor={theme.textMuted} />

            <Text style={[styles.label, { color: theme.textMuted }]}>Model</Text>
            <TextInput style={inputStyle} value={model} onChangeText={setModel}
              placeholder="e.g. HR-2000" placeholderTextColor={theme.textMuted} />

            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Total quantity</Text>
                <TextInput style={inputStyle} value={totalQty} onChangeText={setTotalQty}
                  placeholder="0" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Available</Text>
                <TextInput style={inputStyle} value={availQty} onChangeText={setAvailQty}
                  placeholder="= total" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
              </View>
            </View>

            <Text style={[styles.label, { color: theme.textMuted }]}>Photo</Text>
            {photoUri ? (
              <View style={styles.photoWrap}>
                <Image source={{ uri: photoUri }} style={styles.photo} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotoUri(null)}>
                  <MaterialCommunityIcons name="close-circle" size={26} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                <TouchableOpacity style={[styles.photoBtn, { borderColor: theme.border }]} onPress={() => pickFrom('camera')}>
                  <MaterialCommunityIcons name="camera" size={20} color={theme.primary} />
                  <Text style={[styles.photoBtnText, { color: theme.primary }]}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoBtn, { borderColor: theme.border }]} onPress={() => pickFrom('gallery')}>
                  <MaterialCommunityIcons name="image-multiple" size={20} color={theme.primary} />
                  <Text style={[styles.photoBtnText, { color: theme.primary }]}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" />
                : <><MaterialCommunityIcons name="plus-circle" size={20} color="#fff" /><Text style={styles.submitText}>Add Part</Text></>}
            </TouchableOpacity>
          </View>

          {/* ── Existing parts ── */}
          <View>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Parts {parts.length > 0 ? `(${parts.length})` : ''}
            </Text>
            {loading ? (
              <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
            ) : parts.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="cog-outline" size={44} color={theme.textMuted} />
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>No parts added yet.</Text>
              </View>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {parts.map((p) => (
                  <View key={p.id} style={[styles.partRow, Shadows.xs, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                    {p.photoUrl ? (
                      <Image source={{ uri: p.photoUrl }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: theme.background }]}>
                        <MaterialCommunityIcons name="cog" size={22} color={theme.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.partName, { color: theme.textPrimary }]} numberOfLines={1}>{p.partName}</Text>
                      <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
                        {[p.make, p.model].filter(Boolean).join(' · ') || 'No make / model'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: (p.availableQuantity ?? 0) <= 0 ? '#dc2626' : theme.primary }}>
                        {p.availableQuantity ?? 0}
                      </Text>
                      <Text style={{ fontSize: 10.5, color: theme.textMuted }}>of {p.totalQuantity ?? 0}{p.unit ? ` ${p.unit}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:       { fontSize: 20, fontWeight: '800' },
  card:        { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg, gap: 6 },
  cardTitle:   { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  label:       { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  input:       { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  photoWrap:   { marginTop: 4, position: 'relative', alignSelf: 'flex-start' },
  photo:       { width: 120, height: 120, borderRadius: Radius.md },
  photoRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 13 },
  photoBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 12 },
  photoBtnText:{ fontSize: 13, fontWeight: '700' },
  submitBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.md, paddingVertical: 14, marginTop: 16 },
  submitText:  { color: '#fff', fontWeight: '800', fontSize: 15 },
  sectionTitle:{ fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  empty:       { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:   { fontSize: 14, fontWeight: '600' },
  partRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.md, borderWidth: 1, padding: 10 },
  thumb:       { width: 52, height: 52, borderRadius: Radius.sm },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  partName:    { fontSize: 14, fontWeight: '700' },
});
