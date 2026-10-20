/**
 * Fetch per-polling-unit 2026 governorship results transcribed from INEC IReV
 * EC8A scans, as published by NigeriaOpenData (nigeriaopendata.com).
 *
 * Each LGA page lists every PU with its INEC code (SS/LL/WW/PPP), party votes,
 * EC8A stat fields (#1 registered … #7 valid), the scan URL, and a ⚠ flag the
 * site sets when party votes don't reconcile with the printed valid total.
 *
 * Output: scripts/data/irev-<slug>.json — one record per PU.
 *   node scripts/fetch-irev-results.mjs                      # fetch all
 *   node scripts/fetch-irev-results.mjs --slug=ekiti-governorship-2026
 *
 * This is a third-party transcription of public IReV scans — unofficial, and
 * ~98% coverage. Downstream loaders must label it accordingly, never as
 * INEC-declared figures.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'data')
const BASE = 'https://www.nigeriaopendata.com/elections/election'
const DELAY_MS = 1500
const PU_MARKER = 'background:var(--surface-3);border-radius:6px;border-left:3px solid'

const ELECTIONS = [
  { slug: 'ekiti-governorship-2026', lgas: 16 },
  { slug: 'osun-governorship-2026', lgas: 30 },
]

const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '').replace(/—|–/g, '').trim()) || null)
const unescape = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

function parseLgaPage(html) {
  // Ward names appear in .geo-name divs; PU cards start with PU_MARKER.
  const lgaM = html.match(/<h4>Wards in ([^<]+)<\/h4>/)
  const lgaName = lgaM ? unescape(lgaM[1].trim()) : null
  const wards = []
  const wardRe = /class="geo-name"[^>]*>([^<]+)<\/div>/g
  let m
  while ((m = wardRe.exec(html))) wards.push({ at: m.index, name: unescape(m[1].trim()) })

  const markers = []
  let idx = 0
  while ((idx = html.indexOf(PU_MARKER, idx)) !== -1) { markers.push(idx); idx += PU_MARKER.length }

  const pus = []
  for (let i = 0; i < markers.length; i++) {
    const end = i + 1 < markers.length ? markers[i + 1] : html.length
    const block = html.slice(markers[i], end)
    const codeM = block.match(/\d{2}\/\d{2}\/\d{2}\/\d{3}/)
    const nameM = block.match(/font-weight:700;font-size:0\.78rem;line-height:1\.2;color:var\(--text-primary\);">\s*([^<]+)/)
    if (!codeM || !nameM) continue // non-PU card sharing the style
    const ec8aM = block.match(/href="(https:\/\/[^"]+)"[^>]*title="View official INEC EC8A scan"/)
    const votes = {}
    const chipRe = />\s*([A-Z][A-Z0-9.]*)\s*<span[^>]*>([\d,]+)<\/span>/g
    let c
    while ((c = chipRe.exec(block))) votes[c[1]] = (votes[c[1]] ?? 0) + Number(c[2].replace(/,/g, ''))
    const stat = (label) => {
      const s = block.match(new RegExp(`<span class="lbl">${label}</span><span class="val">([^<]+)</span>`))
      return s ? num(unescape(s[1])) : null
    }
    let ward = null
    for (const w of wards) { if (w.at < markers[i]) ward = w.name; else break }
    pus.push({
      ward,
      inecCode: codeM[0],
      name: unescape(nameM[1].trim()),
      ec8aUrl: ec8aM ? ec8aM[1] : null,
      anomaly: /Sum-of-parties|⚠/.test(block),
      registered: stat('#1 Registered'),
      accredited: stat('#2 Accredited'),
      rejected: stat('#6 Rejected'),
      valid: stat('#7 Valid'),
      votes,
    })
  }
  return { lgaName, pus }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const only = process.argv.find((a) => a.startsWith('--slug='))?.split('=')[1]
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const el of ELECTIONS) {
    if (only && el.slug !== only) continue
    const all = []
    for (let i = 1; i <= el.lgas; i++) {
      const url = `${BASE}/${el.slug}/lga/${String(i).padStart(2, '0')}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
      const { lgaName, pus } = parseLgaPage(await res.text())
      console.log(`${el.slug} lga/${String(i).padStart(2, '0')} (${lgaName ?? '?'}): ${pus.length} PUs`)
      all.push({ lgaNo: i, lgaName, pus })
      if (i < el.lgas) await sleep(DELAY_MS)
    }
    const out = path.join(OUT_DIR, `irev-${el.slug}.json`)
    fs.writeFileSync(out, JSON.stringify({ source: BASE, fetchedAt: new Date().toISOString(), lgas: all }, null, 1))
    console.log(`wrote ${out} (${all.reduce((a, l) => a + l.pus.length, 0)} PUs)`)
  }
}

main().catch((e) => { console.error('FETCH ERROR:', e.message); process.exitCode = 1 })
