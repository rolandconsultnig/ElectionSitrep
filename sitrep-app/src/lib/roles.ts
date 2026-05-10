/** §03 — 12 roles across 4 portal tiers (spec reference). */
export type SpecRole =
  | 'system_administrator'
  | 'npf_election_data_officer'
  | 'npf_field_officer_pu'
  | 'ward_commander'
  | 'dpo'
  | 'area_commander'
  | 'commissioner_of_police'
  | 'dig'
  | 'dig_operations'
  | 'inspector_general'
  | 'npf_intel_officer'
  | 'npf_legal_officer'

export const SPEC_ROLES: {
  id: SpecRole
  title: string
  portal: string
  jurisdiction: string
}[] = [
  {
    id: 'system_administrator',
    title: 'System Administrator',
    portal: 'Admin (01)',
    jurisdiction: 'Infrastructure only — dual-key auth',
  },
  {
    id: 'npf_election_data_officer',
    title: 'NPF Election Data Officer',
    portal: 'Admin (01)',
    jurisdiction: 'Election config, PU register, parties & candidates',
  },
  {
    id: 'npf_field_officer_pu',
    title: 'NPF Field Officer (PU)',
    portal: 'Field (02)',
    jurisdiction: 'One assigned PU — SitRep, tally, incidents',
  },
  {
    id: 'ward_commander',
    title: 'Ward-Level NPF Commander',
    portal: 'Field (02)',
    jurisdiction: 'Ward aggregation — no other ward access',
  },
  {
    id: 'dpo',
    title: 'Divisional Police Officer (DPO)',
    portal: 'Field (02)',
    jurisdiction: 'LGA — escalation & incidents',
  },
  {
    id: 'area_commander',
    title: 'Area Commander',
    portal: 'Management (03)',
    jurisdiction: 'Multiple LGAs — area intelligence & orders',
  },
  {
    id: 'commissioner_of_police',
    title: 'Commissioner of Police (CP)',
    portal: 'Management (03)',
    jurisdiction: 'State-level intelligence & orders',
  },
  {
    id: 'dig',
    title: 'Deputy Inspector General (DIG)',
    portal: 'Management (03)',
    jurisdiction: 'Zonal intelligence — multi-state',
  },
  {
    id: 'dig_operations',
    title: 'DIG Operations (Force HQ)',
    portal: 'IGP (04)',
    jurisdiction: 'National operational oversight — read-only dashboard',
  },
  {
    id: 'inspector_general',
    title: 'Inspector General of Police',
    portal: 'IGP (04)',
    jurisdiction: 'National executive intelligence — highest tier',
  },
  {
    id: 'npf_intel_officer',
    title: 'NPF SitRep / Intel Officer',
    portal: 'Field (02)',
    jurisdiction: 'Intel & SitReps only — no vote data',
  },
  {
    id: 'npf_legal_officer',
    title: 'NPF Legal / Evidence Officer',
    portal: 'Management (03)',
    jurisdiction: 'Audit & tribunal evidence packages — read-focused',
  },
]
