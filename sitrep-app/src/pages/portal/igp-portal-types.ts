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

export type ElectionResultsPayload = {
  election: {
    slug: string
    name: string
    status: string
    electionDate: string | null
  }
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
