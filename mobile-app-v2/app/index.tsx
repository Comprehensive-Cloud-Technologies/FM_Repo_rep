import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Dimensions, Image, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { verifyCompanyCode, getStoredUser, getStoredCompany } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme, Typography, Spacing, Radius, Shadows } from '../utils/theme';

const ASSETPRO_LOGO = require('../assets/images/AssetPro.jpg');
const CATALYST_LOGO = require('../assets/images/catalyst-logo.png');

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_MAX = Math.min(SCREEN_W - Spacing.xl * 2, 440);

export default function CompanyCodeScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();
  const [code, setCode]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Auto-redirect if already authenticated or company stored
  useEffect(() => {
    (async () => {
      const user    = await getStoredUser();
      const company = await getStoredCompany();
      if (user && company) {
        setUser(user);
        // Admins resume into the multi-company admin dashboard, not the
        // engineer/doctor home.
        router.replace(user?.roleCapabilities?.isHCAdmin ? '/admin-dashboard' : '/(tabs)/home');
      } else if (company) {
        router.replace({ pathname: '/login', params: { companyId: String(company.companyId), companyName: company.companyName } });
      } else {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setVerifying(true);
    try {
      const company = await verifyCompanyCode(trimmed);
      router.replace({ pathname: '/login', params: { companyId: String(company.companyId), companyName: company.companyName } });
    } catch (err: any) {
      Alert.alert('Invalid Code', err.message ?? 'Please check the company code and try again.');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadWrap, { backgroundColor: theme.primary }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Asset Pro Logo & App Name */}
          <View style={styles.header}>
            <View style={styles.appLogoWrap}>
              <Image
                source={ASSETPRO_LOGO}
                style={styles.appLogo}
                resizeMode="cover"
                accessibilityLabel="Asset Pro logo"
              />
            </View>
            <Text style={[styles.appName, { color: theme.textPrimary }]}>Asset Pro</Text>
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>Hospital Asset Management</Text>
          </View>

          {/* Card */}
          <View style={[styles.card, Shadows.lg, { backgroundColor: theme.surface, width: CARD_MAX }]}>
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Enter Company Code</Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
              Contact your administrator for your company's access code.
            </Text>

            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="office-building-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.inputText }]}
                value={code}
                onChangeText={setCode}
                placeholder="e.g. ACME2024"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleVerify}
              />
              {code.length > 0 && (
                <TouchableOpacity onPress={() => setCode('')} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                  <MaterialCommunityIcons name="close-circle" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: verifying || !code.trim() ? theme.textMuted : theme.primary }]}
              onPress={handleVerify}
              disabled={verifying || !code.trim()}
              activeOpacity={0.85}
            >
              {verifying
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Continue</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Catalyst branding - small, below card */}
          <View style={styles.catalystBrand}>
            <Image
              source={CATALYST_LOGO}
              style={styles.catalystLogo}
              resizeMode="contain"
              accessibilityLabel="Catalyst Solutions"
            />
            <Text style={[styles.footer, { color: theme.textMuted }]}>
              Powered by Catalyst Solutions
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1 },
  flex:      { flex: 1 },
  loadWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:    { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, paddingBottom: Spacing.xxl },
  header:    { alignItems: 'center', marginBottom: Spacing.xxl },
  // AssetPro logo
  appLogoWrap: { width: 80, height: 80, borderRadius: 20, overflow: 'hidden', marginBottom: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 },
  appLogo:   { width: '100%', height: '100%' },
  // Legacy (unused) – kept for reference
  logo:      { width: 160, height: 80, marginBottom: Spacing.lg },
  appName:   { ...Typography.h1, marginBottom: 4, textAlign: 'center' },
  tagline:   { ...Typography.body, textAlign: 'center' },
  card:      { alignSelf: 'center', borderRadius: Radius.xxl, padding: Spacing.xl, marginBottom: Spacing.lg },
  cardTitle: { ...Typography.h3, marginBottom: Spacing.sm },
  cardSub:   { ...Typography.body, marginBottom: Spacing.xl },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, height: 54 },
  inputIcon: { marginRight: Spacing.sm },
  input:     { flex: 1, ...Typography.body, letterSpacing: 2 },
  btn:       { height: 54, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  btnText:   { ...Typography.h4, color: '#fff' },
  // Catalyst brand below card
  catalystBrand: { alignItems: 'center', gap: Spacing.xs },
  catalystLogo:  { width: 90, height: 36, marginBottom: 2 },
  footer:    { ...Typography.micro, textAlign: 'center' },
});
