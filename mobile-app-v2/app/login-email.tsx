/**
 * Email login (company code optional).
 *
 * For users assigned to multiple companies (and admins): sign in with just
 * email + password — no company code required. On success, admins land on the
 * multi-company admin dashboard; everyone else on their role home.
 */
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { loginWithEmail } from '../utils/api';
import { registerForPushNotifications } from '../utils/notifications';
import { useAuth } from '../context/AuthContext';
import { useTheme, Spacing, Radius, Typography, Shadows } from '../utils/theme';

const LOGO = require('../assets/images/AssetPro.jpg');

export default function LoginEmailScreen() {
  const { theme } = useTheme();
  const { setUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const pwdRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await loginWithEmail(trimmed, password);
      setUser(user);
      void registerForPushNotifications();
      router.replace(user?.roleCapabilities?.isHCAdmin ? '/admin-dashboard' : '/(tabs)/home');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message ?? 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              <Image source={LOGO} style={styles.logo} resizeMode="cover" accessibilityLabel="Asset Pro logo" />
            </View>
            <Text style={[styles.appName, { color: theme.textPrimary }]}>Sign in</Text>
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>Use your email — no company code needed</Text>
          </View>

          <View style={[styles.card, Shadows.lg, { backgroundColor: theme.surface }]}>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="email-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.inputText }]}
                value={email}
                onChangeText={setEmail}
                placeholder="name@company.com"
                placeholderTextColor={theme.inputPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
              />
            </View>

            <Text style={[styles.label, { color: theme.textSecondary, marginTop: Spacing.md }]}>Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                ref={pwdRef}
                style={[styles.input, { color: theme.inputText }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor={theme.inputPlaceholder}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPwd(v => !v)} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
                <MaterialCommunityIcons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading || !email.trim() || !password ? theme.textMuted : theme.primary }]}
              onPress={handleLogin}
              disabled={loading || !email.trim() || !password}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign in</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.altBtn} onPress={() => router.replace('/')} activeOpacity={0.7}>
            <MaterialCommunityIcons name="office-building-outline" size={18} color={theme.primary} />
            <Text style={[styles.altText, { color: theme.primary }]}>Sign in with a company code instead</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, paddingBottom: Spacing.xxl },
  header: { alignItems: 'center', marginBottom: Spacing.xl },
  logoWrap: { width: 72, height: 72, borderRadius: 18, overflow: 'hidden', marginBottom: Spacing.md, ...Shadows.md },
  logo: { width: '100%', height: '100%' },
  appName: { ...Typography.h1, marginBottom: 4, textAlign: 'center' },
  tagline: { ...Typography.body, textAlign: 'center' },
  card: { alignSelf: 'stretch', maxWidth: 440, width: '100%', borderRadius: Radius.xxl, padding: Spacing.xl },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, height: 52 },
  inputIcon: { marginRight: Spacing.sm },
  input: { flex: 1, ...Typography.body },
  btn: { height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.lg },
  btnText: { ...Typography.h4, color: '#fff' },
  altBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xl, padding: Spacing.sm },
  altText: { fontSize: 14, fontWeight: '600' },
});
