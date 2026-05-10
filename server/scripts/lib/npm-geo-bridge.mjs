/**
 * Maps npm package `nigerian-states-lgas-and-polling-units` IDs to `geo_lgas.code`
 * and derived ward codes (`AB-001-W01`), matching migration 011 LGA ordering.
 */
import fs from 'fs'
import path from 'path'

export function compress(s) {
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

const STATES = [
  ['AB', 'Abia'],
  ['AD', 'Adamawa'],
  ['AK', 'Akwa Ibom'],
  ['AN', 'Anambra'],
  ['BA', 'Bauchi'],
  ['BY', 'Bayelsa'],
  ['BE', 'Benue'],
  ['BO', 'Borno'],
  ['CR', 'Cross River'],
  ['DE', 'Delta'],
  ['EB', 'Ebonyi'],
  ['ED', 'Edo'],
  ['EK', 'Ekiti'],
  ['EN', 'Enugu'],
  ['GO', 'Gombe'],
  ['IM', 'Imo'],
  ['JI', 'Jigawa'],
  ['KD', 'Kaduna'],
  ['KT', 'Katsina'],
  ['KE', 'Kebbi'],
  ['KO', 'Kogi'],
  ['KW', 'Kwara'],
  ['LA', 'Lagos'],
  ['NA', 'Nasarawa'],
  ['NI', 'Niger'],
  ['OG', 'Ogun'],
  ['ON', 'Ondo'],
  ['OS', 'Osun'],
  ['OY', 'Oyo'],
  ['PL', 'Plateau'],
  ['RI', 'Rivers'],
  ['SO', 'Sokoto'],
  ['TA', 'Taraba'],
  ['YO', 'Yobe'],
  ['ZA', 'Zamfara'],
  ['FC', 'FCT'],
  ['KN', 'Kano'],
]

function buildStateMap() {
  const npmStateToCode = new Map()
  for (const [code, name] of STATES) {
    npmStateToCode.set(compress(name), code)
    npmStateToCode.set(compress(code), code)
  }
  npmStateToCode.set('FEDERALCAPITALTERRITORY', 'FC')
  npmStateToCode.set('AKWAIBOM', 'AK')
  npmStateToCode.set('CROSSRIVER', 'CR')
  return npmStateToCode
}

const NPM_LGA_SPELLING_TO_XS_NAME = new Map(
  [
    ['OGORI MANGOGO', 'Ogori/Magongo'],
    ['MOPA MORO', 'Mopa-Muro'],
    ['EGBADO SOUTH', 'Yewa South'],
    ['EGBADO NORTH', 'Yewa North'],
    ['SAGAMU', 'Shagamu'],
    ['BIRNIWA', 'Biriniwa'],
    ['IHALA', 'Ihiala'],
    ['IFAKO-IJAYE', 'Ifako-Ijaiye'],
    ['MAIDUGURI M. C.', 'Maiduguri'],
    ['AYEDIRE', 'Aiyedire'],
    ['ATAKUMOSA EAST', 'Atakunmosa East'],
    ['ATAKUMOSA WEST', 'Atakunmosa West'],
    ['OPOBO/NEKORO', 'Opobo/Nkoro'],
    ['MALUFASHI', 'Malumfashi'],
    ['DAMBAM', 'Damban'],
    ['EDATTI', 'Edati'],
    ['CALABAR MUNICIPALITY', 'Calabar Municipal'],
    ['BARIKIN LADI', 'Barkin Ladi'],
    ['BIRNIN MAGAJI', 'Birnin Magaji/Kiyaw'],
    ['KARASAWA', 'Karasuwa'],
    ['OGBOMOSO NORTH', 'Ogbomosho North'],
    ['OGBOMOSO SOUTH', 'Ogbomosho South'],
    ['PATIGI', 'Pategi'],
    ['GIRE 1', 'Girei'],
    ['UHUNMWODE', 'Uhunmwonde'],
    ['KOGI . K. K.', 'Kogi'],
    ['KIRIKA SAMMA', 'Kiri Kasama'],
    ['YALMALTU/ DEBA', 'Yamaltu/Deba'],
    ['NASARAWA EGGON', 'Nasarawa Egon'],
    ['WAMAKKO', 'Wamako'],
    ['S/BIRNI', 'Sabon Birni'],
    ['AREWA', 'Arewa Dandi'],
    ['WASAGU/DANKO', 'Danko-Wasagu'],
    ['MUNICIPAL', 'Abuja'],
    ['DANBATA', 'Dambatta'],
    ['DAWAKI TOFA', 'Dawakin Tofa'],
    ['DAWAKI KUDU', 'Dawakin Kudu'],
  ].map(([a, b]) => [a.toUpperCase(), b]),
)

/**
 * @param {string} repoRoot - ElectionSitrep repo root (parent of `database/`)
 * @returns {{
 *   npmLgaIdToOurCode: Map<string, string>,
 *   npmWardIdToWardCode: Map<string, string>,
 *   wardRows: { lgaCode: string, wardCode: string, name: string }[],
 * }}
 */
export function buildNpmGeoMaps(repoRoot) {
  const XS = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database/data/nigeria_lgas.json'), 'utf8'))
  const NPM_LGAS = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database/data/lgas_npm_bridge.json'), 'utf8'))
  const WARDS = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database/data/wards_catalog.json'), 'utf8'))

  const npmStateToCode = buildStateMap()

  const xsByState = new Map()
  for (const r of XS) {
    if (!xsByState.has(r.state_code)) xsByState.set(r.state_code, [])
    xsByState.get(r.state_code).push(r)
  }

  function normalizeNpmLgaName(raw) {
    const exact = String(raw).trim().toUpperCase()
    if (NPM_LGA_SPELLING_TO_XS_NAME.has(exact)) {
      return NPM_LGA_SPELLING_TO_XS_NAME.get(exact)
    }
    return String(raw)
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function findXsLga(npmLgaRow) {
    const st = npmStateToCode.get(compress(npmLgaRow.state_name))
    if (!st) return null
    const canon = normalizeNpmLgaName(npmLgaRow.local_government_name)
    const key = compress(canon)
    const candidates = xsByState.get(st) || []
    return candidates.find((x) => compress(x.name) === key) || null
  }

  const npmLgaIdToOurCode = new Map()
  const unmatched = []

  for (const n of NPM_LGAS) {
    const hit = findXsLga(n)
    if (!hit) {
      unmatched.push({ id: n.id, state: n.state_name, name: n.local_government_name })
      continue
    }
    const sorted = [...XS.filter((x) => x.state_code === hit.state_code)].sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )
    const idx = sorted.findIndex((x) => x.id === hit.id)
    const seq = idx + 1
    npmLgaIdToOurCode.set(String(n.id), `${hit.state_code}-${String(seq).padStart(3, '0')}`)
  }

  if (unmatched.length) {
    const err = new Error(`Unmatched npm LGAs: ${unmatched.length}`)
    err.unmatched = unmatched
    throw err
  }
  if (npmLgaIdToOurCode.size !== 774) {
    throw new Error(`Expected 774 npm LGAs, mapped ${npmLgaIdToOurCode.size}`)
  }

  const seqByNpmLga = new Map()
  const npmWardIdToWardCode = new Map()
  const wardRows = []

  for (const w of WARDS) {
    const lgaCode = npmLgaIdToOurCode.get(String(w.lga_id))
    if (!lgaCode) throw new Error(`Unknown lga_id ${w.lga_id} in wards_catalog`)
    const n = (seqByNpmLga.get(String(w.lga_id)) || 0) + 1
    seqByNpmLga.set(String(w.lga_id), n)
    const wid = String(n).padStart(2, '0')
    const wardCode = `${lgaCode}-W${wid}`
    npmWardIdToWardCode.set(String(w.id), wardCode)
    wardRows.push({
      lgaCode,
      wardCode,
      name: String(w.ward_name).trim(),
    })
  }

  return { npmLgaIdToOurCode, npmWardIdToWardCode, wardRows }
}
