import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface Stakeholder {
  id: number
  category: 'domestic_observer' | 'international_observer' | 'media_press' | 'cso_ngo' | 'inec_monitor' | 'diplomatic_mission'
  organization_name: string
  lead_contact_name: string
  contact_phone: string
  contact_email: string | null
  accreditation_number: string
  state_id: number | null
  state_name: string | null
  assigned_lga_ids: number[]
  vehicle_plate_numbers: string | null
  security_escort_provided: boolean
  incident_access_level: 'restricted' | 'public_verified' | 'liaison_shared' | 'full_partner'
  status: 'accredited' | 'in_field' | 'flagged' | 'revoked'
  created_at: string
  updated_at: string
}

export const StakeholderRegistryView: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  // Form State
  const [category, setCategory] = useState<Stakeholder['category']>('domestic_observer')
  const [organizationName, setOrganizationName] = useState('')
  const [leadContactName, setLeadContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [accreditationNumber, setAccreditationNumber] = useState('')
  const [vehiclePlateNumbers, setVehiclePlateNumbers] = useState('')
  const [securityEscortProvided, setSecurityEscortProvided] = useState(false)
  const [incidentAccessLevel, setIncidentAccessLevel] = useState<Stakeholder['incident_access_level']>('public_verified')
  const [status, setStatus] = useState<Stakeholder['status']>('accredited')

  // 1. Fetch Stakeholders
  const { data, isLoading } = useQuery({
    queryKey: ['accredited-stakeholders', selectedCategory, searchQuery],
    queryFn: async () => {
      let url = `/api/intelligence/stakeholders?`
      if (selectedCategory !== 'all') url += `category=${encodeURIComponent(selectedCategory)}&`
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}`
      return apiJson<{
        stakeholders: Stakeholder[]
        summary: {
          total: number
          domesticObservers: number
          internationalObservers: number
          media: number
          escortProvided: number
        }
      }>(url)
    },
  })

  // 2. Register Stakeholder Mutation
  const registerMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return apiJson('/api/intelligence/stakeholders', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accredited-stakeholders'] })
      setShowAddModal(false)
      setOrganizationName('')
      setLeadContactName('')
      setContactPhone('')
      setContactEmail('')
      setAccreditationNumber('')
      setVehiclePlateNumbers('')
    },
  })

  // 3. Update Stakeholder Mutation (escort, status, access)
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Stakeholder> }) => {
      return apiJson(`/api/intelligence/stakeholders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accredited-stakeholders'] })
    },
  })

  const stakeholders: Stakeholder[] = data?.stakeholders || []
  const summary = data?.summary || {
    total: stakeholders.length,
    domesticObservers: stakeholders.filter((s) => s.category === 'domestic_observer').length,
    internationalObservers: stakeholders.filter((s) => s.category === 'international_observer').length,
    media: stakeholders.filter((s) => s.category === 'media_press').length,
    escortProvided: stakeholders.filter((s) => s.security_escort_provided).length,
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-cyan-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40 shadow-inner text-2xl font-bold">
              🌐
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Accredited Observer & Stakeholder Registry
                <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
                  Phase 3
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                International observation missions, domestic CSOs, media credentials, and police escort tracking
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-600/30 hover:bg-cyan-500 transition-all cursor-pointer"
          >
            <span>+</span>
            Register Stakeholder
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>🌐</span>
              International Missions
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">{summary.internationalObservers}</div>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-3.5">
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
              <span>👥</span>
              Domestic Observers (CSOs)
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-200 tracking-tight">{summary.domesticObservers}</div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3.5">
            <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <span>📡</span>
              Accredited Press & Media
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-200 tracking-tight">{summary.media}</div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>🛡</span>
              Armed Police Escorts Active
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">{summary.escortProvided}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="🔍 Search by organization, lead contact, or INEC accreditation badge..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter stakeholders by category"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">All Categories</option>
              <option value="international_observer">International Observers</option>
              <option value="domestic_observer">Domestic Observers</option>
              <option value="media_press">Media & Press</option>
              <option value="cso_ngo">CSO & NGOs</option>
              <option value="inec_monitor">INEC Monitors</option>
              <option value="diplomatic_mission">Diplomatic Missions</option>
            </select>
          </div>
        </div>

        {/* Stakeholder Cards Grid */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading accredited observers & press registry...</div>
        ) : stakeholders.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No accredited stakeholders match your search or filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stakeholders.map((s) => {
              const inField = s.status === 'in_field'
              const isFlagged = s.status === 'flagged'

              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700 space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider border border-cyan-500/20">
                          {s.category.replace('_', ' ')}
                        </span>
                        <h4 className="font-bold text-white text-base mt-1 line-clamp-1">
                          {s.organization_name}
                        </h4>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          inField
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isFlagged
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-900 pt-2.5">
                      <div className="flex items-center gap-2">
                        <span>🏷 Badge:</span>
                        <span className="text-white font-mono font-bold">{s.accreditation_number}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>👤 Lead:</span>
                        <span className="text-slate-200 font-semibold">{s.lead_contact_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>📞 Phone:</span>
                        <span className="text-slate-300">{s.contact_phone}</span>
                      </div>
                      {s.contact_email && (
                        <div className="flex items-center gap-2">
                          <span>✉ Email:</span>
                          <span className="line-clamp-1 text-slate-400">{s.contact_email}</span>
                        </div>
                      )}
                      {s.vehicle_plate_numbers && (
                        <div className="text-[11px] text-slate-400">
                          🚗 Vehicle(s): <span className="font-mono text-slate-300">{s.vehicle_plate_numbers}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions & Escort Status */}
                  <div className="border-t border-slate-800 pt-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() =>
                        updateMutation.mutate({
                          id: s.id,
                          updates: { security_escort_provided: !s.security_escort_provided },
                        })
                      }
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                        s.security_escort_provided
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🛡</span>
                      {s.security_escort_provided ? 'Escort Assigned' : 'No Escort'}
                    </button>

                    <div className="flex items-center gap-1">
                      {s.status !== 'in_field' ? (
                        <button
                          onClick={() => updateMutation.mutate({ id: s.id, updates: { status: 'in_field' } })}
                          title="Mark In Field"
                          className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-slate-700 hover:text-white cursor-pointer"
                        >
                          ✓ Deploy In-Field
                        </button>
                      ) : (
                        <button
                          onClick={() => updateMutation.mutate({ id: s.id, updates: { status: 'flagged' } })}
                          title="Flag Stakeholder"
                          className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-slate-700 hover:text-white cursor-pointer"
                        >
                          ⚠ Flag
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Register Stakeholder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>🌐</span>
              Register Accredited Stakeholder
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enroll international observer missions, press credentials, and security liaison records.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                registerMutation.mutate({
                  electionSlug,
                  category,
                  organizationName,
                  leadContactName,
                  contactPhone,
                  contactEmail,
                  accreditationNumber,
                  vehiclePlateNumbers,
                  securityEscortProvided,
                  incidentAccessLevel,
                  status,
                })
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    required
                    aria-label="Select Stakeholder Category"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="domestic_observer">Domestic Observer (CSO)</option>
                    <option value="international_observer">International Observer</option>
                    <option value="media_press">Media & Press</option>
                    <option value="cso_ngo">Civil Society Organization</option>
                    <option value="inec_monitor">INEC Monitoring Desk</option>
                    <option value="diplomatic_mission">Diplomatic Mission</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Accreditation Badge # *</label>
                  <input
                    type="text"
                    value={accreditationNumber}
                    onChange={(e) => setAccreditationNumber(e.target.value)}
                    required
                    placeholder="INEC/OBS/2026/..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Organization Name *</label>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                  placeholder="e.g. EU Election Observation Mission, YIAGA Africa, Channels TV"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Lead Contact Name *</label>
                  <input
                    type="text"
                    value={leadContactName}
                    onChange={(e) => setLeadContactName(e.target.value)}
                    required
                    placeholder="Chief of Mission / Lead Reporter"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Contact Phone *</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    required
                    placeholder="+234 803 000 0000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="observer@mission.org"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Vehicle Plate Numbers</label>
                  <input
                    type="text"
                    value={vehiclePlateNumbers}
                    onChange={(e) => setVehiclePlateNumbers(e.target.value)}
                    placeholder="ABJ-123-XY, LAG-456-ZZ"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Incident Access Level</label>
                  <select
                    value={incidentAccessLevel}
                    onChange={(e) => setIncidentAccessLevel(e.target.value as any)}
                    aria-label="Select Incident Access Level"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="public_verified">Public Verified Incidents</option>
                    <option value="liaison_shared">Liaison Shared Intelligence</option>
                    <option value="full_partner">Full Security Partner</option>
                    <option value="restricted">Restricted (Internal Only)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Initial Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    aria-label="Select Initial Status"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="accredited">Accredited</option>
                    <option value="in_field">In Field Active</option>
                    <option value="flagged">Flagged</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="escortCheck"
                  checked={securityEscortProvided}
                  onChange={(e) => setSecurityEscortProvided(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
                />
                <label htmlFor="escortCheck" className="text-xs text-slate-300 cursor-pointer">
                  Assign Dedicated Police Tactical Escort Detail
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-600/30 hover:bg-cyan-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  {registerMutation.isPending ? 'Registering...' : 'Complete Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
