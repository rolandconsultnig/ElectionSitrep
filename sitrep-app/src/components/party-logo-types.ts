export type PartyLogoProps = {
  abbreviation: string
  partyName: string
  /** Optional remote URL from config data */
  logoUrl?: string
  /** Admin-uploaded image (data URL) — highest priority */
  uploadedDataUrl?: string | null
}
