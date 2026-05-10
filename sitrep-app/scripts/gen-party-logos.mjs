import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const dir = path.join(root, 'public', 'party-logos')

/** Matches BRAND_GRADIENTS in PartyLogo.tsx */
const parties = [
  { slug: 'a', abbr: 'A', c1: '#6366f1', c2: '#4338ca' },
  { slug: 'aa', abbr: 'AA', c1: '#06b6d4', c2: '#0891b2' },
  { slug: 'adp', abbr: 'ADP', c1: '#f59e0b', c2: '#d97706' },
  { slug: 'app', abbr: 'APP', c1: '#8b5cf6', c2: '#6d28d9' },
  { slug: 'aac', abbr: 'AAC', c1: '#ef4444', c2: '#b91c1c' },
  { slug: 'adc', abbr: 'ADC', c1: '#22c55e', c2: '#15803d' },
  { slug: 'apc', abbr: 'APC', c1: '#008751', c2: '#004d2f' },
  { slug: 'apga', abbr: 'APGA', c1: '#ca8a04', c2: '#65a30d' },
  { slug: 'apm', abbr: 'APM', c1: '#14b8a6', c2: '#0f766e' },
  { slug: 'bp', abbr: 'BP', c1: '#64748b', c2: '#334155' },
  { slug: 'dla', abbr: 'DLA', c1: '#a855f7', c2: '#7e22ce' },
  { slug: 'lp', abbr: 'LP', c1: '#dc2626', c2: '#991b1b' },
  { slug: 'nrm', abbr: 'NRM', c1: '#3b82f6', c2: '#1d4ed8' },
  { slug: 'nnpp', abbr: 'NNPP', c1: '#16a34a', c2: '#14532d' },
  { slug: 'ndc', abbr: 'NDC', c1: '#f97316', c2: '#c2410c' },
  { slug: 'pdp', abbr: 'PDP', c1: '#047857', c2: '#064e3b' },
  { slug: 'prp', abbr: 'PRP', c1: '#b91c1c', c2: '#7f1d1d' },
  { slug: 'sdp', abbr: 'SDP', c1: '#0d9488', c2: '#115e59' },
  { slug: 'ypp', abbr: 'YPP', c1: '#7c3aed', c2: '#5b21b6' },
  { slug: 'yp', abbr: 'YP', c1: '#ec4899', c2: '#be185d' },
  { slug: 'zlp', abbr: 'ZLP', c1: '#059669', c2: '#064e3b' },
]

function fontSize(abbr) {
  const n = abbr.length
  if (n <= 2) return 22
  if (n === 3) return 17
  if (n === 4) return 13
  return 11
}

function svg(p) {
  const fsz = fontSize(p.abbr)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.c1}"/>
      <stop offset="100%" stop-color="${p.c2}"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <text x="32" y="40" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="${fsz}" font-weight="700" fill="#ffffff" style="text-shadow:0 1px 2px rgba(0,0,0,.25)">${p.abbr}</text>
</svg>`
}

fs.mkdirSync(dir, { recursive: true })
for (const p of parties) {
  fs.writeFileSync(path.join(dir, `${p.slug}.svg`), svg(p).replace(/\n\s+/g, ' ').trim(), 'utf8')
}
console.log(`Wrote ${parties.length} SVGs to ${dir}`)
