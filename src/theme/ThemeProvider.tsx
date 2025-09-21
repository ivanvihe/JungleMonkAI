import React from 'react';
import { App as AntdApp, ConfigProvider, Grid } from 'antd';
import type { ThemeConfig } from 'antd';
import { jungleAntdTheme, jungleThemeTokens, breakpointTokens } from './tokens';

type ThemeProviderProps = {
  children: React.ReactNode;
  themeConfig?: ThemeConfig;
};

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, themeConfig }) => {
  const mergedTheme: ThemeConfig = {
    ...jungleAntdTheme,
    ...themeConfig,
    token: {
      ...jungleAntdTheme.token,
      ...themeConfig?.token,
    },
    components: {
      ...jungleAntdTheme.components,
      ...themeConfig?.components,
    },
  };

  return (
    <ConfigProvider
      theme={mergedTheme}
      componentSize="middle"
      wave={{ disabled: false }}
      form={{ scrollToFirstError: { behavior: 'smooth' } }}
      modal={{ rootClassName: 'jungle-modal-root' }}
    >
      <AntdApp className="jungle-app-shell">{children}</AntdApp>
    </ConfigProvider>
  );
};

export const useResponsive = () => Grid.useBreakpoint();

export const designTokens = jungleThemeTokens;
export const gridBreakpoints = breakpointTokens;

export default ThemeProvider;
