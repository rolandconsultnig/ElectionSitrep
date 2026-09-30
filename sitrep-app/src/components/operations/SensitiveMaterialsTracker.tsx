import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type SensitiveMaterial = {
  id: number
  material_type: 'bvas' | 'ballot_box' | 'ec8a_sheet' | 'ballot_papers' | 'stamp_and_ink'
  serial_or_barcode: string
  status: 'issued' | 'in_transit' | 'delivered' | 'at_pu' | 'returned' | 'compromised'
  carrier_name?: string | null
  carrier_phone?: string | null
  security_escort?: string | null
  last_scanned_at: string
  tamper_seal_intact: boolean
  notes?: string | null
  pu_code?: string | null
  pu_name?: string | null
  ward_name?: string | null
  lga_name?: string | null
  state_name?: string | null
  officer_name?: string | null
}

const MATERIAL_TYPES_MAP: Record<string, { label: string; icon: string }> = {
  bvas: { label: 'BVAS Device', icon: '📱' },
  ballot_box: { label: 'Ballot Box (Numbered)', icon: '🗳' },
  ec8a_sheet: { label: 'Form EC8A Sheet', icon: '📜' },
  ballot_papers: { label: 'Ballot Paper Booklets', icon: '📑' },
  stamp_and_ink: { label: 'Official Stamp & Indelible Ink', icon: '🖋' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  issued: { label: 'Issued at RAC', color: '#3B82F6', bg: '#3B82F620' },
  in_transit: { label: 'In Transit', color: '#F59E0B', bg: '#F59E0B20' },
  delivered: { label: 'Delivered to RAC/SPO', color: '#10B981', bg: '#10B98120' },
  at_pu: { label: 'Confirmed at PU', color: '#00c46a', bg: '#00c46a20' },
  returned: { label: 'Returned to Collation', color: '#8B5CF6', bg: '#8B5CF620' },
  compromised: { label: 'TAMPER / COMPROMISED', color: '#EF4444', bg: '#EF444420' },
}

export function SensitiveMaterialsTrackerView({
  electionSlug,
  stateId,
  lgaId,
}: {
  electionSlug?: string
  stateId?: number
  lgaId?: number
}) {
  const [selectedMaterial, setSelectedMaterial] = useState<SensitiveMaterial | null>(null)
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showScanModal, setShowScanModal] = useState(false)

  // Fetch materials list
  const { data, refetch } = useQuery<{ materials: SensitiveMaterial[] }>({
    queryKey: ['sensitive-materials', electionSlug, stateId, lgaId, filterType, filterStatus, searchTerm],
    queryFn: () => {
      const params = new URLSearchParams()
      if (electionSlug) params.set('electionSlug', electionSlug)
      if (stateId) params.set('stateId', String(stateId))
      if (lgaId) params.set('lgaId', String(lgaId))
      if (filterType) params.set('materialType', filterType)
      if (filterStatus) params.set('status', filterStatus)
      if (searchTerm) params.set('search', searchTerm)
      return apiJson<{ materials: SensitiveMaterial[] }>(`/api/operations/materials?${params.toString()}`)
    },
    refetchInterval: 12_000,
  })

  // Fetch audit trail for selected material
  const trailQuery = useQuery<{
    trail: {
      id: number
      action: string
      from_name: string
      to_name: string
      location_name: string
      notes: string
      created_at: string
    }[]
  }>({
    queryKey: ['material-trail', selectedMaterial?.id],
    queryFn: () => {
      if (!selectedMaterial?.id) return { trail: [] }
      return apiJson(`/api/operations/materials/${selectedMaterial.id}/trail`)
    },
    enabled: Boolean(selectedMaterial?.id),
  })

  const materials = data?.materials || []

  const stats = {
    total: materials.length,
    atPu: materials.filter((m) => m.status === 'at_pu').length,
    inTransit: materials.filter((m) => m.status === 'in_transit').length,
    compromised: materials.filter((m) => m.status === 'compromised' || !m.tamper_seal_intact).length,
  }

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-(--font-syne) text-xl font-bold text-[var(--portal-fg)]">
            Sensitive Materials Chain-of-Custody Tracker
          </h2>
          <p className="text-xs text-[var(--portal-muted)]">
            End-to-end custody tracking for BVAS, ballot boxes, and result sheets with tamper-seal verification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            className="sr-btn-primary px-3.5 py-2 text-xs text-white flex items-center gap-1.5"
          >
            <span>📷</span> Scan / Update Custody
          </button>
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="sr-btn-ghost px-3.5 py-2 text-xs text-[var(--portal-fg)]"
          >
            + Register Item
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Tracked Assets
          </div>
          <div className="text-2xl font-bold text-[var(--portal-fg)] mt-1">
            {stats.total.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">BVAS & Ballot Boxes</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Confirmed at PU
          </div>
          <div className="text-2xl font-bold text-[#00c46a] mt-1">
            {stats.atPu.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#00c46a]">Station deployed</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            In Transit
          </div>
          <div className="text-2xl font-bold text-[#F59E0B] mt-1">
            {stats.inTransit.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#F59E0B]">Escort active</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Compromised / Seal Broken
          </div>
          <div className={`text-2xl font-bold mt-1 ${stats.compromised > 0 ? 'text-[#EF4444]' : 'text-[var(--portal-fg)]'}`}>
            {stats.compromised}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">
            {stats.compromised > 0 ? 'Immediate investigation needed' : 'All seals intact'}
          </div>
        </div>
      </div>

      {/* Materials Filter and Table */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="">All Material Types</option>
              <option value="bvas">BVAS Devices</option>
              <option value="ballot_box">Ballot Boxes</option>
              <option value="ec8a_sheet">Form EC8A Sheets</option>
              <option value="ballot_papers">Ballot Papers</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="">All Custody Statuses</option>
              <option value="issued">Issued at RAC</option>
              <option value="in_transit">In Transit</option>
              <option value="at_pu">At Polling Unit</option>
              <option value="returned">Returned</option>
              <option value="compromised">Compromised</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Search Serial / Barcode / Courier…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none w-64"
          />
        </div>

        {materials.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--portal-muted)]">
            No sensitive materials records found. Click "+ Register Item" to seed or track materials.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--portal-fg)]">
              <thead className="border-b border-[color:var(--portal-border)] font-(--font-mono) text-[11px] uppercase text-[var(--portal-dim)] bg-[color:var(--portal-table-header-bg)]">
                <tr>
                  <th className="py-2.5 px-3">Asset</th>
                  <th className="py-2.5 px-3">Serial / Barcode</th>
                  <th className="py-2.5 px-3">Location / PU</th>
                  <th className="py-2.5 px-3">Custody / Courier</th>
                  <th className="py-2.5 px-3">Tamper Seal</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Last Scanned</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--portal-border)]">
                {materials.map((m) => {
                  const typeCfg = MATERIAL_TYPES_MAP[m.material_type] || { label: m.material_type, icon: '📦' }
                  const statusCfg = STATUS_CONFIG[m.status] || { label: m.status, color: '#00c46a', bg: '#00c46a20' }

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-[color:var(--portal-table-row-hover)] transition cursor-pointer"
                      onClick={() => setSelectedMaterial(m)}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="text-base">{typeCfg.icon}</span>
                          <span>{typeCfg.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono) font-bold text-[#00c46a]">
                        {m.serial_or_barcode}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-(--font-mono) text-[11px]">{m.pu_code || 'In Transit'}</div>
                        <div className="text-[10px] text-[var(--portal-muted)]">
                          {m.ward_name || m.lga_name || m.state_name || 'Central Store'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-[11px] font-semibold text-[var(--portal-fg)]">
                          {m.carrier_name || m.officer_name || 'Assigned Officer'}
                        </div>
                        {m.carrier_phone && (
                          <div className="font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                            {m.carrier_phone}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {m.tamper_seal_intact ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#00c46a]/15 px-2 py-0.5 text-[10px] font-bold text-[#00c46a]">
                            ✓ INTACT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-[#EF4444]/20 px-2 py-0.5 text-[10px] font-bold text-[#EF4444] animate-pulse">
                            ⚠ BROKEN
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
                        {new Date(m.last_scanned_at).toLocaleTimeString('en-NG', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedMaterial(m)
                          }}
                          className="sr-btn-ghost px-2.5 py-1 text-[11px]"
                        >
                          Trail
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Chain-of-Custody Audit Trail Inspector */}
      {selectedMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="sr-card max-w-xl w-full max-h-[85vh] overflow-y-auto border-[color:var(--portal-border)] p-6 space-y-5 bg-[#141414]">
            <div className="flex items-start justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a]">
                  CHAIN OF CUSTODY AUDIT LOG
                </span>
                <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
                  {MATERIAL_TYPES_MAP[selectedMaterial.material_type]?.label || selectedMaterial.material_type} · {selectedMaterial.serial_or_barcode}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMaterial(null)}
                className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              {trailQuery.isLoading ? (
                <div className="p-8 text-center text-xs text-[var(--portal-muted)]">
                  Loading custody history…
                </div>
              ) : trailQuery.data?.trail && trailQuery.data.trail.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[color:var(--portal-border)]">
                  {trailQuery.data.trail.map((t) => (
                    <div key={t.id} className="relative space-y-1">
                      <div className="absolute -left-6 top-1 size-3 rounded-full bg-[#00c46a] ring-4 ring-black" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-(--font-syne) font-bold text-[var(--portal-fg)] uppercase">
                          {t.action.replace('_', ' ')}
                        </span>
                        <span className="font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                          {new Date(t.created_at).toLocaleString('en-NG')}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--portal-muted)]">
                        Handoff: <strong className="text-[var(--portal-fg)]">{t.from_name || 'RAC/Base'}</strong> →{' '}
                        <strong className="text-[var(--portal-fg)]">{t.to_name || 'Carrier'}</strong>
                      </div>
                      {t.location_name && (
                        <div className="text-[11px] text-[var(--portal-dim)]">
                          Location: {t.location_name}
                        </div>
                      )}
                      {t.notes && <div className="text-[11px] italic text-[var(--portal-muted)]">"{t.notes}"</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-[var(--portal-muted)]">
                  No previous transfer events logged. Initial registration is active.
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-[color:var(--portal-border)] pt-4">
              <button
                type="button"
                onClick={() => setSelectedMaterial(null)}
                className="sr-btn-ghost px-4 py-2 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Scan / Update Custody Transfer */}
      {showScanModal && (
        <ScanCustodyModal
          onClose={() => setShowScanModal(false)}
          onSuccess={() => {
            setShowScanModal(false)
            refetch()
          }}
        />
      )}

      {/* Modal: Register New Sensitive Material */}
      {showRegisterModal && (
        <RegisterMaterialModal
          electionSlug={electionSlug}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => {
            setShowRegisterModal(false)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function ScanCustodyModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [serialOrBarcode, setSerialOrBarcode] = useState('')
  const [status, setStatus] = useState<string>('in_transit')
  const [carrierName, setCarrierName] = useState('')
  const [carrierPhone, setCarrierPhone] = useState('')
  const [tamperSealIntact, setTamperSealIntact] = useState(true)
  const [locationName, setLocationName] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      return apiJson('/api/operations/materials/scan', {
        method: 'POST',
        body: JSON.stringify({
          serialOrBarcode,
          status,
          carrierName,
          carrierPhone,
          tamperSealIntact,
          locationName,
          notes,
        }),
      })
    },
    onSuccess: () => {
      onSuccess()
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Scan update failed.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
          <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
            Scan / Update Material Custody
          </h3>
          <button onClick={onClose} className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none">
            &times;
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] rounded-lg">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Asset Barcode / Serial Number *
            </label>
            <input
              type="text"
              required
              value={serialOrBarcode}
              onChange={(e) => setSerialOrBarcode(e.target.value)}
              placeholder="e.g. BVAS-FCT-00192 or BB-LAG-8492"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm font-(--font-mono) text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              New Custody Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="in_transit">In Transit to Polling Station</option>
              <option value="at_pu">Delivered & Confirmed at PU</option>
              <option value="returned">Returned to Ward / Collation Center</option>
              <option value="compromised">Report Damaged / Tampered / Compromised</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Carrier / Officer Name
              </label>
              <input
                type="text"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="e.g. Inspector Garba"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Carrier Phone
              </label>
              <input
                type="text"
                value={carrierPhone}
                onChange={(e) => setCarrierPhone(e.target.value)}
                placeholder="+234 800 000 0000"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="sealIntact"
              checked={tamperSealIntact}
              onChange={(e) => setTamperSealIntact(e.target.checked)}
              className="size-4 accent-[#00c46a]"
            />
            <label htmlFor="sealIntact" className="text-xs text-[var(--portal-fg)] cursor-pointer">
              Security Tamper Seal is Intact & Verified
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Current Location Name
            </label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. PU 004 RAC Escort / In Transit"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Handoff confirmation details…"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
          <button type="button" onClick={onClose} className="sr-btn-ghost px-4 py-2 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !serialOrBarcode}
            onClick={() => mutation.mutate()}
            className="sr-btn-primary px-4 py-2 text-xs text-white"
          >
            {mutation.isPending ? 'Updating…' : 'Record Custody Scan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RegisterMaterialModal({
  electionSlug,
  onClose,
  onSuccess,
}: {
  electionSlug?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [materialType, setMaterialType] = useState('bvas')
  const [serialOrBarcode, setSerialOrBarcode] = useState('')
  const [carrierName, setCarrierName] = useState('')
  const [carrierPhone, setCarrierPhone] = useState('')
  const [securityEscort, setSecurityEscort] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      return apiJson('/api/operations/materials', {
        method: 'POST',
        body: JSON.stringify({
          electionSlug,
          materialType,
          serialOrBarcode,
          carrierName,
          carrierPhone,
          securityEscort,
          notes,
          status: 'issued',
        }),
      })
    },
    onSuccess: () => {
      onSuccess()
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Registration failed.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
          <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
            Register Sensitive Material Item
          </h3>
          <button onClick={onClose} className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none">
            &times;
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#EF4444] rounded-lg">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Material Type
            </label>
            <select
              value={materialType}
              onChange={(e) => setMaterialType(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              <option value="bvas">BVAS Device</option>
              <option value="ballot_box">Ballot Box</option>
              <option value="ec8a_sheet">Form EC8A Sheet</option>
              <option value="ballot_papers">Ballot Paper Booklets</option>
              <option value="stamp_and_ink">Stamp & Indelible Ink</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Barcode / Serial Number *
            </label>
            <input
              type="text"
              required
              value={serialOrBarcode}
              onChange={(e) => setSerialOrBarcode(e.target.value)}
              placeholder="e.g. BVAS-2026-00492"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm font-(--font-mono) text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Issued To (Officer / SPO)
              </label>
              <input
                type="text"
                value={carrierName}
                onChange={(e) => setCarrierName(e.target.value)}
                placeholder="Officer name"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={carrierPhone}
                onChange={(e) => setCarrierPhone(e.target.value)}
                placeholder="+234…"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Security Escort Detail
            </label>
            <input
              type="text"
              value={securityEscort}
              onChange={(e) => setSecurityEscort(e.target.value)}
              placeholder="e.g. 2 NPF + 1 NSCDC Escort Unit"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Batch or dispatch notes…"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
          <button type="button" onClick={onClose} className="sr-btn-ghost px-4 py-2 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !serialOrBarcode}
            onClick={() => mutation.mutate()}
            className="sr-btn-primary px-4 py-2 text-xs text-white"
          >
            {mutation.isPending ? 'Registering…' : 'Register Material'}
          </button>
        </div>
      </div>
    </div>
  )
}
