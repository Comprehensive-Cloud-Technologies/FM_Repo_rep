import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMySubmissionDetail } from '../utils/api';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../utils/theme';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';

function AnswerValue({ answer }: { answer: any }) {
  const { theme } = useTheme();

  // Backend stores answers as { value: <answer>, photoUrl?: <url> } JSON objects.
  // These arrive as either a parsed object or a raw JSON string — handle both.
  let raw = answer.value ?? answer.answer ?? null;
  let photoUrl: string | null = answer.photoUrl ?? null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        raw      = parsed.value ?? parsed.answer ?? null;
        photoUrl = photoUrl ?? parsed.photoUrl ?? parsed.url ?? null;
      } catch { /* keep raw as-is */ }
    }
  } else if (raw && typeof raw === 'object') {
    photoUrl = photoUrl ?? (raw as any).photoUrl ?? (raw as any).url ?? null;
    raw      = (raw as any).value ?? (raw as any).answer ?? null;
  }

  const str = raw != null && raw !== '' ? String(raw) : null;

  // Detect photo URLs in value itself
  const valIsPhoto = str && /^https?:\/\/.+\.(jpe?g|png|gif|webp)/i.test(str);
  const displayPhoto = photoUrl ?? (valIsPhoto ? str : null);

  if (displayPhoto) {
    return (
      <TouchableOpacity onPress={() => Linking.openURL(displayPhoto)} activeOpacity={0.85}>
        <Image source={{ uri: displayPhoto }} style={styles.photoThumb} resizeMode="cover" />
        <Text style={[styles.photoCaption, { color: theme.textMuted }]}>Tap to open full image</Text>
      </TouchableOpacity>
    );
  }
  return (
    <Text style={[styles.answer, { color: answer.flagged ? theme.warning : theme.textPrimary }]}>
      {valIsPhoto ? null : (str || '—')}
    </Text>
  );
}

export default function SubmissionDetailScreen() {
  const { theme } = useTheme();
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMySubmissionDetail(type, Number(id))
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [type, id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Submission" showBack />
        <ActivityIndicator color={theme.primary} style={{ marginTop: Spacing.xxl }} />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
        <Header title="Submission" showBack />
        <Text style={[styles.error, { color: theme.textSecondary }]}>Submission not found.</Text>
      </SafeAreaView>
    );
  }

  const answers: any[] = detail.answers ?? detail.fields ?? [];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title={detail.templateName ?? 'Submission'} subtitle={detail.assetName} showBack />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Meta */}
        <View style={[styles.metaCard, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Submitted</Text>
            <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{new Date(detail.submittedAt).toLocaleString()}</Text>
          </View>
          {(detail.submittedByName || detail.submittedBy) ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Submitted By</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{detail.submittedByName ?? detail.submittedBy}</Text>
            </View>
          ) : null}
          {detail.hasFlagged ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Status</Text>
              <StatusBadge label="Has Flags" variant="warning" />
            </View>
          ) : null}
          {(detail.locationAddress || (detail.latitude && detail.longitude)) ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Location</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]} numberOfLines={2}>
                {detail.locationAddress
                  ? detail.locationAddress
                  : `${Number(detail.latitude).toFixed(5)}, ${Number(detail.longitude).toFixed(5)}`}
              </Text>
            </View>
          ) : null}
          {detail.deviceIp ? (
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.textSecondary }]}>Device IP</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]}>{detail.deviceIp}</Text>
            </View>
          ) : null}
        </View>

        {/* Answers */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>RESPONSES</Text>
        {answers.map((a, idx) => (
          <View key={a.questionId ?? a.question ?? idx} style={[styles.answerCard, Shadows.xs, { backgroundColor: theme.surface, borderColor: theme.borderLight, borderLeftColor: a.flagged ? theme.warning : theme.primary, borderLeftWidth: a.flagged ? 4 : 3 }]}>
            <Text style={[styles.question, { color: theme.textSecondary }]}>{a.label ?? a.question ?? a.questionText}</Text>
            <AnswerValue answer={a} />
            {a.flagged ? (
              <Text style={[styles.flagNote, { color: theme.warning }]}>⚠ Value out of range</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  scroll:       { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  metaCard:     { borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, borderWidth: 1 },
  metaRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel:    { ...Typography.bodyS },
  metaValue:    { ...Typography.body },
  sectionTitle: { ...Typography.overline },
  answerCard:   { borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, gap: Spacing.xs },
  question:     { ...Typography.bodyS },
  answer:       { ...Typography.h4 },
  flagNote:     { ...Typography.micro },
  error:        { ...Typography.body, textAlign: 'center', marginTop: Spacing.xxl },
  photoThumb:   { width: '100%', height: 160, borderRadius: Radius.md, marginTop: 4 },
  photoCaption: { ...Typography.micro, marginTop: 4, textAlign: 'center' },
});
