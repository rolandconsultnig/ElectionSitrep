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

export type AuthUser = {
  username: string
  portalId: PortalId
  onboardingComplete: boolean
  /** True until user sets their own password (demo/batch issuance) */
  passwordMustChange?: boolean
  profile?: OfficerProfile | null
}
