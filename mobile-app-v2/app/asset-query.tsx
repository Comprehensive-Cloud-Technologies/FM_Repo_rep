/**
 * asset-query.tsx
 * Shown after scanning an asset barcode/QR. Displays asset details and lets
 * the user raise a query / report an issue, capturing or picking images.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetchAssetByBarcode, submitAssetQuery, uploadQueryImage, getToken } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

export default function AssetQueryScreen() {
  const { theme } = useTheme();
  const { assetId, assetName: paramName, barcodeStr } = useLocalSearchParams<{
    assetId: string;
    assetName: string;
    barcodeStr: string;
  }>();

  const [asset, setAsset]               = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [images, setImages]             = useState<string[]>([]);
  const [uploading, setUploading]       = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [submitted, setSubmitted]       = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (barcodeStr) {
          const data = await fetchAssetByBarcode(barcodeStr) as any;
          setAsset(data);
        } else if (assetId) {
          setAsset({ id: Number(assetId), assetName: paramName, assetUniqueId: barcodeStr });
        }
      } catch {
        setAsset({ id: Number(assetId), assetName: paramName, assetUniqueId: barcodeStr });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [assetId, barcodeStr, paramName]);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  };

  const requestMediaPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  };

  const pickFromGallery = async () => {
    if (images.length >= 5) { Alert.alert('Limit', 'Maximum 5 images allowed.'); return; }
    const ok = await requestMediaPermission();
    if (!ok) { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.75,
    });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri).slice(0, 5 - images.length);
      setImages(prev => [...prev, ...uris]);
    }
  };

  const captureFromCamera = async () => {
    if (images.length >= 5) { Alert.alert('Limit', 'Maximum 5 images allowed.'); return; }
    const ok = await requestCameraPermission();
    if (!ok) { Alert.alert('Permission needed', 'Allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.75 });
    if (!result.canceled && result.assets[0]) {
      setImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter an issue title.');
      return;
    }
    if (!asset?.id) {
      Alert.alert('Error', 'Asset not found. Please scan again.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken();
      // Upload images to server first
      let serverImageUrls: string[] = [];
      if (images.length > 0 && token) {
        setUploading(true);
        const results = await Promise.allSettled(
          images.map(uri => uploadQueryImage(token, uri))
        );
        serverImageUrls = results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
          .map(r => r.value);
        setUploading(false);
      }
      await submitAssetQuery({
        assetId: asset.id,
        title: title.trim(),
        description: description.trim() || undefined,
        images: serverImageUrls.length ? serverImageUrls : undefined,
        priority: 'normal',
      });
      setSubmitted(true);
    } catch (err: any) {
      setUploading(false);
      Alert.alert('Failed', err?.message || 'Could not submit query. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const meta = asset?.metadata || {};
  const location = [asset?.building, asset?.floor, asset?.room].filter(Boolean).join(' / ');

  const infoRows: [string, string][] = [
    ['Asset ID', asset?.generatedAssetId ?? asset?.assetUniqueId ?? asset?.uniqueId],
    ['Location', location || null],
    ['Make / Model', [meta.make, meta.model].filter(Boolean).join(' / ') || null],
    ['Serial No.', meta.serialNo],
    ['Department', asset?.departmentName],
    ['Assigned To', asset?.assignedToName],
    ['Status', asset?.status ?? 'Active'],
  ].filter(([, v]) => v) as [string, string][];

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title="Asset Details" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title="Query Submitted" showBack />
        <View style={styles.center}>
          <MaterialCommunityIcons name="check-circle" size={80} color="#16a34a" />
          <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Request Submitted!</Text>
          <Text style={[styles.successSub, { color: theme.textSecondary }]}>
            Your query for <Text style={{ fontWeight: '700' }}>{asset?.assetName}</Text> has been sent to the assigned technician.
          </Text>
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: theme.primary }]} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Asset Details" showBack />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Asset identity card */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.inputBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md }}>
              <View style={[styles.iconBox, { backgroundColor: theme.primaryBg }]}>
                <MaterialCommunityIcons name="medical-bag" size={28} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.assetName, { color: theme.textPrimary }]}>{asset?.assetName ?? paramName}</Text>
                {(asset?.generatedAssetId ?? asset?.assetUniqueId ?? asset?.uniqueId) ? (
                  <Text style={[styles.barcodeText, { color: theme.textMuted }]}>
                    <MaterialCommunityIcons name="identifier" size={12} /> Asset ID: {asset?.generatedAssetId ?? asset?.assetUniqueId ?? asset?.uniqueId}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#f0fdf4' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>{asset?.status ?? 'Active'}</Text>
              </View>
            </View>

            {/* Info rows */}
            {infoRows.map(([label, value]) => (
              <View key={label} style={[styles.infoRow, { borderTopColor: theme.inputBorder }]}>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
                <Text style={[styles.infoValue, { color: theme.textPrimary }]}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Raise query button / form */}
          {!showForm ? (
            <TouchableOpacity
              style={[styles.chatBtn, { backgroundColor: theme.primary }]}
              onPress={() => setShowForm(true)}
              activeOpacity={0.85}>
              <MaterialCommunityIcons name="chat-plus-outline" size={20} color="#fff" />
              <Text style={styles.chatBtnText}>Raise a Query / Report Issue</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.inputBorder }]}>
              <Text style={[styles.formTitle, { color: theme.textPrimary }]}>Report an Issue</Text>
              <Text style={[styles.formSub, { color: theme.textSecondary }]}>
                Asset: <Text style={{ fontWeight: '700' }}>{asset?.assetName}</Text>
                {asset?.assetUniqueId || asset?.uniqueId ? `  ·  ${asset?.assetUniqueId ?? asset?.uniqueId}` : ''}
              </Text>

              {/* Quick options */}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Quick issue type (tap to fill):</Text>
              <View style={styles.quickRow}>
                {['Machine not working', 'Needs maintenance', 'Safety concern', 'Calibration needed', 'Other issue'].map(opt => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setTitle(opt)}
                    style={[styles.quickChip, { backgroundColor: title === opt ? theme.primary : theme.inputBg, borderColor: title === opt ? theme.primary : theme.inputBorder }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: title === opt ? '#fff' : theme.textSecondary }}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Issue title *</Text>
              <TextInput
                style={[styles.input, { color: theme.inputText, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Briefly describe the issue…"
                placeholderTextColor={theme.inputPlaceholder}
              />

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Detailed description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: theme.inputText, backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Provide more context about the issue…"
                placeholderTextColor={theme.inputPlaceholder}
                multiline
                numberOfLines={4}
              />

              {/* Image attachments */}
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                Attach images (optional · {images.length}/5)
              </Text>
              <View style={styles.imageRow}>
                {images.map((uri, i) => (
                  <View key={i} style={styles.thumbWrap}>
                    <Image source={{ uri }} style={styles.thumb} />
                    <TouchableOpacity
                      style={styles.removeImg}
                      onPress={() => setImages(p => p.filter((_, j) => j !== i))}>
                      <MaterialCommunityIcons name="close-circle" size={20} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ))}
                {images.length < 5 && (
                  <>
                    <TouchableOpacity
                      style={[styles.addImgBtn, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}
                      onPress={captureFromCamera}>
                      <MaterialCommunityIcons name="camera" size={24} color={theme.primary} />
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.addImgBtn, { borderColor: theme.inputBorder, backgroundColor: theme.inputBg }]}
                      onPress={pickFromGallery}>
                      <MaterialCommunityIcons name="image-multiple-outline" size={24} color={theme.textMuted} />
                      <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 4 }}>Gallery</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity onPress={() => setShowForm(false)}
                  style={[styles.cancelBtn, { borderColor: theme.inputBorder }]}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSubmit} disabled={submitting || !title.trim()}
                  style={[styles.submitBtn, { backgroundColor: (!title.trim() || submitting) ? theme.textMuted : theme.primary }]}>
                  {submitting ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={styles.submitBtnText}>{uploading ? 'Uploading…' : 'Submitting…'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.submitBtnText}>Submit Query</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  scroll:        { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.lg },
  card:          { borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.lg, overflow: 'hidden' },
  iconBox:       { width: 48, height: 48, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  assetName:     { ...Typography.h3, marginBottom: 2 },
  barcodeText:   { ...Typography.micro },
  statusBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  infoRow:       { flexDirection: 'row', gap: Spacing.md, paddingVertical: 10, borderTopWidth: 1 },
  infoLabel:     { ...Typography.bodyS, minWidth: 110, flexShrink: 0 },
  infoValue:     { ...Typography.bodyS, flex: 1, fontWeight: '600' },
  chatBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg, borderRadius: Radius.lg },
  chatBtnText:   { ...Typography.h4, color: '#fff' },
  formTitle:     { ...Typography.h3, marginBottom: 4 },
  formSub:       { ...Typography.bodyS, marginBottom: Spacing.lg },
  fieldLabel:    { ...Typography.label, marginBottom: 6, marginTop: Spacing.md },
  quickRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip:     { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  input:         { borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  textArea:      { height: 100, textAlignVertical: 'top', paddingTop: 10 },
  imageRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  thumbWrap:     { position: 'relative' },
  thumb:         { width: 80, height: 80, borderRadius: Radius.md },
  removeImg:     { position: 'absolute', top: -8, right: -8, backgroundColor: '#fff', borderRadius: 10 },
  addImgBtn:     { width: 80, height: 80, borderRadius: Radius.md, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  formActions:   { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  cancelBtn:     { flex: 1, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, alignItems: 'center' },
  submitBtn:     { flex: 2, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
  submitBtnText: { ...Typography.h4, color: '#fff' },
  successTitle:  { ...Typography.h2, textAlign: 'center' },
  successSub:    { ...Typography.body, textAlign: 'center' },
  doneBtn:       { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.md },
  doneBtnText:   { ...Typography.h4, color: '#fff' },
});
