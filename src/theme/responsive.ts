import { Grid } from 'antd';
import { breakpointTokens, spacingTokens } from './tokens';

export const BREAKPOINTS = breakpointTokens;

export const useBreakpoint = () => Grid.useBreakpoint();

export const responsiveGutter = {
  xs: spacingTokens.xs,
  sm: spacingTokens.sm,
  md: spacingTokens.md,
  lg: spacingTokens.lg,
  xl: spacingTokens.xl,
};

export const layoutMaxWidth = 1440;
