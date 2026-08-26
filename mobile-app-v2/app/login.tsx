import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { loginEmployee, clearStoredCompany } from '../utils/api';
import { registerForPushNotifications } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius } from '../utils/theme';

const LOGO = require('../assets/images/AssetPro.jpg');

export default function LoginScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();
  const { companyId, companyName } = useLocalSearchParams<{ companyId: string; companyName: string }>();

  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [keepSigned, setKeepSigned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);

  const pwdRef = useRef<TextInput>(null);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setHasBiometric(compatible && enrolled);
    })();
  }, []);

  const handleLogin = async () => {
    if (!employeeId.trim() || !password) {
      Alert.alert('Required', 'Please enter your employee ID and password.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await loginEmployee(Number(companyId), employeeId.trim(), password);
      setUser(user);
      void registerForPushNotifications();
      // Admins get the web-like multi-company admin experience; everyone else
      // lands on the role-appropriate home.
      router.replace(user?.roleCapabilities?.isHCAdmin ? '/admin-dashboard' : '/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Sign in with biometrics',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        Alert.alert('Biometric Verified', 'Please sign in with your Employee ID and password once to enable biometric sign-in.');
      }
    } catch {
      Alert.alert('Biometric Error', 'Could not authenticate. Please try again.');
    }
  }, []);

  const handleChangeCompany = useCallback(async () => {
    await clearStoredCompany();
    router.replace('/');
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#4B7BE5' }]} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#4B7BE5" />
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
          {/* ── Blue Hero ───────────────────────────────────── */}
          <View style={styles.hero}>
            <View style={styles.topBar}>
              <TouchableOpacity onPress={handleChangeCompany} style={styles.backBtn} activeOpacity={0.7}>
                <MaterialCommunityIcons name="arrow-left" size={20} color="rgba(255,255,255,0.9)" />
                <Text style={styles.backText}>Change Company</Text>
              </TouchableOpacity>
              <View style={styles.companyPill}>
                <MaterialCommunityIcons name="office-building" size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.companyPillText} numberOfLines={1}>{companyName ?? 'Company'}</Text>
              </View>
            </View>

            {/* AssetPro Logo Image */}
            <View style={styles.logoImageWrap}>
              <Image source={LOGO} style={styles.logoImage} resizeMode="cover" />
            </View>

            <Text style={styles.heroTitle}>AssetPro</Text>
            <Text style={styles.heroSub}>Hospital Asset Management</Text>
          </View>

          {/* ── White Form Sheet ────────────────────────────── */}
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <View style={styles.sheetHandle} />

            <Text style={[styles.formTitle, { color: theme.textPrimary }]}>Welcome back</Text>
            <Text style={[styles.formSub, { color: theme.textSecondary }]}>
              Sign in with your employee credentials
            </Text>

            {/* Employee ID */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Employee ID</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="account-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.inputText }]}
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="Enter your ID"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            {/* Password */}
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
              <TouchableOpacity hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <Text style={[styles.forgotText, { color: theme.primary }]}>Forgot?</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputWrap, { backgroundColor: theme.surface, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={pwdRef}
                style={[styles.input, { color: theme.inputText }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••••"
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry={!showPwd}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPwd(!showPwd)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <MaterialCommunityIcons
                  name={showPwd ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Keep signed in */}
            <TouchableOpacity onPress={() => setKeepSigned(!keepSigned)} style={styles.checkRow} activeOpacity={0.7}>
              <View style={[styles.checkbox, {
                borderColor: keepSigned ? theme.primary : theme.inputBorder,
                backgroundColor: keepSigned ? theme.primary : 'transparent',
              }]}>
                {keepSigned && <MaterialCommunityIcons name="check" size={13} color="#fff" />}
              </View>
              <Text style={[styles.checkText, { color: theme.textSecondary }]}>Keep me signed in</Text>
            </TouchableOpacity>

            {/* Sign In button */}
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? theme.textMuted : theme.primary }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.btnInner}>
                  <Text style={styles.btnText}>Sign In</Text>
                  <MaterialCommunityIcons name="login" size={18} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            {/* Biometric */}
            {hasBiometric && (
              <>
                <View style={styles.divider}>
                  <View style={[styles.divLine, { backgroundColor: theme.border }]} />
                  <Text style={[styles.divText, { color: theme.textMuted }]}>Or use biometric</Text>
                  <View style={[styles.divLine, { backgroundColor: theme.border }]} />
                </View>
                <TouchableOpacity
                  style={[styles.biometricBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={handleBiometric}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="fingerprint" size={22} color={theme.textSecondary} />
                  <Text style={[styles.biometricText, { color: theme.textSecondary }]}>Biometric Sign In</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={[styles.footerHelp, { color: theme.textSecondary }]}>Need help? </Text>
              <Text style={[styles.footerCopy, { color: theme.textMuted }]}>
                © {new Date().getFullYear()} Catalyst Service Solutions Partners Pvt. Ltd. All rights reserved.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  // Blue hero section
  hero: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    alignItems: 'center',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  companyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)' },
  companyPillText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.9)', maxWidth: 140 },

  logoImageWrap: {
    width: 64, height: 64, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#fff', marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  logoImage: { width: '100%', height: '100%' },

  logoMark: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  heroTitle: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 5 },

  // White form sheet
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    minHeight: 520,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center', marginBottom: 28,
  },
  formTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6 },
  formSub: { fontSize: 14, marginBottom: 28 },

  label: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  forgotText: { fontSize: 13, fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, height: 54 },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, fontSize: 15 },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.lg },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 14 },

  btn: { height: 54, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md },
  divLine: { flex: 1, height: 1 },
  divText: { fontSize: 12 },
  biometricBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, borderRadius: Radius.lg, borderWidth: 1.5 },
  biometricText: { fontSize: 15, fontWeight: '600' },

  footer: { alignItems: 'center', gap: 5, paddingTop: Spacing.xl, marginTop: Spacing.md },
  footerHelp: { fontSize: 13, textAlign: 'center' },
  footerCopy: { fontSize: 11, textAlign: 'center' },
});
