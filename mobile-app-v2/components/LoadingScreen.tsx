import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../utils/theme';

export default function LoadingScreen({ message = 'Loading…' }: { message?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.background }]}>
      <View style={[styles.card, Shadows.sm, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
      <Text style={[styles.text, { color: theme.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  card: { width: 72, height: 72, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  text: { ...Typography.body },
});
