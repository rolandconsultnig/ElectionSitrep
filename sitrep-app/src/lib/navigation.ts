export type PortalId = 'admin' | 'field' | 'management' | 'igp'

export type NavItem = {
  id: string
  moduleCode: string
  label: string
  icon: string
  path: string
}

export type NavSection = { section: string; items: NavItem[] }

export type PortalMeta = {
  id: PortalId
  label: string
  shortLabel: string
  color: string
  accentClass: string
  nav: NavSection[]
}

/** M01–M31 module directory aligned with specification §04 */
export const PORTALS: Record<PortalId, PortalMeta> = {
  admin: {
    id: 'admin',
    label: 'Admin Portal',
    shortLabel: 'Portal 01',
    color: '#EF4444',
    accentClass: 'text-red-400 border-red-500/40 bg-red-500/10',
    nav: [
      {
        section: 'Overview',
        items: [{ id: 'dashboard', moduleCode: 'M01', label: 'Admin Dashboard', icon: '◈', path: 'dashboard' }],
      },
      {
        section: 'Election config',
        items: [
          { id: 'elections', moduleCode: 'M02', label: 'Election Setup & Config', icon: '🗳', path: 'elections' },
          { id: 'parties', moduleCode: 'M03', label: 'Political Parties', icon: '⚑', path: 'parties' },
          { id: 'candidates', moduleCode: 'M04', label: 'Candidates', icon: '👤', path: 'candidates' },
          { id: 'geography', moduleCode: 'M05', label: 'LGAs & Polling Units', icon: '📍', path: 'geography' },
          { id: 'operations-map', moduleCode: 'M05b', label: 'Operations map', icon: '🗺', path: 'operations-map' },
        ],
      },
      {
        section: 'Access',
        items: [
          { id: 'users', moduleCode: 'M06', label: 'User Management', icon: '👥', path: 'users' },
          { id: 'roles', moduleCode: 'M07', label: 'Roles & Access Matrix', icon: '🔐', path: 'roles' },
          {
            id: 'credential-batches',
            moduleCode: 'M06b',
            label: 'Credential batches',
            icon: '🔑',
            path: 'credential-batches',
          },
        ],
      },
      {
        section: 'System',
        items: [
          { id: 'audit', moduleCode: 'M08', label: 'Audit Logs', icon: '📋', path: 'audit' },
          { id: 'settings', moduleCode: 'M09', label: 'System Settings', icon: '⚙', path: 'settings' },
        ],
      },
      {
        section: 'Account',
        items: [
          {
            id: 'profile',
            moduleCode: '—',
            label: 'Profile & training',
            icon: '👤',
            path: 'profile',
          },
        ],
      },
    ],
  },
  field: {
    id: 'field',
    label: 'Field Portal',
    shortLabel: 'Portal 02',
    color: '#F59E0B',
    accentClass: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    nav: [
      {
        section: 'Reporting',
        items: [
          { id: 'dashboard', moduleCode: 'M10', label: 'Field Officer Dashboard', icon: '◈', path: 'dashboard' },
          { id: 'sitrep', moduleCode: 'M11', label: 'Submit SitRep', icon: '📝', path: 'sitrep' },
          { id: 'voting', moduleCode: 'M12', label: 'Voting Status & Vote Tally', icon: '✓', path: 'voting' },
          { id: 'turnout', moduleCode: 'M13', label: 'Voter Turnout', icon: '📊', path: 'turnout' },
        ],
      },
      {
        section: 'Incidents',
        items: [
          { id: 'incidents', moduleCode: 'M14', label: 'Report Incident', icon: '⚠', path: 'incidents' },
          { id: 'violence', moduleCode: 'M15', label: 'Violence & Disturbance Log', icon: '🚨', path: 'violence' },
        ],
      },
      {
        section: 'Reference',
        items: [
          { id: 'reference', moduleCode: 'M16', label: 'Parties & Candidates Ref.', icon: '⚑', path: 'reference' },
          { id: 'history', moduleCode: 'M17', label: 'Submission History', icon: '🕐', path: 'history' },
        ],
      },
      {
        section: 'Account',
        items: [
          {
            id: 'profile',
            moduleCode: '—',
            label: 'Profile & training',
            icon: '👤',
            path: 'profile',
          },
        ],
      },
    ],
  },
  management: {
    id: 'management',
    label: 'Management Portal',
    shortLabel: 'Portal 03',
    color: '#3B82F6',
    accentClass: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    nav: [
      {
        section: 'Command view',
        items: [
          { id: 'dashboard', moduleCode: 'M18', label: 'Command Dashboard', icon: '◈', path: 'dashboard' },
          { id: 'map', moduleCode: 'M19', label: 'Operations Map', icon: '🗺', path: 'map' },
          { id: 'sitrep', moduleCode: 'M20', label: 'Live SitRep Feed', icon: '📋', path: 'sitrep' },
        ],
      },
      {
        section: 'Analysis',
        items: [
          { id: 'results', moduleCode: 'M21', label: 'Live Results Tracker', icon: '📊', path: 'results' },
          { id: 'incidents', moduleCode: 'M22', label: 'Incident Tracker', icon: '⚠', path: 'incidents' },
          { id: 'turnout', moduleCode: 'M23', label: 'Turnout Analysis', icon: '📈', path: 'turnout' },
        ],
      },
      {
        section: 'Command',
        items: [
          { id: 'orders', moduleCode: 'M24', label: 'Issue Operational Orders', icon: '📣', path: 'orders' },
          { id: 'units', moduleCode: 'M25', label: 'Field Unit Status', icon: '🏛', path: 'units' },
        ],
      },
      {
        section: 'Account',
        items: [
          {
            id: 'profile',
            moduleCode: '—',
            label: 'Profile & training',
            icon: '👤',
            path: 'profile',
          },
        ],
      },
    ],
  },
  igp: {
    id: 'igp',
    label: 'IGP Portal',
    shortLabel: 'Portal 04',
    color: '#00C896',
    accentClass: 'text-[#00C896] border-[#00C896]/40 bg-[#00C896]/10',
    nav: [
      {
        section: 'Executive view',
        items: [
          { id: 'overview', moduleCode: 'M26', label: 'National Overview', icon: '◈', path: 'overview' },
          { id: 'security', moduleCode: 'M27', label: 'Security Status', icon: '🛡', path: 'security' },
          { id: 'results', moduleCode: 'M28', label: 'Election Results', icon: '📊', path: 'results' },
        ],
      },
      {
        section: 'Intelligence',
        items: [
          { id: 'hotspots', moduleCode: 'M29', label: 'National Hotspot Map', icon: '🔥', path: 'hotspots' },
          { id: 'timeline', moduleCode: 'M30', label: 'Event Timeline', icon: '⏱', path: 'timeline' },
        ],
      },
      {
        section: 'Reports',
        items: [{ id: 'briefing', moduleCode: 'M31', label: 'Executive Briefing', icon: '📄', path: 'briefing' }],
      },
      {
        section: 'Account',
        items: [
          {
            id: 'profile',
            moduleCode: '—',
            label: 'Profile & training',
            icon: '👤',
            path: 'profile',
          },
        ],
      },
    ],
  },
}

export function portalBasePath(id: PortalId): string {
  return `/${id}`
}

export function firstNavPath(id: PortalId): string {
  const first = PORTALS[id].nav[0]?.items[0]
  if (!first) return portalBasePath(id)
  return `${portalBasePath(id)}/${first.path}`
}

/** After login: onboarding first, then portal home. */
export function postLoginPath(user: { onboardingComplete: boolean; portalId: PortalId }): string {
  if (!user.onboardingComplete) return '/onboarding'
  return firstNavPath(user.portalId)
}
