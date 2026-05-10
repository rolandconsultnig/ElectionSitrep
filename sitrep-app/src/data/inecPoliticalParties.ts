/**
 * Legacy static subset for offline tooling. The admin UI loads the full INEC annex from the API
 * (`GET /api/parties`) populated by `database/parties_annex.json` / seed.
 * Source: https://www.inecnigeria.org/list-of-political-parties — reconcile before production.
 */
export type InecPartyRecord = {
  name: string
  abbreviation: string
  /** Demo stable ID aligned to alphabetical order on INEC’s party list */
  inecRegisterCode: string
  /** Optional HTTPS (or same-origin) image URL — overrides `/party-logos/{abbr}.svg` when set */
  logoUrl?: string
}

/** Alphabetical by official party name (INEC list ordering). */
export const INEC_REGISTERED_POLITICAL_PARTIES: InecPartyRecord[] = [
  { name: 'Accord', abbreviation: 'A', inecRegisterCode: 'INEC-P001' },
  { name: 'Action Alliance', abbreviation: 'AA', inecRegisterCode: 'INEC-P002' },
  { name: 'Action Democratic Party', abbreviation: 'ADP', inecRegisterCode: 'INEC-P003' },
  { name: 'Action Peoples Party', abbreviation: 'APP', inecRegisterCode: 'INEC-P004' },
  { name: 'African Action Congress', abbreviation: 'AAC', inecRegisterCode: 'INEC-P005' },
  { name: 'African Democratic Congress', abbreviation: 'ADC', inecRegisterCode: 'INEC-P006' },
  { name: 'All Progressives Congress', abbreviation: 'APC', inecRegisterCode: 'INEC-P007' },
  { name: 'All Progressives Grand Alliance', abbreviation: 'APGA', inecRegisterCode: 'INEC-P008' },
  { name: 'Allied Peoples Movement', abbreviation: 'APM', inecRegisterCode: 'INEC-P009' },
  { name: 'Boot Party', abbreviation: 'BP', inecRegisterCode: 'INEC-P010' },
  { name: 'Democratic Leadership Alliance', abbreviation: 'DLA', inecRegisterCode: 'INEC-P011' },
  { name: 'Labour Party', abbreviation: 'LP', inecRegisterCode: 'INEC-P012' },
  { name: 'National Rescue Movement', abbreviation: 'NRM', inecRegisterCode: 'INEC-P013' },
  { name: 'New Nigeria Peoples Party', abbreviation: 'NNPP', inecRegisterCode: 'INEC-P014' },
  { name: 'Nigeria Democratic Congress', abbreviation: 'NDC', inecRegisterCode: 'INEC-P015' },
  { name: 'Peoples Democratic Party', abbreviation: 'PDP', inecRegisterCode: 'INEC-P016' },
  { name: 'Peoples Redemption Party', abbreviation: 'PRP', inecRegisterCode: 'INEC-P017' },
  { name: 'Social Democratic Party', abbreviation: 'SDP', inecRegisterCode: 'INEC-P018' },
  { name: 'Young Progressives Party', abbreviation: 'YPP', inecRegisterCode: 'INEC-P019' },
  { name: 'Youth Party', abbreviation: 'YP', inecRegisterCode: 'INEC-P020' },
  { name: 'Zenith Labour Party', abbreviation: 'ZLP', inecRegisterCode: 'INEC-P021' },
]
