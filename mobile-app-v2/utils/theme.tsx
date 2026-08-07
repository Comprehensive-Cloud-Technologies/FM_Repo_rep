import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme, Platform } from 'react-native';

// ─── Palette ─────────────────────────────────────────────────────────────────
export const Colors = {
  // Brand — refined indigo
  primary:        '#2347C5',
  primaryLight:   '#4F6FE8',
  primaryDark:    '#1A339A',
  primaryBg:      '#EEF2FE',
  secondary:      '#7C3AED',
  secondaryBg:    '#F5F3FF',

  // Semantic
  success:        '#059669',
  successBg:      '#ECFDF5',
  warning:        '#D97706',
  warningBg:      '#FFFBEB',
  danger:         '#DC2626',
  dangerBg:       '#FEF2F2',
  info:           '#0284C7',
  infoBg:         '#F0F9FF',

  // Neutral — cool slate ramp
  gray50:         '#F6F7FB',
  gray100:        '#EEF1F6',
  gray200:        '#E2E7EF',
  gray300:        '#CBD3E0',
  gray400:        '#94A0B4',
  gray500:        '#64748B',
  gray600:        '#475569',
  gray700:        '#334155',
  gray800:        '#1E293B',
  gray900:        '#0F172A',

  white:          '#FFFFFF',
  black:          '#000000',
};

export const LightTheme = {
  background:       Colors.gray50,
  surface:          Colors.white,
  surfaceAlt:       Colors.gray100,
  surfaceElevated:  Colors.white,
  border:           Colors.gray200,
  borderLight:      Colors.gray100,

  textPrimary:      Colors.gray900,
  textSecondary:    Colors.gray600,
  textMuted:        Colors.gray400,
  textInverse:      Colors.white,

  primary:          Colors.primary,
  primaryLight:     Colors.primaryLight,
  primaryDark:      Colors.primaryDark,
  primaryBg:        Colors.primaryBg,
  secondary:        Colors.secondary,
  secondaryBg:      Colors.secondaryBg,

  success:          Colors.success,
  successBg:        Colors.successBg,
  warning:          Colors.warning,
  warningBg:        Colors.warningBg,
  danger:           Colors.danger,
  dangerBg:         Colors.dangerBg,
  info:             Colors.info,
  infoBg:           Colors.infoBg,

  tabBarBg:         Colors.white,
  tabBarBorder:     Colors.gray100,
  tabBarActive:     Colors.primary,
  tabBarInactive:   Colors.gray400,

  headerBg:         Colors.white,
  headerBorder:     Colors.gray100,
  headerText:       Colors.gray900,

  inputBg:          Colors.gray50,
  inputBorder:      Colors.gray200,
  inputText:        Colors.gray900,
  inputPlaceholder: Colors.gray400,

  // Deep brand surface for hero blocks
  heroBg:           Colors.primary,
  heroText:         Colors.white,

  cardShadow:       'rgba(15,23,42,0.10)',
  overlay:          'rgba(15,23,42,0.55)',
  scrim:            'rgba(15,23,42,0.04)',
  statusBar:        'dark' as 'dark' | 'light',
};

export const DarkTheme: typeof LightTheme = {
  background:       '#0B1120',
  surface:          '#151C2E',
  surfaceAlt:       '#0F1626',
  surfaceElevated:  '#1B2437',
  border:           '#2A3650',
  borderLight:      '#1E2740',

  textPrimary:      '#F1F5F9',
  textSecondary:    '#9BA8BE',
  textMuted:        '#5B6B85',
  textInverse:      '#0B1120',

  primary:          '#5B7BF5',
  primaryLight:     '#7C97F8',
  primaryDark:      '#3B5BDB',
  primaryBg:        '#1B2A52',
  secondary:        '#A78BFA',
  secondaryBg:      '#2A2350',

  success:          '#34D399',
  successBg:        '#0C3B2E',
  warning:          '#FBBF24',
  warningBg:        '#3B2A06',
  danger:           '#F87171',
  dangerBg:         '#3B1214',
  info:             '#38BDF8',
  infoBg:           '#0C2A3B',

  tabBarBg:         '#151C2E',
  tabBarBorder:     '#2A3650',
  tabBarActive:     '#7C97F8',
  tabBarInactive:   '#5B6B85',

  headerBg:         '#151C2E',
  headerBorder:     '#2A3650',
  headerText:       '#F1F5F9',

  inputBg:          '#0F1626',
  inputBorder:      '#2A3650',
  inputText:        '#F1F5F9',
  inputPlaceholder: '#5B6B85',

  heroBg:           '#1B2A52',
  heroText:         '#F1F5F9',

  cardShadow:       'rgba(0,0,0,0.45)',
  overlay:          'rgba(0,0,0,0.7)',
  scrim:            'rgba(255,255,255,0.03)',
  statusBar:        'light' as 'dark' | 'light',
};

export type AppTheme = typeof LightTheme;

// ─── Typography ───────────────────────────────────────────────────────────────
export const Typography = {
  display: { fontSize: 34, fontWeight: '800' as const, lineHeight: 40, letterSpacing: -0.6 },
  h1:    { fontSize: 28, fontWeight: '800' as const, lineHeight: 36, letterSpacing: -0.4 },
  h2:    { fontSize: 22, fontWeight: '700' as const, lineHeight: 30, letterSpacing: -0.3 },
  h3:    { fontSize: 18, fontWeight: '700' as const, lineHeight: 26, letterSpacing: -0.2 },
  h4:    { fontSize: 16, fontWeight: '600' as const, lineHeight: 24, letterSpacing: -0.1 },
  body:  { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyS: { fontSize: 13, fontWeight: '400' as const, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '500' as const, lineHeight: 16 },
  overline: { fontSize: 11, fontWeight: '700' as const, lineHeight: 16, letterSpacing: 1.2 },
};

// ─── Spacing & Radius ────────────────────────────────────────────────────────
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const Radius  = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999 };

// ─── Elevation ───────────────────────────────────────────────────────────────
// Cross-platform shadow presets. Spread onto a style: [styles.card, Shadows.sm]
export const Shadows = {
  xs: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
    default: { elevation: 1 },
  }) as object,
  sm: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
    default: { elevation: 2 },
  }) as object,
  md: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.09, shadowRadius: 16 },
    default: { elevation: 5 },
  }) as object,
  lg: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 28 },
    default: { elevation: 10 },
  }) as object,
  // Colored primary glow for CTAs / hero cards
  brand: Platform.select({
    ios: { shadowColor: '#2347C5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 18 },
    default: { elevation: 6 },
  }) as object,
};

// ─── Context ─────────────────────────────────────────────────────────────────
type Preference = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: AppTheme;
  isDark: boolean;
  preference: Preference;
  setPreference: (p: Preference) => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: LightTheme,
  isDark: false,
  preference: 'system',
  setPreference: () => {},
});

const PREF_KEY = '@fmv2_theme_pref';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<Preference>('system');

  useEffect(() => {
    AsyncStorage.getItem(PREF_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPreference(v);
    });
  }, []);

  const save = (p: Preference) => {
    setPreference(p);
    AsyncStorage.setItem(PREF_KEY, p);
  };

  const isDark = preference === 'system' ? system === 'dark' : preference === 'dark';
  const theme  = isDark ? DarkTheme : LightTheme;

  return (
    <Ctx.Provider value={{ theme, isDark, preference, setPreference: save }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() { return useContext(Ctx); }
