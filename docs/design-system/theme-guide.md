# JungleMonk Design System · Foundation Guide

This document captures the foundational decisions introduced while migrating the UI engine to [Ant Design 5](https://ant.design/components/overview/). It acts as the single source of truth for base tokens, theming decisions, responsive behaviour, motion helpers and accessibility support.

## Theme Provider & Resets

The application now boots with the Ant Design `<ConfigProvider>` through `ThemeProvider` (`src/theme/ThemeProvider.tsx`). The provider centralises theme overrides, default component sizes and accessibility affordances. Global reset styles are composed from `antd/dist/reset.css` plus `src/theme/global.css`, which exposes CSS variables mirroring the TypeScript token definitions so legacy CSS can progressively opt in to the new system.

```tsx
// src/main.tsx
import 'antd/dist/reset.css';
import './theme/global.css';
import { ThemeProvider } from './theme';
```

## Core Token Catalogue

| Category | Token | Value |
| --- | --- | --- |
| Colors | `colorPrimary` | `#6E6BFF` |
|  | `bgBase` | `#0B1017` |
|  | `bgElevated` | `#111927` |
|  | `textBase` | `#F5F7FA` |
|  | `textMuted` | `#A0AEC0` |
| Typography | `fontFamily` | `"Inter", "Segoe UI", sans-serif` |
|  | `fontSize` | `14px` |
| Spacing | `space` scale | `4 / 8 / 12 / 16 / 24 / 32 / 48` px |
| Radii | `radius` scale | `6 / 10 / 16 / 24 / pill` px |
| Shadows | `shadowSoft` | `0 12px 32px rgba(5,12,23,0.35)` |
| Motion | `durationBase` | `200ms` |

> The canonical definitions live in `src/theme/tokens.ts` and are exported for both JS/TS consumption and CSS usage (`src/theme/global.css`).

### Agent Palette

Eight high-contrast accent pairs are reserved for agent avatars, chips and charts.

| Agent | Hex | Background | Badge |
| --- | --- | --- | --- |
| Aurora | `#73E0FF` | `#112736` | `#1D4B5F` |
| Ember | `#FF8F6B` | `#2B1A14` | `#632A1B` |
| Pulse | `#BD91FF` | `#20142F` | `#4E2E6E` |
| Sol | `#FFD66B` | `#2A2312` | `#5F4A16` |
| Echo | `#4DDDBB` | `#142924` | `#1F5C4F` |
| Quartz | `#7AB3FF` | `#112032` | `#1F4066` |
| Nova | `#FF9CF9` | `#331337` | `#5A1E63` |
| Terra | `#8AD27A` | `#152918` | `#295E2F` |

Each entry ships with contrast-friendly foreground text (`contrastText`) for badges and tags.

### Dark Theme Overrides

The active Ant Design algorithm uses `theme.darkAlgorithm` with custom tokens:

- `colorPrimary`: `#6E6BFF`
- `colorBgBase`: `#0B1017`
- `colorBgContainer`: `#111927`
- `colorTextBase`: `#F5F7FA`
- `colorBorder`: `rgba(255, 255, 255, 0.12)`

Component-level tweaks ensure Layout, Button and Badge align with JungleMonk’s surfaces and rounded geometry. See `jungleAntdTheme` in `tokens.ts` for full configuration.

## Responsive Grid & Breakpoints

Breakpoints follow a mobile-first scale:

| Token | Width |
| --- | --- |
| `xs` | `0px` |
| `sm` | `576px` |
| `md` | `768px` |
| `lg` | `1024px` |
| `xl` | `1280px` |
| `xxl` | `1600px` |

Helpers live in `src/theme/responsive.ts` and mirror Ant Design’s `Grid.useBreakpoint()` API while exposing consistent gutters for Flex/Grid layouts.

## Layout Primitives

- `<Layout>` frames the application shell with a sticky header and responsive content padding.
- `<Sider>` automatically collapses to the mobile drawer (`.app-sidebar-mobile`) under `lg` breakpoints while retaining structured content on desktop.
- `<Flex>` is preferred for vertical stacking in chat, repo and canvas workspaces.

Legacy CSS has been updated to rely on the exported CSS variables, allowing existing views to inherit the theme without complete rewrites.

## Motion Helpers

`src/theme/animations.ts` centralises reusable Framer Motion variants:

- `fadeInUp` – list rows and cards.
- `scaleIn` – dialogs and overlays.
- `slideInFromRight` – drawers and side panels.
- `staggerChildren()` – orchestrate sequential appearances.

The easing curves match the motion tokens to keep rhythm consistent across interactions.

## Accessibility Tooling

- ESLint now bundles `eslint-plugin-jsx-a11y` with `npm run lint` enforcing accessibility best practices.
- Utilities under `src/utils/a11y` manage focus restoration, focus traps and ARIA attribute composition for modals, drawers and toggle controls.

### Practical Checklist

1. Wrap new React entry points with `<ThemeProvider>`.
2. Prefer Ant Design Layout/Flex/Grid primitives before rolling custom wrappers.
3. Consume `designTokens` or CSS variables for colors/spacing to stay on the design rails.
4. Apply motion helpers through Framer Motion’s `motion` components.
5. Run `npm run lint` to catch accessibility regressions early.
