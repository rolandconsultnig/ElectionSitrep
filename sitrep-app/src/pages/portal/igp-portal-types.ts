export type ExecutiveDashboardSummary = {
  kpis: {
    registeredPus: number
    activeFieldOfficers: number
    pendingApprovals: number
    partiesRegistered: number
  }
  geography: {
    statesAndFct: number
    lgas: number
    wards: number
    pollingUnits: number
  }
  chart: { labels: string[]; submissions: number[]; incidents: number[] }
  readiness: {
    items: { label: string; status: string }[]
    readinessPercent: number
  }
}

/** INEC-declared figures stored in elections.official_totals (migration_028). */
export type OfficialElectionTotals = {
  registeredVoters?: number
  accreditedVoters?: number
  validVotes?: number
  rejectedVotes?: number
  votesCast?: number
  pollingUnits?: number
  lgas?: number
  declaredWinnerParty?: string
  declaredWinnerCandidate?: string
  declaredAt?: string
  returningOfficer?: string
  source?: string
  omittedParties?: Record<string, number>
}

/** INEC-declared per-LGA breakdown (migration_030). */
export type OfficialLgaRow = {
  name: string
  registeredVoters: number | null
  accreditedVoters: number | null
  validVotes: number | null
  rejectedVotes: number | null
  votesCast: number | null
  incidents: string | null
  parties: { abbreviation: string; name: string; votes: number }[]
  /** valid votes not attributable to publicly declared per-LGA party figures */
  otherVotes: number | null
}

export type ElectionResultsPayload = {
  election: {
    slug: string
    name: string
    status: string
    electionDate: string | null
  }
  /** null until migration_028 is applied and official results are loaded */
  official: {
    totals: OfficialElectionTotals | null
    lgas?: OfficialLgaRow[]
    byParty: {
      partyId: string
      abbreviation: string
      name: string
      votes: number
      voteShare: number
    }[]
  } | null
  nationalByParty: {
    partyId: string
    abbreviation: string
    name: string
    votes: number
    voteShare: number
  }[]
  stackedByState: {
    labels: string[]
    parties: { id: string; abbreviation: string; name: string }[]
    matrix: number[][]
  }
  meta: {
    reportingPollingUnits: number
    totalVotes: number
    lastUploadedAt: string | null
  }
}
