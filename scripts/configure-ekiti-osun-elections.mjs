/**
 * Configure Ekiti 2026 + Osun 2026 governorship elections from public INEC records.
 * Idempotent (upserts). Sources:
 *  - Ekiti: INEC declaration 2026-06-21 (Returning Officer Prof. Adenike Oladiji);
 *    15 parties scored votes; APC 319,224 / PDP 40,543 / ADC 12,872; 2,445 PUs; 16 LGAs.
 *  - Osun: INEC declaration 2026-08-16 (Returning Officer Prof. Joshua Ogunwole);
 *    Accord 511,067 / APC 444,815 / ADC 17,180 + 12 smaller parties; 3,763 PUs; 30 LGAs.
 */
import { pool } from '../server/src/db.js'

const EKITI = {
  slug: 'ekiti-gubernatorial-election',
  name: 'Ekiti State Governorship Election 2026',
  date: '2026-06-20',
  stateId: 22, // Ekiti
  lgas: 16,
  pus: 2445,
  candidates: [
    ['APC', 'Biodun Abiodun Oyebanji'],
    ['PDP', 'Oluwole Oluyede'],
    ['ADC', 'Oluwadare Patrick Bejide'],
    ['A', 'Opeyemi Falegan'],
    ['AA', 'Omotoso Olu'],
    ['AAC', 'Akande Oluwasegun Samuel'],
    ['ADP', 'Ayodeji Ojo'],
    ['APM', 'Joseph Anifowose'],
    ['APP', 'Bidemi Olaiya Awogbemi'],
    ['LP', ''],
    ['NNPP', 'Abegunde Ayobami Blessing'],
    ['PRP', 'Olaniyi Olanrewaju Ayodele'],
    ['SDP', ''],
    ['YPP', 'Owoola Daramola'],
    ['ZLP', ''],
  ],
}

const OSUN = {
  slug: 'osun-gubernatorial-election',
  name: 'Osun State Governorship Election 2026',
  date: '2026-08-15',
  stateId: 36, // Osun
  lgas: 30,
  pus: 3763,
  candidates: [
    ['A', 'Ademola Jackson Nurudeen Adeleke'],
    ['APC', 'Munirudeen Bola Oyebamiji'],
    ['ADC', 'Najeem Folasayo Salaam'],
    ['AA', 'Olanrewaju Farinloye'],
    ['ZLP', 'Adefemi Adesuyi'],
    ['APGA', 'Adesina Adeyemi-Doro'],
    ['ADP', ''],
    ['AAC', ''],
    ['YPP', ''],
    ['APM', ''],
    ['SDP', ''],
    ['APP', ''],
    ['PRP', ''],
  ],
}

async function configure(client, cfg) {
  const el = await client.query(
    `INSERT INTO elections (slug, name, election_type, election_contest_types, election_date, jurisdictions_count, pu_count, status)
     VALUES ($1, $2, 'gubernatorial', '["governorship"]'::jsonb, $3, $4, $5, 'closed')
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       election_type = EXCLUDED.election_type,
       election_contest_types = EXCLUDED.election_contest_types,
       election_date = EXCLUDED.election_date,
       jurisdictions_count = EXCLUDED.jurisdictions_count,
       pu_count = EXCLUDED.pu_count,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING id`,
    [cfg.slug, cfg.name, cfg.date, cfg.lgas, cfg.pus],
  )
  const electionId = el.rows[0].id

  await client.query(
    `INSERT INTO election_scope_items (election_id, level, ref_id, included) VALUES ($1, 'state', $2, true)
     ON CONFLICT (election_id, level, ref_id) DO NOTHING`,
    [electionId, cfg.stateId],
  )

  let added = 0
  const missing = []
  for (const [abbr, candidateName] of cfg.candidates) {
    const p = await client.query(`SELECT id FROM political_parties WHERE abbreviation = $1`, [abbr])
    if (!p.rows.length) { missing.push(abbr); continue }
    await client.query(
      `INSERT INTO election_party_candidates (election_id, party_id, candidate_name) VALUES ($1, $2, $3)
       ON CONFLICT (election_id, party_id) DO UPDATE SET candidate_name = EXCLUDED.candidate_name`,
      [electionId, p.rows[0].id, candidateName],
    )
    added++
  }
  return { electionId, added, missing }
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const cfg of [EKITI, OSUN]) {
      const r = await configure(client, cfg)
      console.log(`${cfg.name}: id=${r.electionId} candidates=${r.added}${r.missing.length ? ' MISSING PARTIES: ' + r.missing.join(',') : ''}`)
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  // ---- verification ----
  const v = await pool.query(`
    SELECT e.slug, e.name, e.election_date, e.status, e.jurisdictions_count, e.pu_count,
           (SELECT count(*) FROM election_party_candidates c WHERE c.election_id = e.id) AS candidates,
           (SELECT string_agg(s.name, ',') FROM election_scope_items si JOIN geo_states s ON s.id = si.ref_id
             WHERE si.election_id = e.id AND si.level = 'state' AND si.included) AS scope
    FROM elections e WHERE e.slug IN ('ekiti-gubernatorial-election', 'osun-gubernatorial-election') ORDER BY e.election_date`)
  console.table(v.rows)

  const named = await pool.query(`
    SELECT e.slug, p.abbreviation, c.candidate_name
    FROM election_party_candidates c
    JOIN elections e ON e.id = c.election_id
    JOIN political_parties p ON p.id = c.party_id
    WHERE e.slug IN ('ekiti-gubernatorial-election', 'osun-gubernatorial-election')
    ORDER BY e.slug, p.abbreviation`)
  named.rows.forEach((r) => console.log(`${r.slug}  ${r.abbreviation.padEnd(6)} ${r.candidate_name || '(name not in public sources)'}`))
}

main().catch((e) => { console.error('CONFIG ERROR:', e); process.exitCode = 1 }).finally(async () => { await pool.end().catch(() => {}) })
