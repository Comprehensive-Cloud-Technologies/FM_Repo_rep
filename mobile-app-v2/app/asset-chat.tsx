import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchAssetQueryDefaults, submitPublicAssetQuery } from '../utils/api';
import { useTheme, Typography, Spacing, Radius } from '../utils/theme';
import Header from '../components/Header';

export default function AssetChatScreen() {
  const { theme } = useTheme();
  const {
    assetId,
    assetName,
    assetType,
    building,
    floor,
    room,
    barcodeNumber,
  } = useLocalSearchParams<{
    assetId: string;
    assetName: string;
    assetType?: string;
    building?: string;
    floor?: string;
    room?: string;
    barcodeNumber?: string;
  }>();

  const [defaultQuestions, setDefaultQuestions] = useState<string[]>([]);
  const [selectedQuery, setSelectedQuery]       = useState<string>('');
  const [customMessage, setCustomMessage]       = useState('');
  const [requesterName, setRequesterName]       = useState('');
  const [requesterPhone, setRequesterPhone]     = useState('');
  const [submitting, setSubmitting]             = useState(false);
  const [submitted, setSubmitted]               = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  useEffect(() => {
    if (!assetId) return;
    fetchAssetQueryDefaults(Number(assetId))
      .then(({ questions }) => setDefaultQuestions(questions))
      .catch(() => setDefaultQuestions([]))
      .finally(() => setLoadingQuestions(false));
  }, [assetId]);

  const handleSubmit = async () => {
    if (!requesterName.trim()) {
      Alert.alert('Name required', 'Please enter your name so the team can reach you.');
      return;
    }
    const finalMessage = [selectedQuery, customMessage.trim()].filter(Boolean).join('\n');
    if (!finalMessage) {
      Alert.alert('Query required', 'Please select a query type or describe your issue.');
      return;
    }

    setSubmitting(true);
    try {
      await submitPublicAssetQuery(Number(assetId), {
        requesterName:  requesterName.trim(),
        requesterPhone: requesterPhone.trim() || undefined,
        queryType:      selectedQuery || undefined,
        message:        finalMessage,
      });
      setSubmitted(true);
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Could not send your query. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Query Submitted" showBack />
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: '#D1FAE5' }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={56} color="#059669" />
          </View>
          <Text style={[styles.successTitle, { color: theme.textPrimary }]}>Query Sent!</Text>
          <Text style={[styles.successSub, { color: theme.textSecondary }]}>
            Your query has been submitted to the admin team. They will reach out to you shortly.
          </Text>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Log a Query" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Asset info card */}
          <View style={[styles.assetCard, { backgroundColor: theme.primary }]}>
            <MaterialCommunityIcons name="hospital-box-outline" size={28} color="rgba(255,255,255,0.9)" />
            <View style={{ flex: 1 }}>
              <Text style={styles.assetCardName} numberOfLines={2}>{assetName}</Text>
              {barcodeNumber ? (
                <Text style={styles.assetCardBarcode}>{barcodeNumber}</Text>
              ) : null}
              {(building || floor || room) ? (
                <Text style={styles.assetCardLoc}>
                  📍 {[building, floor, room].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Section: Quick query selection */}
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>SELECT ISSUE TYPE</Text>

          {loadingQuestions ? (
            <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.lg }} />
          ) : (
            <View style={styles.queryGrid}>
              {defaultQuestions.map((q) => {
                const active = selectedQuery === q;
                return (
                  <TouchableOpacity
                    key={q}
                    onPress={() => setSelectedQuery(active ? '' : q)}
                    activeOpacity={0.8}
                    style={[
                      styles.queryChip,
                      {
                        backgroundColor: active ? theme.primary : theme.surface,
                        borderColor: active ? theme.primary : theme.borderLight,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.queryChipText,
                        { color: active ? '#fff' : theme.textPrimary },
                      ]}
                    >
                      {q}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Additional message */}
          <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: Spacing.md }]}>
            ADDITIONAL DETAILS (OPTIONAL)
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
                color: theme.textPrimary,
              },
            ]}
            placeholder="Describe your issue in detail…"
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={4}
            value={customMessage}
            onChangeText={setCustomMessage}
            textAlignVertical="top"
          />

          {/* Contact info */}
          <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: Spacing.md }]}>
            YOUR CONTACT INFO
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
                color: theme.textPrimary,
              },
            ]}
            placeholder="Your name *"
            placeholderTextColor={theme.textMuted}
            value={requesterName}
            onChangeText={setRequesterName}
            autoCapitalize="words"
          />
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderLight,
                color: theme.textPrimary,
                marginTop: Spacing.sm,
              },
            ]}
            placeholder="Phone number (optional)"
            placeholderTextColor={theme.textMuted}
            value={requesterPhone}
            onChangeText={setRequesterPhone}
            keyboardType="phone-pad"
          />

          {/* Submit button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor:
                  submitting ? theme.primaryBg : theme.primary,
              },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Send Query to Admin</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:            { flex: 1 },
  scroll:          { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  assetCard:       {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  assetCardName:   { ...Typography.h4, color: '#fff', marginBottom: 3 },
  assetCardBarcode:{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'monospace', marginBottom: 2 },
  assetCardLoc:    { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  sectionLabel:    { ...Typography.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: Spacing.sm },
  queryGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  queryChip:       {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  queryChipText:   { ...Typography.bodyS, fontWeight: '600' },
  textArea:        {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: 14,
    minHeight: 100,
    fontFamily: 'System',
  },
  input:           {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    fontSize: 14,
    height: 48,
  },
  submitBtn:       {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
  },
  submitBtnText:   { fontSize: 16, fontWeight: '700', color: '#fff' },
  successContainer:{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  successIcon:     { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  successTitle:    { ...Typography.h2, marginBottom: Spacing.sm },
  successSub:      { ...Typography.body, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  doneBtn:         { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md, borderRadius: Radius.lg },
  doneBtnText:     { fontSize: 16, fontWeight: '700', color: '#fff' },
});
