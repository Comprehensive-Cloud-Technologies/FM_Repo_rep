import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useColorScheme, Platform } from 'react-native';

// ─── Fonts ───────────────────────────────────────────────────────────────────
// The "instrument-panel" signature comes from a monospace face on ALL-CAPS
// labels/metadata. We use the platform system monospace to avoid bundling font
// files; swap these for loaded Google fonts (JetBrains Mono / Inter) later.
export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};

// ─── Palette ─────────────────────────────────────────────────────────────────
// Two design languages, one per mode:
//   LIGHT → "Precision Engineering Interface" — crisp white, signal-blue accents
//   DARK  → "OLED Engineering Edition"        — true black, matrix-green accents
export const Colors = {
  // Brand — signal blue (light-mode primary / accent)
  primary:        '#0051D5',
  primaryLight:   '#316BF3',
  primaryDark:    '#003EA8',
  primaryBg:      '#E6EDFD',
  secondary:      '#131B2E',
  secondaryBg:    '#E8EAF0',

  // Semantic — functional status colours
  success:        '#0F9E5A',
  successBg:      '#E7F6EF',
  warning:        '#C2680C',
  warningBg:      '#F7ECDD',
  danger:         '#BA1A1A',
  dangerBg:       '#FBE9E7',
  info:           '#0051D5',
  infoBg:         '#E6EDFD',

  // Neutral — Precision Engineering surface ramp
  gray50:         '#F7F9FB',
  gray100:        '#F2F4F6',
  gray200:        '#E2E5E9',
  gray300:        '#C6C6CD',
  gray400:        '#76777D',
  gray500:        '#5D5E64',
  gray600:        '#45464D',
  gray700:        '#2D3133',
  gray800:        '#22262B',
  gray900:        '#191C1E',

  white:          '#FFFFFF',
  black:          '#000000',
};

export const LightTheme = {
  background:       Colors.gray50,
  surface:          Colors.white,
  surfaceAlt:       Colors.gray100,
  surfaceElevated:  Colors.white,
  border:           Colors.gray200,
  borderLight:      '#ECEEF0',

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
  tabBarBorder:     Colors.gray200,
  tabBarActive:     Colors.primary,
  tabBarInactive:   Colors.gray400,

  headerBg:         Colors.gray50,
  headerBorder:     Colors.gray200,
  headerText:       Colors.gray900,

  inputBg:          Colors.white,
  inputBorder:      Colors.gray300,
  inputText:        Colors.gray900,
  inputPlaceholder: Colors.gray400,

  // Deep navy hero surface (authority)
  heroBg:           Colors.secondary,
  heroText:         Colors.white,

  cardShadow:       'rgba(15,23,42,0.05)',
  overlay:          'rgba(15,23,42,0.5)',
  scrim:            'rgba(15,23,42,0.04)',
  statusBar:        'dark' as 'dark' | 'light',
};

export const DarkTheme: typeof LightTheme = {
  background:       '#000000',
  surface:          '#0F0F0F',
  surfaceAlt:       '#1A1A1A',
  surfaceElevated:  '#1A1A1A',
  border:           '#262626',
  borderLight:      '#1A1A1A',

  textPrimary:      '#E2E2E2',
  textSecondary:    '#9BA39B',
  textMuted:        '#6B726B',
  textInverse:      '#04210B',

  primary:          '#00FF41',
  primaryLight:     '#72FF70',
  primaryDark:      '#00E639',
  primaryBg:        '#0E2A16',
  secondary:        '#C9C6C5',
  secondaryBg:      '#2A2A2A',

  success:          '#00FF41',
  successBg:        '#0E2A16',
  warning:          '#FFB454',
  warningBg:        '#2E1E06',
  danger:           '#FF5449',
  dangerBg:         '#2A0E0C',
  info:             '#4DA3FF',
  infoBg:           '#0C1E2E',

  tabBarBg:         '#0A0A0A',
  tabBarBorder:     '#1F1F1F',
  tabBarActive:     '#00FF41',
  tabBarInactive:   '#6B726B',

  headerBg:         '#0A0A0A',
  headerBorder:     '#1F1F1F',
  headerText:       '#E2E2E2',

  inputBg:          '#000000',
  inputBorder:      '#262626',
  inputText:        '#E2E2E2',
  inputPlaceholder: '#6B726B',

  heroBg:           '#0E2A16',
  heroText:         '#00FF41',

  cardShadow:       'rgba(0,0,0,0.6)',
  overlay:          'rgba(0,0,0,0.75)',
  scrim:            'rgba(255,255,255,0.03)',
  statusBar:        'light' as 'dark' | 'light',
};

export type AppTheme = typeof LightTheme;

// ─── Typography ───────────────────────────────────────────────────────────────
export const Typography = {
  display: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40, letterSpacing: -0.6 },
  h1:    { fontSize: 28, fontWeight: '700' as const, lineHeight: 36, letterSpacing: -0.5 },
  h2:    { fontSize: 24, fontWeight: '700' as const, lineHeight: 32, letterSpacing: -0.4 },
  h3:    { fontSize: 20, fontWeight: '600' as const, lineHeight: 28, letterSpacing: -0.2 },
  h4:    { fontSize: 16, fontWeight: '600' as const, lineHeight: 24, letterSpacing: -0.1 },
  body:  { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyS: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '500' as const, lineHeight: 16 },
  // Instrument-panel labels — mono, uppercase, tracked
  overline:  { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' as const },
  labelCaps: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' as const },
  // Big metric numbers
  metricNum: { fontSize: 28, fontWeight: '800' as const, lineHeight: 32, letterSpacing: -0.5 },
};

// ─── Spacing & Radius ────────────────────────────────────────────────────────
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const Radius  = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999 };

// ─── Elevation ───────────────────────────────────────────────────────────────
// This design language is deliberately FLAT — depth comes from 1px borders and
// tonal layers, not drop shadows (see DESIGN spec). Cards read as crisp bordered
// surfaces on both the light canvas and the OLED-black dark canvas. These presets
// are intentionally near-zero so nothing "floats"; reserve `md`/`lg` for genuinely
// floating chrome (tab bar, modals, popovers).
export const Shadows = {
  xs: Platform.select({
    ios: {},
    default: { elevation: 0 },
  }) as object,
  sm: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
    default: { elevation: 0 },
  }) as object,
  md: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
    default: { elevation: 2 },
  }) as object,
  lg: Platform.select({
    ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 24 },
    default: { elevation: 6 },
  }) as object,
  brand: Platform.select({
    ios: {},
    default: { elevation: 0 },
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
