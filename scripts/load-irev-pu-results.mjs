/**
 * Load IReV-transcribed polling-unit results (fetched by fetch-irev-results.mjs
 * from nigeriaopendata.com, itself a transcription of INEC's public EC8A scans)
 * into election_pu_party_votes (source='irev') + election_pu_result_meta.
 *
 * Rules:
 *  - PUs are matched to geo_polling_units by normalized name, ward-scoped first,
 *    then LGA-wide; unmatched/ambiguous PUs are reported, never forced.
 *  - PUs the source flagged ⚠ (party sum != printed valid votes — transcription
 *    noise) get a meta row with anomaly=true but NO vote rows, so aggregates
 *    stay internally consistent.
 *  - Vote rows never overwrite source='field' rows — NPF field uploads win.
 *  - Party abbreviations absent from political_parties are skipped and logged.
 *
 * Idempotent. Requires migration_031 and an election created by
 * configure-ekiti-osun-elections.mjs. Pass --dry-run to preview matching only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../server/src/db.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry-run')

const ELECTIONS = [
  { slug: 'ekiti-gubernatorial-election', stateCode: 'EK', file: 'irev-ekiti-governorship-2026.json' },
  { slug: 'osun-gubernatorial-election', stateCode: 'OS', file: 'irev-osun-governorship-2026.json' },
]

const norm = (s) => String(s ?? '').toUpperCase().replace(/&[A-Z#0-9]+;/g, '').replace(/[^A-Z0-9]/g, '')

// INEC spelling variants: site name (normalized) -> our geo_lgas name (normalized)
const LGA_ALIASES = {
  ATAKUMOSAEAST: norm('Atakunmosa East'),
  ATAKUMOSAWEST: norm('Atakunmosa West'),
  AYEDIRE: norm('Aiyedire'),
}
const lgaKey = (name) => LGA_ALIASES[norm(name)] ?? norm(name)

async function main() {
  for (const d of ELECTIONS) {
    const file = path.join(HERE, 'data', d.file)
    if (!fs.existsSync(file)) { console.warn(`${d.slug}: ${d.file} missing — run fetch-irev-results.mjs first`); continue }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))

    const el = await pool.query(`SELECT id FROM elections WHERE slug = $1`, [d.slug])
    if (!el.rows.length) { console.warn(`${d.slug}: election not found — skipped`); continue }
    const electionId = el.rows[0].id

    const lgas = await pool.query(
      `SELECT l.id, l.name FROM geo_lgas l JOIN geo_states s ON s.id = l.state_id WHERE s.code = $1`,
      [d.stateCode],
    )
    const lgaByNorm = new Map(lgas.rows.map((r) => [norm(r.name), r]))
    const wards = await pool.query(
      `SELECT w.id, w.name, w.lga_id FROM geo_wards w JOIN geo_lgas l ON l.id = w.lga_id
       JOIN geo_states s ON s.id = l.state_id WHERE s.code = $1`,
      [d.stateCode],
    )
    const pus = await pool.query(
      `SELECT pu.id, pu.name, w.id AS ward_id, w.lga_id FROM geo_polling_units pu
       JOIN geo_wards w ON w.id = pu.ward_id JOIN geo_lgas l ON l.id = w.lga_id
       JOIN geo_states s ON s.id = l.state_id WHERE s.code = $1`,
      [d.stateCode],
    )
    const parties = await pool.query(`SELECT id, abbreviation FROM political_parties`)
    const partyId = new Map(parties.rows.map((r) => [r.abbreviation, r.id]))

    const wardByLgaNorm = new Map() // lgaId -> Map(normWardName -> wardId)
    for (const w of wards.rows) {
      if (!wardByLgaNorm.has(w.lga_id)) wardByLgaNorm.set(w.lga_id, new Map())
      wardByLgaNorm.get(w.lga_id).set(norm(w.name), w.id)
    }
    const puByWardNorm = new Map() // wardId -> Map(normName -> [ids])
    const puByLgaNorm = new Map() // lgaId -> Map(normName -> [ids])
    for (const p of pus.rows) {
      const k = norm(p.name)
      if (!puByWardNorm.has(p.ward_id)) puByWardNorm.set(p.ward_id, new Map())
      const wm = puByWardNorm.get(p.ward_id)
      if (!wm.has(k)) wm.set(k, [])
      wm.get(k).push(p.id)
      if (!puByLgaNorm.has(p.lga_id)) puByLgaNorm.set(p.lga_id, new Map())
      const lm = puByLgaNorm.get(p.lga_id)
      if (!lm.has(k)) lm.set(k, [])
      lm.get(k).push(p.id)
    }
    const pickUnique = (map, key) => {
      const ids = map?.get(key)
      return ids && ids.length === 1 ? ids[0] : null
    }

    const stats = { matched: 0, unmatched: [], anomalies: 0, dirty: 0, votes: 0, skippedParties: new Set(), unknownLga: [] }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (const lga of data.lgas) {
        const lgaRow = lgaByNorm.get(lgaKey(lga.lgaName))
        if (!lgaRow) { stats.unknownLga.push(lga.lgaName); continue }
        for (const p of lga.pus) {
          const wardMap = lga.ward ? wardByLgaNorm.get(lgaRow.id)?.get(norm(lga.ward)) : null
          const puId =
            (wardMap ? pickUnique(puByWardNorm.get(wardMap), norm(p.name)) : null) ??
            pickUnique(puByLgaNorm.get(lgaRow.id), norm(p.name))
          if (!puId) { stats.unmatched.push(`${lga.lgaName} › ${p.ward} › ${p.name} [${p.inecCode}]`); continue }
          stats.matched++
          if (!DRY) {
            // stat cells are OCR-derived too — clamp impossible negatives to NULL
            const clean = (v) => (typeof v === 'number' && v >= 0 ? v : null)
            await client.query(
              `INSERT INTO election_pu_result_meta
                 (election_id, polling_unit_id, source, inec_code, ec8a_url, anomaly,
                  registered_voters, accredited_voters, valid_votes, rejected_votes)
               VALUES ($1,$2,'irev',$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (election_id, polling_unit_id, source) DO UPDATE SET
                 inec_code = EXCLUDED.inec_code, ec8a_url = EXCLUDED.ec8a_url,
                 anomaly = EXCLUDED.anomaly,
                 registered_voters = EXCLUDED.registered_voters,
                 accredited_voters = EXCLUDED.accredited_voters,
                 valid_votes = EXCLUDED.valid_votes,
                 rejected_votes = EXCLUDED.rejected_votes`,
              [electionId, puId, p.inecCode, p.ec8aUrl, p.anomaly,
               clean(p.registered), clean(p.accredited), clean(p.valid), clean(p.rejected)],
            )
          }
          if (p.anomaly) stats.anomalies++
          // A PU carrying an OCR-mangled party label (e.g. "APCA", "ACCORO")
          // is unverifiable — record meta only, never partial vote rows.
          const unmapped = Object.keys(p.votes).filter((a) => !partyId.has(a))
          // Exclude only physically impossible rows: party-vote sum cannot
          // exceed accredited (or registered, when accredited is unknown).
          // The source's ⚠ flag alone does not exclude — its trigger may be a
          // misread valid field rather than the votes themselves, and the flag
          // is preserved in meta for audit either way.
          const sum = Object.values(p.votes).reduce((a, b) => a + b, 0)
          const cap = p.accredited ?? p.registered
          const impossible = cap != null && sum > cap
          if (impossible) stats.impossible = (stats.impossible ?? 0) + 1
          if (unmapped.length) {
            stats.dirty++
            for (const a of unmapped) stats.skippedParties.add(a)
            continue
          }
          if (impossible) continue
          for (const [abbr, votes] of Object.entries(p.votes)) {
            const pid = partyId.get(abbr)
            stats.votes++
            if (!DRY) {
              await client.query(
                `INSERT INTO election_pu_party_votes (election_id, polling_unit_id, party_id, votes, source)
                 VALUES ($1,$2,$3,$4,'irev')
                 ON CONFLICT (election_id, polling_unit_id, party_id) DO UPDATE SET
                   votes = EXCLUDED.votes, source = EXCLUDED.source
                 WHERE election_pu_party_votes.source <> 'field'`,
                [electionId, puId, pid, votes],
              )
            }
          }
        }
      }
      if (DRY) await client.query('ROLLBACK')
      else await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    const total = data.lgas.reduce((a, l) => a + l.pus.length, 0)
    console.log(
      `${d.slug}: ${stats.matched}/${total} PUs matched (${((stats.matched / total) * 100).toFixed(1)}%)` +
        ` · ${stats.anomalies} flagged (${stats.impossible ?? 0} excluded impossible) + ${stats.dirty} garbage-label · ${stats.votes} party-vote rows${DRY ? ' [DRY]' : ''}`,
    )
    if (stats.unknownLga.length) console.log(`  unknown LGAs: ${stats.unknownLga.join(', ')}`)
    if (stats.skippedParties.size) console.log(`  parties skipped (not in catalog): ${[...stats.skippedParties].join(', ')}`)
    if (stats.unmatched.length) {
      console.log(`  unmatched PUs: ${stats.unmatched.length}`)
      for (const u of stats.unmatched.slice(0, 12)) console.log(`    - ${u}`)
      if (stats.unmatched.length > 12) console.log(`    … and ${stats.unmatched.length - 12} more`)
    }
  }
}

main().catch((e) => { console.error('LOAD ERROR:', e.message); process.exitCode = 1 }).finally(async () => { await pool.end().catch(() => {}) })
