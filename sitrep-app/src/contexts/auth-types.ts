import type { PortalId } from '../lib/navigation'

export type OfficerProfile = {
  firstName: string
  lastName: string
  serviceNumber: string
  phone: string
  pictureDataUrl: string
  livenessVerified: boolean
  livenessCheckedAt?: string
}

export type JurisdictionLevel = 'national' | 'state' | 'area'

export type UserJurisdiction = {
  level: JurisdictionLevel
  stateId: number | null
  stateName: string | null
  lgaId: number | null
  lgaName: string | null
}

export type AuthUser = {
  id: string
  username: string
  portalId: PortalId
  onboardingComplete: boolean
  /** True until user sets their own password (demo/batch issuance) */
  passwordMustChange?: boolean
  profile?: OfficerProfile | null
  /** Command scope: national (HQ), a single state, or a single LGA (area command). */
  jurisdiction?: UserJurisdiction
}
