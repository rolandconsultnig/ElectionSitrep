/**
 * Load ACTUAL official INEC-declared data for Ekiti & Osun 2026 governorship elections.
 *
 * Sources:
 *  Ekiti (2026-06-20): INEC declaration by RO Prof. Adenike Oladiji, 2026-06-21 ~03:13 WAT
 *    (Channels TV, THISDAY live collation, BBC Pidgin, CDD-EAC).
 *    Registered 988,251 · Accredited 384,940 · Valid 375,777 · Rejected 6,332 · Cast 382,109 · 2,445 PUs.
 *  Osun (2026-08-15): INEC declaration by RO Prof. Joshua Olalekan Ogunwole, 2026-08-16 early WAT
 *    (FMINO Osun FIC report, BBC Pidgin live, Athena Election Observatory).
 *    Registered 2,339,544 · Accredited 1,010,684 · Valid 985,079 · Rejected 20,721 · Cast 1,005,800 · 3,763 PUs.
 *    Note: PP (111) and NLPP (118) are not in the seeded INEC party catalog, so their rows are
 *    omitted from per-party results; they remain included in official_totals.validVotes.
 *
 * Also sets election_category/governorship_state_id/voting_close_time (INEC voting 08:30–14:30)
 * and fills election_candidates with running mates where publicly documented.
 */
import { pool } from '../server/src/db.js'

const DATA = [
  {
    slug: 'ekiti-gubernatorial-election',
    stateId: 22,
    votes: {
      APC: 319224, PDP: 40543, ADC: 12872, A: 564, AA: 126, AAC: 195, ADP: 1269,
      APM: 59, APP: 61, LP: 276, NNPP: 35, PRP: 163, SDP: 179, YPP: 98, ZLP: 113,
    },
    expectedValid: 375777,
    totals: {
      registeredVoters: 988251, accreditedVoters: 384940, validVotes: 375777,
      rejectedVotes: 6332, votesCast: 382109, pollingUnits: 2445, lgas: 16,
      declaredWinnerParty: 'APC', declaredWinnerCandidate: 'Biodun Abiodun Oyebanji',
      declaredAt: '2026-06-21T03:13:00+01:00', returningOfficer: 'Prof. Adenike Oladiji',
      source: 'INEC declaration, Ado-Ekiti collation centre (Channels TV / THISDAY / BBC Pidgin, 2026-06-21)',
    },
    runningMates: { APC: 'Monisade Afuye', A: 'Omoyemi Olaleye', APP: 'Akinyemi Adewumi', PRP: 'Modupe Adebiyi' },
  },
  {
    slug: 'osun-gubernatorial-election',
    stateId: 36,
    votes: {
      A: 511067, APC: 444815, ADC: 17180, ADP: 2946, ZLP: 2482, AA: 2308, APGA: 1474,
      AAC: 1458, YPP: 534, APM: 234, SDP: 155, APP: 114, PRP: 83,
    },
    expectedValid: 985079, // includes PP 111 + NLPP 118 (parties not in catalog)
    totals: {
      registeredVoters: 2339544, accreditedVoters: 1010684, validVotes: 985079,
      rejectedVotes: 20721, votesCast: 1005800, pollingUnits: 3763, lgas: 30,
      declaredWinnerParty: 'A', declaredWinnerCandidate: 'Ademola Jackson Nurudeen Adeleke',
      declaredAt: '2026-08-16T04:00:00+01:00', returningOfficer: 'Prof. Joshua Olalekan Ogunwole',
      source: 'INEC declaration, Osogbo (FMINO Osun FIC report / BBC Pidgin, 2026-08-16)',
      omittedParties: { PP: 111, NLPP: 118 },
    },
    runningMates: {},
  },
]

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const d of DATA) {
      const el = await client.query(`SELECT id FROM elections WHERE slug = $1`, [d.slug])
      if (!el.rows.length) throw new Error(`Election not found: ${d.slug} — run configure-ekiti-osun-elections.mjs first`)
      const electionId = el.rows[0].id

      // election metadata: real category, state link, INEC close-of-voting time, official totals
      await client.query(
        `UPDATE elections SET
           election_category = 'governorship',
           governorship_state_id = $2,
           governorship_all_states = false,
           is_rerun = false,
           voting_close_time = '14:30',
           official_totals = $3::jsonb,
           updated_at = now()
         WHERE id = $1`,
        [electionId, d.stateId, JSON.stringify(d.totals)],
      )

      // official per-party results
      let sum = 0
      for (const [abbr, votes] of Object.entries(d.votes)) {
        const p = await client.query(`SELECT id FROM political_parties WHERE abbreviation = $1`, [abbr])
        if (!p.rows.length) { console.warn(`  !! party ${abbr} not in catalog — skipped`); continue }
        await client.query(
          `INSERT INTO election_official_party_results (election_id, party_id, votes) VALUES ($1, $2, $3)
           ON CONFLICT (election_id, party_id) DO UPDATE SET votes = EXCLUDED.votes`,
          [electionId, p.rows[0].id, votes],
        )
        sum += votes
      }
      const accounted = sum + Object.values(d.totals.omittedParties ?? {}).reduce((a, b) => a + b, 0)
      if (accounted !== d.expectedValid) {
        throw new Error(`${d.slug}: vote rows sum ${accounted} != official valid ${d.expectedValid}`)
      }

      // election_candidates (admin Candidates page) with sourced running mates
      const cands = await client.query(
        `SELECT party_id, candidate_name FROM election_party_candidates WHERE election_id = $1`, [electionId])
      for (const c of cands.rows) {
        if (!c.candidate_name) continue // keep parties with unknown candidates out of the candidate register
        const abbr = await client.query(`SELECT abbreviation FROM political_parties WHERE id = $1`, [c.party_id])
        const rm = d.runningMates[abbr.rows[0]?.abbreviation] ?? null
        await client.query(
          `INSERT INTO election_candidates (election_id, party_id, candidate_name, running_mate_name, nomination_status)
           VALUES ($1, $2, $3, $4, 'confirmed')
           ON CONFLICT (election_id, party_id) DO UPDATE SET
             candidate_name = EXCLUDED.candidate_name, running_mate_name = EXCLUDED.running_mate_name`,
          [electionId, c.party_id, c.candidate_name, rm],
        )
      }
      console.log(`${d.slug}: ${Object.keys(d.votes).length} party results loaded, sum=${sum} (official valid ${d.expectedValid})`)
    }
    await client.query('COMMIT')
    console.log('\nCommitted.')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  // verification read-back
  const v = await pool.query(`
    SELECT e.slug, e.election_date::text AS date, e.election_category, e.status,
           e.official_totals->>'declaredWinnerCandidate' AS winner,
           (SELECT sum(votes) FROM election_official_party_results r WHERE r.election_id = e.id) AS loaded_votes,
           (e.official_totals->>'validVotes')::int AS official_valid
    FROM elections e WHERE e.slug IN ('ekiti-gubernatorial-election','osun-gubernatorial-election')`)
  console.table(v.rows)
}

main().catch((e) => { console.error('LOAD ERROR:', e.message); process.exitCode = 1 }).finally(async () => { await pool.end().catch(() => {}) })
