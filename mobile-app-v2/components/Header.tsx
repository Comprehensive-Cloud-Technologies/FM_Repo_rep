import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../utils/theme';

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export default function Header({ title, subtitle, showBack = false, right }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        Shadows.xs,
        { backgroundColor: theme.headerBg, borderBottomColor: theme.headerBorder, paddingTop: insets.top + 10 },
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: theme.surfaceAlt }]}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: theme.headerText }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:      { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: 1, zIndex: 10 },
  row:       { flexDirection: 'row', alignItems: 'center' },
  backBtn:   { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  titleWrap: { flex: 1 },
  title:     { ...Typography.h3 },
  sub:       { ...Typography.bodyS, marginTop: 2 },
  right:     { marginLeft: Spacing.sm },
});
