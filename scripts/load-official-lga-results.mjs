/**
 * Load INEC-declared LGA-level results for Ekiti & Osun 2026 governorship elections
 * into election_lga_result_totals + election_lga_party_results (migration_030).
 *
 * Sources (public reportage of the official LGA collation announcements):
 *  Ekiti: BBC News Pidgin LGA-by-LGA table of the INEC declaration,
 *    https://www.bbc.com/pidgin/articles/c0my8pdv2k3o (2026-06-21).
 *    Per-LGA registered/accredited + ADC/APC/PDP/LP votes; every party column was
 *    re-summed and reconciles exactly with the declared state totals.
 *    BBC labels Gbonyin as "Aiyekire" (its 2021 name) — stored under geo_lgas 'Gbonyin'.
 *    Per-LGA valid/rejected/cast were not published; left NULL.
 *  Osun: BBC News Pidgin collation-centre LGA table incl. collation-officer
 *    incident notes, https://www.bbc.com/pidgin/articles/c15119z5ello (2026-08-16);
 *    fields BBC left blank are filled from NAN's collation transcript
 *    (https://nannews.ng/osun-2026-adelekes-victory-sparks-jubilation-in-osogbo/)
 *    where noted below, else NULL.
 *    NOTE: THISDAY/Legit printed Ola-Oluwa Accord as 10,163 — BBC says 10,063 and
 *    only 10,063 reconciles the column to the declared 511,067. BBC figure used.
 *    Only Accord/APC/ADC per-LGA figures were declared publicly; the residual
 *    (~12,017 minor-party votes statewide) is derived per LGA as valid - (A+APC+ADC).
 *
 * Idempotent; fails loudly on unmatched LGA names or reconciliation drift.
 * Run configure-ekiti-osun-elections.mjs and load-official-results.mjs first.
 */
import { pool } from '../server/src/db.js'

const DATA = [
  {
    slug: 'ekiti-gubernatorial-election',
    stateCode: 'EK',
    lgas: [
      { lga: 'Ado-Ekiti', registered: 118817, accredited: 45695, votes: { ADC: 1054, APC: 38026, PDP: 3817, LP: 10 } },
      { lga: 'Efon', registered: 31749, accredited: 11393, votes: { ADC: 201, APC: 8742, PDP: 2051, LP: 2 } },
      { lga: 'Ekiti East', registered: 66171, accredited: 32284, votes: { ADC: 1730, APC: 26359, PDP: 2795, LP: 199 } },
      { lga: 'Ekiti South West', registered: 56003, accredited: 18094, votes: { ADC: 1076, APC: 14705, PDP: 1800, LP: 2 } },
      { lga: 'Ekiti West', registered: 65160, accredited: 33421, votes: { ADC: 674, APC: 28258, PDP: 3644, LP: 3 } },
      { lga: 'Emure', registered: 39299, accredited: 16411, votes: { ADC: 732, APC: 14325, PDP: 851, LP: 5 } },
      { lga: 'Gbonyin', registered: 57771, accredited: 19405, votes: { ADC: 314, APC: 17133, PDP: 1563, LP: 2 } },
      { lga: 'Ido-Osi', registered: 61674, accredited: 20217, votes: { ADC: 561, APC: 17901, PDP: 1449, LP: 0 } },
      { lga: 'Ijero', registered: 67713, accredited: 30795, votes: { ADC: 2026, APC: 25506, PDP: 2479, LP: 3 } },
      { lga: 'Ikere', registered: 69320, accredited: 22287, votes: { ADC: 245, APC: 11116, PDP: 9892, LP: 16 } },
      { lga: 'Ikole', registered: 81028, accredited: 28568, votes: { ADC: 812, APC: 26508, PDP: 750, LP: 4 } },
      { lga: 'Ilejemeje', registered: 20862, accredited: 11077, votes: { ADC: 579, APC: 8984, PDP: 1243, LP: 0 } },
      { lga: 'Irepodun/Ifelodun', registered: 75552, accredited: 32990, votes: { ADC: 511, APC: 29278, PDP: 2119, LP: 4 } },
      { lga: 'Ise/Orun', registered: 49183, accredited: 15219, votes: { ADC: 365, APC: 12908, PDP: 1627, LP: 19 } },
      { lga: 'Moba', registered: 56346, accredited: 23507, votes: { ADC: 994, APC: 20500, PDP: 1572, LP: 1 } },
      { lga: 'Oye', registered: 71603, accredited: 23577, votes: { ADC: 998, APC: 18975, PDP: 2891, LP: 6 } },
    ],
  },
  {
    slug: 'osun-gubernatorial-election',
    stateCode: 'OS',
    lgas: [
      { lga: 'Aiyedire', registered: 45502, accredited: 21419, valid: 21228, rejected: 186, cast: 21414, votes: { A: 11073, APC: 9910, ADC: 148 } },
      { lga: 'Atakunmosa East', registered: 47767, accredited: 19253, valid: 18442, rejected: 381, cast: 18823, votes: { A: 7872, APC: 9936, ADC: 333 }, incidents: 'Results cancelled in two polling units (Ward 04 PU 95 Community Primary School; PU 02 LA Primary School) over violence.' },
      { lga: 'Atakunmosa West', registered: 44076, accredited: 18707, valid: 17985, rejected: 414, cast: 18399, votes: { A: 7479, APC: 10037, ADC: 213 }, incidents: 'Okebode PU 001 Oju Oja (704 voters): ballot papers spoilt after voters carried them away — result cancelled.' },
      { lga: 'Ayedaade', registered: 77649, accredited: 34232, valid: 33180, rejected: 621, cast: 33801, votes: { A: 16681, APC: 15719, ADC: 331 }, incidents: 'Election cancelled in two polling units over over-voting.' },
      { lga: 'Boluwaduro', registered: 29797, accredited: 14662, valid: 14478 /* NAN; BBC blank */, rejected: 177, cast: 14655, votes: { A: 7118, APC: 7050, ADC: 179 } },
      { lga: 'Boripe', registered: 81067, accredited: 33943, valid: 33116, rejected: 597, cast: 33713, votes: { A: 12448, APC: 19963, ADC: 379 } },
      { lga: 'Ede North', registered: 96644, accredited: 47262, valid: 46474, rejected: 731, cast: 47205, votes: { A: 35427, APC: 10283, ADC: 307 /* THISDAY; BBC blank */ } },
      { lga: 'Ede South', registered: 67729, accredited: 34011, valid: 33210 /* NAN; BBC blank */, rejected: null, cast: 33950 /* NAN; BBC blank */, votes: { A: 26188, APC: 6219, ADC: 390 } },
      { lga: 'Egbedore', registered: 67440, accredited: 31867, valid: 31155, rejected: 675, cast: 31830, votes: { A: 19278, APC: 11194, ADC: 363 } },
      { lga: 'Ejigbo', registered: 87676, accredited: 41173, valid: 40314, rejected: 811, cast: 41125, votes: { A: 18458, APC: 16195, ADC: 5053 }, incidents: 'Three violence incidents affecting 2,340 voters.' },
      { lga: 'Ife Central', registered: 122454, accredited: 39990, valid: 38380, rejected: 950, cast: 39330, votes: { A: 21171, APC: 15913, ADC: 747 }, incidents: 'PU 17: over-voting by one vote, cancelled by agreement. PU 011 Ward 09: over-voting unresolved, votes cancelled.' },
      { lga: 'Ife East', registered: 128465, accredited: 49065, valid: 47519, rejected: 1498, cast: 49017, votes: { A: 27201, APC: 18600, ADC: 935 }, incidents: 'No party agent signed the results sheet.' },
      { lga: 'Ife North', registered: 65718, accredited: 24772, valid: 24216, rejected: 488, cast: 24704, votes: { A: 13879, APC: 9613, ADC: 333 } },
      { lga: 'Ife South', registered: 66255, accredited: 29521, valid: null, rejected: null, cast: null, votes: { A: 13507, APC: 14678, ADC: 290 /* THISDAY; BBC blank */ } },
      { lga: 'Ifedayo', registered: 28361, accredited: 14703, valid: 14449 /* NAN; BBC blank */, rejected: 254, cast: 14703, votes: { A: 7427, APC: 6836, ADC: 115 } },
      { lga: 'Ifelodun', registered: null, accredited: 41156, valid: 40466, rejected: 677, cast: 41143, votes: { A: 21107, APC: 18396, ADC: 509 } },
      { lga: 'Ila', registered: 57825, accredited: 30028, valid: 29605, rejected: 416, cast: 30021, votes: { A: 16211, APC: 12934, ADC: 259 } },
      { lga: 'Ilesa East', registered: 89492, accredited: 30371 /* NAN; BBC blank */, valid: 29460, rejected: 749, cast: 30209, votes: { A: 12280, APC: 16208, ADC: 504 } },
      { lga: 'Ilesa West', registered: 86699, accredited: 31333, valid: 30244, rejected: 990, cast: 31234, votes: { A: 16196, APC: 12756, ADC: 673 } },
      { lga: 'Irepodun', registered: 67131, accredited: 31291, valid: 30717, rejected: 565, cast: 31282, votes: { A: 14504, APC: 15713, ADC: 249 } },
      { lga: 'Irewole', registered: 96528, accredited: 42858, valid: null, rejected: 1249, cast: 42824, votes: { A: 10934, APC: 29972, ADC: 275 } },
      { lga: 'Isokan', registered: 65739, accredited: 29421, valid: 28716, rejected: 689, cast: 29405, votes: { A: 13765, APC: 14063, ADC: 384 } },
      { lga: 'Iwo', registered: 106814, accredited: 48985, valid: 48027, rejected: 926, cast: 48953, votes: { A: 27085, APC: 19660, ADC: 588 }, incidents: 'Ward 14 Oke Oba: one polling unit cancelled after violence; rerun requested.' },
      { lga: 'Obokun', registered: 64440, accredited: 29183, valid: 28687, rejected: 460, cast: 29147, votes: { A: 12023, APC: 16120, ADC: 205 } },
      { lga: 'Odo-Otin', registered: 82574, accredited: null, valid: 34026, rejected: 430, cast: 34456, votes: { A: 18003, APC: 15435, ADC: 377 }, incidents: 'Ward 02 PU 02: one case of violence reported.' },
      { lga: 'Ola-Oluwa', registered: 44761, accredited: 21599, valid: 21228, rejected: 367, cast: 21951, votes: { A: 10063, APC: 10782, ADC: 213 } },
      { lga: 'Olorunda', registered: 123063, accredited: 51172, valid: 49458, rejected: 1335, cast: 50793, votes: { A: 23514, APC: 24671, ADC: 666 }, incidents: 'Ward 05 Owope PU 005 and PU 006 cancelled for over-voting (692 and 756 voters affected).' },
      { lga: 'Oriade', registered: 84283, accredited: 37962, valid: 37073, rejected: 860, cast: 37933, votes: { A: 21343, APC: 14863, ADC: 423 } },
      { lga: 'Osogbo', registered: 167704, accredited: 70840, valid: 69307, rejected: 1478, cast: null, votes: { A: 36480, APC: 30474, ADC: 1503 } },
      { lga: 'Orolu', registered: 51021, accredited: 25423, valid: 23438, rejected: 452, cast: 23890, votes: { A: 12352, APC: 10622, ADC: 236 }, incidents: 'Ward 04: two PUs cancelled for over-voting. Ward 03 Olufon: votes cancelled (over-voting). Ward 05 Olufon: ballot box snatched; votes cancelled after party-agent objection.' },
    ],
  },
]

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const d of DATA) {
      const el = await client.query(`SELECT id FROM elections WHERE slug = $1`, [d.slug])
      if (!el.rows.length) throw new Error(`Election not found: ${d.slug}`)
      const electionId = el.rows[0].id

      const lgaRows = await client.query(
        `SELECT l.id, l.name FROM geo_lgas l
         INNER JOIN geo_states s ON s.id = l.state_id WHERE s.code = $1`,
        [d.stateCode],
      )
      const byNorm = new Map(lgaRows.rows.map((r) => [norm(r.name), r]))
      const unmatched = d.lgas.filter((x) => !byNorm.has(norm(x.lga)))
      if (unmatched.length) {
        throw new Error(`${d.slug}: unmatched LGAs: ${unmatched.map((x) => x.lga).join(', ')}`)
      }

      const sums = {}
      for (const x of d.lgas) {
        const lgaId = byNorm.get(norm(x.lga)).id
        await client.query(
          `INSERT INTO election_lga_result_totals
             (election_id, lga_id, registered_voters, accredited_voters, valid_votes, rejected_votes, votes_cast, incidents)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (election_id, lga_id) DO UPDATE SET
             registered_voters = EXCLUDED.registered_voters,
             accredited_voters = EXCLUDED.accredited_voters,
             valid_votes = EXCLUDED.valid_votes,
             rejected_votes = EXCLUDED.rejected_votes,
             votes_cast = EXCLUDED.votes_cast,
             incidents = EXCLUDED.incidents`,
          [electionId, lgaId, x.registered ?? null, x.accredited ?? null,
           x.valid ?? null, x.rejected ?? null, x.cast ?? null, x.incidents ?? null],
        )
        for (const [abbr, votes] of Object.entries(x.votes)) {
          const p = await client.query(`SELECT id FROM political_parties WHERE abbreviation = $1`, [abbr])
          if (!p.rows.length) throw new Error(`${d.slug}: party ${abbr} not in catalog`)
          await client.query(
            `INSERT INTO election_lga_party_results (election_id, lga_id, party_id, votes)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (election_id, lga_id, party_id) DO UPDATE SET votes = EXCLUDED.votes`,
            [electionId, lgaId, p.rows[0].id, votes],
          )
          sums[abbr] = (sums[abbr] ?? 0) + votes
        }
      }

      // reconcile each declared party column against the official state total
      const official = await client.query(
        `SELECT p.abbreviation, r.votes FROM election_official_party_results r
         INNER JOIN political_parties p ON p.id = r.party_id WHERE r.election_id = $1`,
        [electionId],
      )
      const declared = Object.fromEntries(official.rows.map((r) => [r.abbreviation, Number(r.votes)]))
      const drift = []
      for (const [abbr, sum] of Object.entries(sums)) {
        if (!(abbr in declared)) throw new Error(`${d.slug}: ${abbr} has LGA rows but no official total`)
        if (declared[abbr] !== sum) drift.push(`${abbr}: LGA sum ${sum} != declared ${declared[abbr]}`)
      }
      if (drift.length) throw new Error(`${d.slug}: reconciliation failed — ${drift.join('; ')}`)

      const minor = Object.entries(declared)
        .filter(([abbr]) => !(abbr in sums))
        .reduce((a, [, v]) => a + v, 0)
      console.log(
        `${d.slug}: ${d.lgas.length} LGAs loaded — party columns reconcile to declared totals` +
          (minor ? `; ${minor} minor-party votes exist only at state level` : ''),
      )
    }
    await client.query('COMMIT')
    console.log('\nCommitted.')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  const v = await pool.query(`
    SELECT e.slug, count(DISTINCT t.lga_id) AS lgas,
           sum(t.registered_voters) AS registered, sum(t.accredited_voters) AS accredited,
           sum(t.valid_votes) AS valid
    FROM election_lga_result_totals t
    JOIN elections e ON e.id = t.election_id
    GROUP BY e.slug`)
  console.table(v.rows)
}

main().catch((e) => { console.error('LOAD ERROR:', e.message); process.exitCode = 1 }).finally(async () => { await pool.end().catch(() => {}) })
