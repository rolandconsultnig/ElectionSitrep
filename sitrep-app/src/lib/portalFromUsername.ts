import type { PortalId } from './navigation'

/**
 * Maps login username → portal for demo / staging until Keycloak JWT carries claims.
 *
 * **Recommended:** prefix usernames with the portal key and a separator:
 * - `admin.<name>` · `admin_<name>` · starts with `admin.` → Admin Portal
 * - `field.<name>` · `field_<name>` · `pu.` · `dpo.` → Field Portal
 * - `management.<name>` · `cp.` · `dig.` · `mgmt.` → Management Portal
 * - `igp.<name>` · `dig_ops` · `fhq.` → IGP Portal
 *
 * Matching is case-insensitive. Extra keywords are used as fallback (e.g. username contains `admin`).
 */
export function portalFromUsername(raw: string): PortalId | null {
  const u = raw.trim().toLowerCase()
  if (!u) return null

  // Explicit portal.token (first segment)
  const explicit = u.match(/^(admin|field|management|igp)[._-]/i)
  if (explicit) return explicit[1].toLowerCase() as PortalId

  // Whole-token shortcuts
  if (u === 'admin' || u === 'sysadmin') return 'admin'
  if (u === 'field' || u === 'officer') return 'field'
  if (u === 'management' || u === 'cp' || u === 'dig') return 'management'
  if (u === 'igp' || u === 'dig_ops' || u === 'digops') return 'igp'

  // Prefix without dot (admin_john)
  if (/^admin[_-]/i.test(u)) return 'admin'
  if (/^field[_-]/i.test(u)) return 'field'
  if (/^management[_-]/i.test(u) || /^mgmt[_-]/i.test(u)) return 'management'
  if (/^igp[_-]/i.test(u)) return 'igp'

  // Role-like tokens (subset of §03)
  if (/^(npf_data|data_officer|system_admin|provision)/i.test(u)) return 'admin'
  if (/^(pu_|ward_|dpo_|intel_|sitrep)/i.test(u) || u.includes('field_officer')) return 'field'
  if (/^(cp_|area_|legal_evidence)/i.test(u) || u.includes('commissioner') || u.includes('area_commander'))
    return 'management'
  if (/^(fhq_|force|executive_brief|dig_operations)/i.test(u) || u.includes('inspector_general')) return 'igp'

  // Keyword fallbacks (last resort)
  if (u.includes('admin') || u.includes('data_officer') || u.includes('election_data')) return 'admin'
  if (u.includes('igp') || u.includes('dig_ops') || u.includes('force hq')) return 'igp'
  if (u.includes('management') || u.includes('command_dashboard') || u.includes('commissioner')) return 'management'
  if (u.includes('field') || u.includes('polling') || u.includes('pu-')) return 'field'

  return null
}

export function portalMatchHint(portal: PortalId): string {
  const hints: Record<PortalId, string> = {
    admin: 'admin.yourname · npf_data.officer · sysadmin',
    field: 'field.yourname · pu.KN001 · dpo.lagos · intel.site',
    management: 'management.yourname · cp.state · dig.zone · area.north',
    igp: 'igp.office · dig_ops · fhq.ops · executive.brief',
  }
  return hints[portal]
}
