import { Platform } from 'react-native'

export const colors = {
  bg: '#f4f6f9',
  surface: '#ffffff',
  border: '#e2e6ee',
  text: '#1a1f2e',
  muted: '#5c6478',
  primary: '#1a4b8c',
  primaryMuted: '#e8eef7',
  danger: '#b42318',
  success: '#0d7a4f',
  warn: '#b45309',
}

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
}

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
}

/** Obsidian + cyan command theme used by the redesigned screens (login, duty dashboard). */
export const tactical = {
  bg: '#050B14',
  bgRaised: '#0A1628',
  card: '#0B1524',
  cardHi: '#101D31',
  glass: 'rgba(148,163,184,0.06)',
  glassHi: 'rgba(148,163,184,0.10)',
  border: 'rgba(148,163,184,0.14)',
  borderStrong: 'rgba(148,163,184,0.24)',
  text: '#E6EDF7',
  muted: '#8A97AD',
  dim: '#5B6880',
  cyan: '#22D3EE',
  cyanDeep: '#0891B2',
  cyanInk: '#03222C',
  cyanSoft: 'rgba(34,211,238,0.12)',
  cyanLine: 'rgba(34,211,238,0.35)',
  success: '#10B981',
  successSoft: 'rgba(16,185,129,0.14)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.14)',
  danger: '#F43F5E',
  dangerSoft: 'rgba(244,63,94,0.14)',
  violet: '#A78BFA',
  violetSoft: 'rgba(167,139,250,0.14)',
}

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' })
