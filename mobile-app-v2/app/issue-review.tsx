import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { submitQueryReview } from '../utils/api';
import { useTheme, Spacing, Radius, Shadows } from '../utils/theme';
import Header from '../components/Header';

function StarRow({ rating, onRate }: { rating: number; onRate: (r: number) => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: Spacing.lg }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onRate(star)} activeOpacity={0.7}>
          <MaterialCommunityIcons
            name={star <= rating ? 'star' : 'star-outline'}
            size={40}
            color={star <= rating ? '#F59E0B' : theme.borderLight}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent',
};

export default function IssueReviewScreen() {
  const { theme } = useTheme();
  const { queryId, queryTitle } = useLocalSearchParams<{ queryId: string; queryTitle?: string }>();

  const [rating, setRating]     = useState(0);
  const [review, setReview]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Rating required', 'Please select a star rating before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await submitQueryReview(Number(queryId), rating, review.trim() || undefined);
      Alert.alert('Thank you!', 'Your feedback has been submitted.', [
        { text: 'OK', onPress: () => router.replace('/my-requests') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Header title="Rate & Review" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: theme.primaryBg }]}>
          <MaterialCommunityIcons name="check-circle" size={56} color={theme.primary} />
          <Text style={[styles.heroTitle, { color: theme.primary }]}>Issue Closed!</Text>
          <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
            How was your experience with the resolution?
          </Text>
        </View>

        {/* Issue title */}
        {queryTitle ? (
          <View style={[styles.issueTitleBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <MaterialCommunityIcons name="ticket-outline" size={16} color={theme.textMuted} />
            <Text style={[styles.issueTitleText, { color: theme.textSecondary }]} numberOfLines={2}>{queryTitle}</Text>
          </View>
        ) : null}

        {/* Star rating */}
        <View style={[styles.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>YOUR RATING</Text>
          <StarRow rating={rating} onRate={setRating} />
          {rating > 0 && (
            <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#F59E0B', marginBottom: Spacing.sm }}>
              {RATING_LABELS[rating]}
            </Text>
          )}
        </View>

        {/* Review text */}
        <View style={[styles.card, Shadows.sm, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>YOUR REVIEW (OPTIONAL)</Text>
          <TextInput
            style={[styles.textArea, { borderColor: theme.borderLight, color: theme.textPrimary, backgroundColor: theme.background }]}
            value={review}
            onChangeText={setReview}
            placeholder="Share your experience about this service..."
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={{ fontSize: 11, color: theme.textMuted, textAlign: 'right', marginTop: 4 }}>{review.length}/500</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: rating > 0 ? theme.primary : theme.borderLight, opacity: submitting ? 0.7 : 1 }]}
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <MaterialCommunityIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Review</Text>
              </>
          }
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/my-requests')} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: theme.textMuted }]}>Skip for now</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: 48, gap: Spacing.md },
  hero:   { borderRadius: Radius.xl, padding: Spacing.xxl, alignItems: 'center', gap: Spacing.sm },
  heroTitle: { fontSize: 22, fontWeight: '800' },
  heroSub:   { fontSize: 14, textAlign: 'center' },
  issueTitleBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  issueTitleText: { flex: 1, fontSize: 13 },
  card: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm, borderWidth: 1 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  textArea: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, fontSize: 14, minHeight: 120 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: 14, borderRadius: Radius.lg },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  skipText: { fontSize: 13 },
});
