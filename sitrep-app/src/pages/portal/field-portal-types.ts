export type FieldPortalContext = {
  officer: { username: string; displayName: string; serviceNumber: string | null }
  assignment: {
    pollingUnit: { id: number; code: string; name: string; lat: number; lng: number }
    ward: { id: number; code: string; name: string }
    lga: { id: number; code: string; name: string }
    state: { id: number; code: string; name: string }
  } | null
  geography: { statesAndFct: number; lgas: number; wards: number; pollingUnits: number }
  activeElections: { slug: string; name: string; electionDate: string | null; status: string }[]
  nationalPulse: { labels: string[]; submissions: number[]; incidents: number[] }
}
