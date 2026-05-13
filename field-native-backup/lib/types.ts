export type PortalId = 'admin' | 'field' | 'management' | 'igp'

export type UserPayload = {
  id: string
  username: string
  portalId: PortalId
  onboardingComplete: boolean
  passwordMustChange: boolean
  profile: null | {
    name: string | null
    serviceNumber: string | null
    phone: string | null
    pictureDataUrl: string | null
    livenessVerified: boolean
    livenessCheckedAt: string | null
  }
}

export type FieldContext = {
  officer: {
    username: string
    displayName: string
    serviceNumber: string | null
  }
  assignment: null | {
    pollingUnit: { id: string; code: string; name: string; lat: number | null; lng: number | null }
    ward: { id: string; code: string; name: string }
    lga: { id: string; code: string; name: string }
    state: { id: string; code: string; name: string }
  }
  geography: {
    statesAndFct: number
    lgas: number
    wards: number
    pollingUnits: number
  }
  activeElections: Array<{
    slug: string
    name: string
    electionDate: string | null
    status: string
  }>
  nationalPulse: {
    labels: string[]
    submissions: number[]
    incidents: number[]
  }
}

export type CandidateParty = {
  id: string
  inecRegisterCode: string
  name: string
  abbreviation: string
}
