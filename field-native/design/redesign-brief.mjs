/**
 * Field-native Android APK interface redesign, grounded in the real screens:
 * app/login.tsx, app/index.tsx, app/tally/[slug].tsx, app/network-settings.tsx,
 * app/onboarding.tsx + lib/pending-queue.ts kinds (vote_tally | sitrep | incident | violence).
 *
 * Visual direction: align the native app with the web portals' tactical command
 * aesthetic (deep obsidian #050B14/#0A1628, cyan signal #22D3EE, status
 * green/amber/red) instead of the current generic light theme.
 */
export const REDESIGN = {
  theme: {
    bg: '#050B14',
    surface: '#0A1628',
    card: 'rgba(148,163,184,0.06)',
    border: 'rgba(148,163,184,0.14)',
    text: '#E2E8F0',
    muted: '#7C8AA0',
    primary: '#22D3EE',
    primaryDeep: '#0E7490',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#F43F5E',
  },
  screens: [
    { id: 'login', name: 'Sign In', file: 'app/login.tsx' },
    { id: 'duty', name: 'Duty Dashboard', file: 'app/index.tsx' },
    { id: 'tally', name: 'EC8A Vote Tally', file: 'app/tally/[slug].tsx' },
    { id: 'incident', name: 'Incident Report', file: 'new — pending-queue kinds: sitrep/incident/violence' },
    { id: 'comms', name: 'HQ Comms', file: 'socket chat + WebRTC call' },
    { id: 'queue', name: 'Sync Queue', file: 'lib/pending-queue.ts + network-settings' },
  ],
}
