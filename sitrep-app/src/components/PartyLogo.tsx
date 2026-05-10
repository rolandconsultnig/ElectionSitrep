import { useEffect, useId, useState } from 'react'

/** Fallback gradient marks — used when remote URL and `/public/party-logos/{abbr}.svg` fail to load. */
const BRAND_GRADIENTS: Record<string, [string, string]> = {
  A: ['#6366f1', '#4338ca'],
  AA: ['#06b6d4', '#0891b2'],
  ADP: ['#f59e0b', '#d97706'],
  APP: ['#8b5cf6', '#6d28d9'],
  AAC: ['#ef4444', '#b91c1c'],
  ADC: ['#22c55e', '#15803d'],
  APC: ['#008751', '#004d2f'],
  APGA: ['#ca8a04', '#65a30d'],
  APM: ['#14b8a6', '#0f766e'],
  BP: ['#64748b', '#334155'],
  DLA: ['#a855f7', '#7e22ce'],
  LP: ['#dc2626', '#991b1b'],
  NRM: ['#3b82f6', '#1d4ed8'],
  NNPP: ['#16a34a', '#14532d'],
  NDC: ['#f97316', '#c2410c'],
  PDP: ['#047857', '#064e3b'],
  PRP: ['#b91c1c', '#7f1d1d'],
  SDP: ['#0d9488', '#115e59'],
  YPP: ['#7c3aed', '#5b21b6'],
  YP: ['#ec4899', '#be185d'],
  ZLP: ['#059669', '#064e3b'],
}

function fontSizeForAbbr(abbr: string) {
  const n = abbr.length
  if (n <= 2) return 22
  if (n === 3) return 17
  if (n === 4) return 13
  return 11
}

export type PartyLogoProps = {
  abbreviation: string
  partyName: string
  /** Optional remote URL from config data */
  logoUrl?: string
  /** Admin-uploaded image (data URL) — highest priority */
  uploadedDataUrl?: string | null
}

export function PartyLogo({ abbreviation, partyName, logoUrl, uploadedDataUrl }: PartyLogoProps) {
  const uid = useId().replace(/:/g, '')
  const gid = `pl-${uid}`
  const slug = abbreviation.toLowerCase()
  const defaultSrc = `/party-logos/${slug}.svg`

  const [uploadBroken, setUploadBroken] = useState(false)
  const [remoteFailed, setRemoteFailed] = useState(false)
  const [localFailed, setLocalFailed] = useState(false)

  useEffect(() => {
    setUploadBroken(false)
  }, [uploadedDataUrl])

  useEffect(() => {
    setRemoteFailed(false)
  }, [logoUrl])

  const [c1, c2] = BRAND_GRADIENTS[abbreviation] ?? ['#475569', '#1e293b']
  const fs = fontSizeForAbbr(abbreviation)

  const gradientMark = (
    <svg
      viewBox="0 0 64 64"
      className="size-11 shrink-0 rounded-xl shadow-md ring-1 ring-black/10 dark:ring-white/10"
      role="img"
      aria-label={partyName}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gid})`} />
      <text
        x="32"
        y="40"
        textAnchor="middle"
        fontFamily="system-ui,Segoe UI,sans-serif"
        fontSize={fs}
        fontWeight="700"
        fill="#ffffff"
        style={{ textShadow: '0 1px 2px rgba(0,0,0,.25)' }}
      >
        {abbreviation}
      </text>
    </svg>
  )

  if (uploadedDataUrl && !uploadBroken) {
    return (
      <span className="inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl" title={partyName}>
        <img
          src={uploadedDataUrl}
          alt=""
          className="size-11 object-contain object-center"
          onError={() => setUploadBroken(true)}
        />
      </span>
    )
  }

  if (logoUrl && !remoteFailed) {
    return (
      <span className="inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl" title={partyName}>
        <img
          src={logoUrl}
          alt=""
          className="size-11 object-contain object-center"
          onError={() => setRemoteFailed(true)}
        />
      </span>
    )
  }

  if (!localFailed) {
    return (
      <span className="inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl" title={partyName}>
        <img
          src={defaultSrc}
          alt=""
          className="size-11 object-cover object-center"
          onError={() => setLocalFailed(true)}
        />
      </span>
    )
  }

  return (
    <span className="inline-flex shrink-0" title={partyName}>
      {gradientMark}
    </span>
  )
}
