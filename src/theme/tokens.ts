import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

export type ColorTokenSet = {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  bgBase: string;
  bgElevated: string;
  bgSpotlight: string;
  textBase: string;
  textMuted: string;
  textOnPrimary: string;
  borderSubtle: string;
};

export type TypographyTokenSet = {
  fontFamily: string;
  fontFamilyMono: string;
  fontSize: number;
  lineHeight: number;
  headings: {
    h1: number;
    h2: number;
    h3: number;
    h4: number;
  };
};

export type SpacingScale = {
  xxs: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type ShadowTokenSet = {
  soft: string;
  medium: string;
  strong: string;
};

export type RadiusTokenSet = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
};

export type BreakpointTokenSet = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type MotionTokenSet = {
  durationFast: number;
  durationBase: number;
  durationSlow: number;
  easingStandard: string;
  easingEmphasized: string;
};

export type AgentPaletteToken = {
  id: string;
  name: string;
  color: string;
  background: string;
  contrastText: string;
  badge: string;
};

export type JungleThemeTokens = {
  colors: ColorTokenSet;
  typography: TypographyTokenSet;
  spacing: SpacingScale;
  radius: RadiusTokenSet;
  shadows: ShadowTokenSet;
  motion: MotionTokenSet;
  breakpoints: BreakpointTokenSet;
  agents: AgentPaletteToken[];
};

export const colorTokens: ColorTokenSet = {
  primary: '#6E6BFF',
  primaryHover: '#7F7CFF',
  primaryActive: '#5753D9',
  success: '#6DD3A4',
  warning: '#FFB74D',
  danger: '#FF6B6B',
  info: '#3DB5FF',
  bgBase: '#0B1017',
  bgElevated: '#111927',
  bgSpotlight: '#1B2535',
  textBase: '#F5F7FA',
  textMuted: '#A0AEC0',
  textOnPrimary: '#F7FAFF',
  borderSubtle: 'rgba(255, 255, 255, 0.12)',
};

export const typographyTokens: TypographyTokenSet = {
  fontFamily: "'Inter', 'Segoe UI', sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 14,
  lineHeight: 1.6,
  headings: {
    h1: 36,
    h2: 28,
    h3: 22,
    h4: 18,
  },
};

export const spacingTokens: SpacingScale = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radiusTokens: RadiusTokenSet = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const shadowTokens: ShadowTokenSet = {
  soft: '0 12px 32px rgba(5, 12, 23, 0.35)',
  medium: '0 18px 45px rgba(5, 12, 23, 0.45)',
  strong: '0 28px 64px rgba(5, 12, 23, 0.6)',
};

export const motionTokens: MotionTokenSet = {
  durationFast: 120,
  durationBase: 200,
  durationSlow: 320,
  easingStandard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  easingEmphasized: 'cubic-bezier(0.24, 0.82, 0.25, 1)',
};

export const breakpointTokens: BreakpointTokenSet = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 1024,
  xl: 1280,
  xxl: 1600,
};

export const agentPaletteTokens: AgentPaletteToken[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    color: '#73E0FF',
    background: '#112736',
    contrastText: '#E8FAFF',
    badge: '#1D4B5F',
  },
  {
    id: 'ember',
    name: 'Ember',
    color: '#FF8F6B',
    background: '#2B1A14',
    contrastText: '#FFECE6',
    badge: '#632A1B',
  },
  {
    id: 'pulse',
    name: 'Pulse',
    color: '#BD91FF',
    background: '#20142F',
    contrastText: '#F5EDFF',
    badge: '#4E2E6E',
  },
  {
    id: 'sol',
    name: 'Sol',
    color: '#FFD66B',
    background: '#2A2312',
    contrastText: '#FFF7E6',
    badge: '#5F4A16',
  },
  {
    id: 'echo',
    name: 'Echo',
    color: '#4DDDBB',
    background: '#142924',
    contrastText: '#E7FCF6',
    badge: '#1F5C4F',
  },
  {
    id: 'quartz',
    name: 'Quartz',
    color: '#7AB3FF',
    background: '#112032',
    contrastText: '#E6F1FF',
    badge: '#1F4066',
  },
  {
    id: 'nova',
    name: 'Nova',
    color: '#FF9CF9',
    background: '#331337',
    contrastText: '#FFE6FE',
    badge: '#5A1E63',
  },
  {
    id: 'terra',
    name: 'Terra',
    color: '#8AD27A',
    background: '#152918',
    contrastText: '#E9F9E7',
    badge: '#295E2F',
  },
];

export const jungleThemeTokens: JungleThemeTokens = {
  colors: colorTokens,
  typography: typographyTokens,
  spacing: spacingTokens,
  radius: radiusTokens,
  shadows: shadowTokens,
  motion: motionTokens,
  breakpoints: breakpointTokens,
  agents: agentPaletteTokens,
};

export const jungleAntdTheme: ThemeConfig = {
  algorithm: [antdTheme.darkAlgorithm],
  token: {
    colorPrimary: colorTokens.primary,
    colorBgBase: colorTokens.bgBase,
    colorBgContainer: colorTokens.bgElevated,
    colorTextBase: colorTokens.textBase,
    colorText: colorTokens.textBase,
    colorTextSecondary: colorTokens.textMuted,
    colorBorder: colorTokens.borderSubtle,
    colorSuccess: colorTokens.success,
    colorWarning: colorTokens.warning,
    colorError: colorTokens.danger,
    colorInfo: colorTokens.info,
    borderRadius: radiusTokens.md,
    fontFamily: typographyTokens.fontFamily,
    fontSize: typographyTokens.fontSize,
    motionUnit: motionTokens.durationBase / 1000,
  },
  components: {
    Layout: {
      headerBg: colorTokens.bgElevated,
      siderBg: colorTokens.bgElevated,
      bodyBg: colorTokens.bgBase,
      lightSiderBg: colorTokens.bgSpotlight,
    },
    Button: {
      controlHeight: 36,
      borderRadius: radiusTokens.pill,
      boxShadow: shadowTokens.soft,
    },
    Badge: {
      textColor: colorTokens.textOnPrimary,
    },
  },
};

export type { ThemeConfig };
