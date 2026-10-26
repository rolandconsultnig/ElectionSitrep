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

/** Obsidian + NPF command theme — deep navy glass, police gold/blue/green accents. */
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
  // NPF tricolour accents (force flag: blue / yellow / green)
  gold: '#F5C518',
  goldDeep: '#C9A227',
  goldInk: '#241A02',
  blue: '#3B82F6',
  blueDeep: '#1D4ED8',
  blueSoft: 'rgba(59,130,246,0.14)',
  blueLine: 'rgba(59,130,246,0.38)',
  green: '#00C46A',
  greenDeep: '#009B55',
  greenSoft: 'rgba(0,196,106,0.14)',
  // Primary accent = police gold (cyan* keys kept for compatibility across screens)
  cyan: '#F5C518',
  cyanDeep: '#C9A227',
  cyanInk: '#241A02',
  cyanSoft: 'rgba(245,197,24,0.13)',
  cyanLine: 'rgba(245,197,24,0.38)',
  success: '#00C46A',
  successSoft: 'rgba(0,196,106,0.14)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.14)',
  danger: '#F43F5E',
  dangerSoft: 'rgba(244,63,94,0.14)',
  violet: '#3B82F6',
  violetSoft: 'rgba(59,130,246,0.14)',
}

export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' })
