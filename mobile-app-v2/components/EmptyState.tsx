import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, Spacing, Radius, Typography, Shadows } from '../utils/theme';

interface Props {
  icon?: string;
  title?: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export default function EmptyState({ icon = 'inbox-outline', title = 'Nothing here yet', message, action }: Props) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconOuter, { backgroundColor: theme.surfaceAlt }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.primaryBg }]}>
          <MaterialCommunityIcons name={icon as any} size={38} color={theme.primary} />
        </View>
      </View>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {message ? <Text style={[styles.msg, { color: theme.textSecondary }]}>{message}</Text> : null}
      {action ? (
        <TouchableOpacity
          style={[styles.btn, Shadows.brand, { backgroundColor: theme.primary }]}
          onPress={action.onPress}
          activeOpacity={0.85}
        >
          <Text style={[styles.btnText, { color: theme.textInverse }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },
  iconOuter:{ width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  iconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  title:    { ...Typography.h3, marginBottom: Spacing.sm, textAlign: 'center' },
  msg:      { ...Typography.body, textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 22, maxWidth: 300 },
  btn:      { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md + 2, borderRadius: Radius.md },
  btnText:  { ...Typography.h4 },
});
