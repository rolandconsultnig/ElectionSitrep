export type PortalId = 'admin' | 'field' | 'management' | 'igp'

export type NavItem = {
  id: string
  moduleCode: string
  label: string
  icon: string
  path?: string
  subItems?: Omit<NavItem, 'subItems' | 'icon'>[]
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
        ],
      },
      {
        section: 'Command view',
        items: [
          { 
            id: 'command-screens', 
            moduleCode: 'EXT', 
            label: 'Situation Room', 
            icon: '📺', 
            subItems: [
              { id: 'situation-room', moduleCode: 'EXT-1', label: 'Situation Room 1', path: '/situation-room' },
              { id: 'svg-monitor', moduleCode: 'EXT-2', label: 'Situation Room (Large Screen)', path: '/svg-monitor' }
            ]
          },
          { id: 'operations-map', moduleCode: 'M05b', label: 'Operations map', icon: '🗺', path: 'operations-map' },
          { id: 'incident-command', moduleCode: 'M05c', label: 'Incident command', icon: '🚨', path: 'incident-command' },
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
        section: 'Technology & Zero-Trust Integrity (Phase 5)',
        items: [
          { id: 'admin-offline', moduleCode: 'P5-01', label: 'Offline Sync & Conflicts', icon: '📶', path: 'offline-sync' },
          { id: 'admin-telemetry', moduleCode: 'P5-02', label: 'Device & Battery Telemetry', icon: '🔋', path: 'device-telemetry' },
          { id: 'admin-sms', moduleCode: 'P5-03', label: 'SMS & USSD Fallback Gateway', icon: '📲', path: 'sms-gateway' },
          { id: 'admin-ledger', moduleCode: 'P5-04', label: 'Tamper-Proof Audit Ledger', icon: '🛡️', path: 'crypto-ledger' },
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
        section: 'Election Operations (Phase 2)',
        items: [
          { id: 'timeline', moduleCode: 'P2-01', label: 'Operational Timeline', icon: '⏱', path: 'timeline' },
          { id: 'ec8a', moduleCode: 'P2-02', label: 'EC8A Evidence & Tally', icon: '📜', path: 'ec8a' },
          { id: 'materials', moduleCode: 'P2-03', label: 'Sensitive Materials Log', icon: '📦', path: 'materials' },
          { id: 'shifts', moduleCode: 'P2-04', label: 'Relief & Shift Handover', icon: '🔄', path: 'shifts' },
          { id: 'logistics', moduleCode: 'P2-05', label: 'Logistics Requests', icon: '⛽', path: 'logistics' },
        ],
      },
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
          { id: 'safety', moduleCode: 'M15b', label: 'Safety · SOS & check-in', icon: '🆘', path: 'safety' },
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
        section: 'Communications',
        items: [
          { id: 'communications', moduleCode: 'M17b', label: 'HQ Communications', icon: '💬', path: 'communications' },
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
        section: 'Election Operations (Phase 2)',
        items: [
          { id: 'mgmt-timeline', moduleCode: 'P2-01', label: 'Operational Timeline Rollup', icon: '⏱', path: 'timeline' },
          { id: 'mgmt-ec8a', moduleCode: 'P2-02', label: 'EC8A Collation & Evidence', icon: '📜', path: 'ec8a-mirror' },
          { id: 'mgmt-materials', moduleCode: 'P2-03', label: 'Materials Chain-of-Custody', icon: '📦', path: 'materials-chain' },
          { id: 'mgmt-roster', moduleCode: 'P2-04', label: 'Deployment Roster & Gaps', icon: '👥', path: 'roster' },
          { id: 'mgmt-logistics', moduleCode: 'P2-05', label: 'Logistics Tasking Board', icon: '⛽', path: 'logistics-board' },
          { id: 'mgmt-qrf', moduleCode: 'P2-06', label: 'QRF Dispatch Board', icon: '⚡', path: 'qrf-board' },
        ],
      },
      {
        section: 'Command view',
        items: [
          { id: 'dashboard', moduleCode: 'M18', label: 'Command Dashboard', icon: '◈', path: 'dashboard' },
          { id: 'map', moduleCode: 'M19', label: 'Operations Map', icon: '🗺', path: 'map' },
          { 
            id: 'command-screens', 
            moduleCode: 'EXT', 
            label: 'Situation Room', 
            icon: '📺', 
            subItems: [
              { id: 'situation-room', moduleCode: 'EXT-1', label: 'Situation Room 1', path: '/situation-room' },
              { id: 'svg-monitor', moduleCode: 'EXT-2', label: 'Situation Room (Large Screen)', path: '/svg-monitor' }
            ]
          },
          { id: 'sitrep', moduleCode: 'M20', label: 'Live SitRep Feed', icon: '📡', path: 'sitrep' },
        ],
      },
      {
        section: 'Analysis',
        items: [
          { id: 'results', moduleCode: 'M21', label: 'Live Results Tracker', icon: '📊', path: 'results' },
          { id: 'incident-command', moduleCode: 'M22a', label: 'Incident command', icon: '🚨', path: 'incident-command' },
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
        section: 'Communications',
        items: [
          { id: 'communications', moduleCode: 'M25b', label: 'Comms Hub', icon: '💬', path: 'communications' },
        ],
      },
      {
        section: 'Political & Intelligence (Phase 3)',
        items: [
          { id: 'mgmt-party-attr', moduleCode: 'P3-01', label: 'Partisan Incident Attribution', icon: '⚖', path: 'party-attribution' },
          { id: 'mgmt-stakeholders', moduleCode: 'P3-02', label: 'Observer & Media Registry', icon: '🌐', path: 'stakeholders' },
          { id: 'mgmt-scenarios', moduleCode: 'P3-03', label: 'Scenario Playbooks & Doctrines', icon: '🧭', path: 'scenarios' },
          { id: 'mgmt-tribunal', moduleCode: 'P3-04', label: 'Tribunal Evidence Bundler', icon: '📜', path: 'tribunal-evidence' },
        ],
      },
      {
        section: 'Command & Inter-Agency (Phase 4)',
        items: [
          { id: 'mgmt-taskforce', moduleCode: 'P4-01', label: 'Inter-Agency Taskforce Board', icon: '🏛', path: 'taskforce' },
          { id: 'mgmt-directives', moduleCode: 'P4-02', label: 'Command Directives & Signals', icon: '📡', path: 'directives' },
          { id: 'mgmt-geofence', moduleCode: 'P4-03', label: 'Geofenced QRF Interceptor', icon: '🎯', path: 'geofence-qrf' },
          { id: 'mgmt-wallsync', moduleCode: 'P4-04', label: 'Situation Room Wall Sync', icon: '📺', path: 'wall-sync' },
        ],
      },
      {
        section: 'Technology & Field Realities (Phase 5)',
        items: [
          { id: 'mgmt-offline', moduleCode: 'P5-01', label: 'Offline Sync & Outbox', icon: '📶', path: 'offline-sync' },
          { id: 'mgmt-telemetry', moduleCode: 'P5-02', label: 'Device & Battery Fleet Status', icon: '🔋', path: 'device-telemetry' },
          { id: 'mgmt-sms', moduleCode: 'P5-03', label: 'SMS & USSD Fallback Gateway', icon: '📲', path: 'sms-gateway' },
          { id: 'mgmt-ledger', moduleCode: 'P5-04', label: 'Cryptographic Audit Ledger', icon: '🛡️', path: 'crypto-ledger' },
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
    color: '#d9b64a',
    accentClass: 'text-[#d9b64a] border-[#d9b64a]/40 bg-[#d9b64a]/10',
    nav: [
      {
        section: 'Executive view',
        items: [
          { id: 'overview', moduleCode: 'M26', label: 'National Overview', icon: '◈', path: 'overview' },
          { id: 'security', moduleCode: 'M27', label: 'Security Status', icon: '🛡', path: 'security' },
          { 
            id: 'command-screens', 
            moduleCode: 'EXT', 
            label: 'Situation Room', 
            icon: '📺', 
            subItems: [
              { id: 'situation-room', moduleCode: 'EXT-1', label: 'Situation Room 1', path: '/situation-room' },
              { id: 'svg-monitor', moduleCode: 'EXT-2', label: 'Situation Room (Large Screen)', path: '/svg-monitor' }
            ]
          },
          { id: 'incident-command', moduleCode: 'M27a', label: 'Incident command', icon: '🚨', path: 'incident-command' },
          { id: 'results', moduleCode: 'M28', label: 'Election Results', icon: '📊', path: 'results' },
        ],
      },
      {
        section: 'Command & Communications (Phase 4)',
        items: [
          { id: 'igp-taskforce', moduleCode: 'P4-01', label: 'Inter-Agency Joint Command', icon: '🏛', path: 'taskforce' },
          { id: 'igp-directives', moduleCode: 'P4-02', label: 'Flash Signals & Directives', icon: '📡', path: 'directives' },
          { id: 'igp-geofence', moduleCode: 'P4-03', label: 'Geofenced Tactical Triangulation', icon: '🎯', path: 'geofence-qrf' },
          { id: 'igp-wallsync', moduleCode: 'P4-04', label: 'Operations Video Wall Sync', icon: '📺', path: 'wall-sync' },
        ],
      },
      {
        section: 'Political & Situational Awareness (Phase 3)',
        items: [
          { id: 'igp-party-attr', moduleCode: 'P3-01', label: 'Partisan Threat Matrix', icon: '⚖', path: 'party-attribution' },
          { id: 'igp-stakeholders', moduleCode: 'P3-02', label: 'Observer & Mission Registry', icon: '🌐', path: 'stakeholders' },
          { id: 'igp-scenarios', moduleCode: 'P3-03', label: 'Post-Election Contingencies', icon: '🧭', path: 'scenarios' },
          { id: 'igp-tribunal', moduleCode: 'P3-04', label: 'Tribunal Evidence Dossiers', icon: '📜', path: 'tribunal-evidence' },
        ],
      },
      {
        section: 'Technology & Zero-Trust Integrity (Phase 5)',
        items: [
          { id: 'igp-offline', moduleCode: 'P5-01', label: 'Resilient Offline Sync', icon: '📶', path: 'offline-sync' },
          { id: 'igp-telemetry', moduleCode: 'P5-02', label: 'Device & Battery Health', icon: '🔋', path: 'device-telemetry' },
          { id: 'igp-sms', moduleCode: 'P5-03', label: 'SMS / USSD Ingestion Gateway', icon: '📲', path: 'sms-gateway' },
          { id: 'igp-ledger', moduleCode: 'P5-04', label: 'Zero-Trust Blockchain Ledger', icon: '🛡️', path: 'crypto-ledger' },
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
