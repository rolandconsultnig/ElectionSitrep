import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface TaskforceAgency {
  id: number
  election_id: string | null
  agency_code: 'NPF' | 'NA' | 'NN' | 'NAF' | 'NSCDC' | 'DSS' | 'FRSC' | 'NIS' | 'NDLEA'
  agency_name: string
  sector_name: string
  state_id: number | null
  state_name: string | null
  liaison_officer_name: string
  liaison_officer_rank: string
  liaison_officer_phone: string
  tactical_callsign: string
  radio_frequency: string
  deployed_personnel_count: number
  patrol_vehicles_count: number
  armored_vehicles_count: number
  status: 'standby' | 'active' | 'engaged' | 'relocating' | 'stood_down'
  created_at: string
  updated_at: string
}

export const InterAgencyTaskforceBoard: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [selectedState, setSelectedState] = useState<string>('all')
  const [selectedAgency, setSelectedAgency] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  // Form State
  const [agencyCode, setAgencyCode] = useState<TaskforceAgency['agency_code']>('NPF')
  const [agencyName, setAgencyName] = useState('')
  const [sectorName, setSectorName] = useState('')
  const [stateId, setStateId] = useState<number | ''>('')
  const [liaisonOfficerName, setLiaisonOfficerName] = useState('')
  const [liaisonOfficerRank, setLiaisonOfficerRank] = useState('')
  const [liaisonOfficerPhone, setLiaisonOfficerPhone] = useState('')
  const [tacticalCallsign, setTacticalCallsign] = useState('')
  const [radioFrequency, setRadioFrequency] = useState('')
  const [personnelCount, setPersonnelCount] = useState(150)
  const [patrolVehicles, setPatrolVehicles] = useState(12)
  const [armoredVehicles, setArmoredVehicles] = useState(2)
  const [status, setStatus] = useState<TaskforceAgency['status']>('active')

  // 1. Fetch Agencies
  const { data, isLoading } = useQuery({
    queryKey: ['taskforce-agencies', selectedState, selectedAgency],
    queryFn: async () => {
      let url = `/api/coordination/agencies?`
      if (selectedState !== 'all') url += `stateId=${encodeURIComponent(selectedState)}&`
      if (selectedAgency !== 'all') url += `agencyCode=${encodeURIComponent(selectedAgency)}`
      return apiJson<{
        agencies: TaskforceAgency[]
        summary: {
          totalAgencies: number
          totalPersonnel: number
          totalPatrolVehicles: number
          totalArmoredVehicles: number
          activeEngagements: number
        }
      }>(url)
    },
    refetchInterval: 15000,
  })

  // 2. Fetch States
  const { data: statesData } = useQuery({
    queryKey: ['geo-states-list', electionSlug],
    queryFn: async () => {
      try {
        const json = await apiJson<{ states?: Array<{ id: number; name: string; code: string }> }>(
          `/api/admin/elections/${encodeURIComponent(electionSlug)}/setup`,
        )
        return json.states || []
      } catch {
        return []
      }
    },
  })

  // 3. Register Agency Mutation
  const addMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return apiJson('/api/coordination/agencies', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskforce-agencies'] })
      setShowAddModal(false)
      setAgencyName('')
      setSectorName('')
      setLiaisonOfficerName('')
      setTacticalCallsign('')
    },
  })

  // 4. Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: TaskforceAgency['status'] }) => {
      return apiJson(`/api/coordination/agencies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskforce-agencies'] })
    },
  })

  const agencies: TaskforceAgency[] = data?.agencies || []
  const summary = data?.summary || {
    totalAgencies: agencies.length,
    totalPersonnel: agencies.reduce((s, a) => s + (a.deployed_personnel_count || 0), 0),
    totalPatrolVehicles: agencies.reduce((s, a) => s + (a.patrol_vehicles_count || 0), 0),
    totalArmoredVehicles: agencies.reduce((s, a) => s + (a.armored_vehicles_count || 0), 0),
    activeEngagements: agencies.filter((a) => a.status === 'engaged' || a.status === 'active').length,
  }

  const getAgencyColor = (code: string) => {
    switch (code) {
      case 'NPF':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40'
      case 'NA':
      case 'NN':
      case 'NAF':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      case 'NSCDC':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      case 'DSS':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40'
      case 'FRSC':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-blue-950/40 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40 shadow-inner text-2xl font-bold">
              🏛
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Inter-Agency Taskforce Joint Coordination Board
                <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-300 border border-blue-500/30">
                  Phase 4
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Unified multi-force command: NPF, Armed Forces, NSCDC, DSS, and Road Safety operational disposition
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
          >
            <span>+</span>
            Deploy Taskforce Detachment
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>👥</span>
              Total Deployed Strength
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">
              {summary.totalPersonnel.toLocaleString()} Troops
            </div>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-3.5">
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
              <span>🚗</span>
              Rapid Patrol Vehicles
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-200 tracking-tight">
              {summary.totalPatrolVehicles} Units
            </div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>🛡</span>
              Armored Personnel Carriers (APC)
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">
              {summary.totalArmoredVehicles} APCs
            </div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3.5">
            <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <span>⚡</span>
              Active Taskforce Sectors
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-200 tracking-tight">
              {summary.totalAgencies} Commands
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Agency Filter Tabs */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>📡</span>
            Joint Force Disposition & Liaison Registry
          </h3>

          <div className="flex items-center gap-3">
            <select
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value)}
              aria-label="Filter by agency"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Service Arms</option>
              <option value="NPF">Nigeria Police Force</option>
              <option value="NA">Nigerian Army</option>
              <option value="NSCDC">NSCDC</option>
              <option value="DSS">DSS Intelligence</option>
              <option value="FRSC">FRSC Corridor Control</option>
            </select>

            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              aria-label="Filter by state"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All States</option>
              {statesData?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Taskforce Grid */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading taskforce force disposition...</div>
        ) : agencies.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No joint taskforce detachments matching the selected filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agencies.map((agency) => {
              const isEngaged = agency.status === 'engaged'
              const isActive = agency.status === 'active'

              return (
                <div
                  key={agency.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700 space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-xs font-bold border ${getAgencyColor(
                            agency.agency_code,
                          )}`}
                        >
                          {agency.agency_code}
                        </span>
                        <h4 className="font-bold text-white text-sm line-clamp-1">
                          {agency.sector_name}
                        </h4>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                          isEngaged
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {agency.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 font-semibold mb-2">
                      {agency.agency_name}
                    </div>

                    {/* Operational Details */}
                    <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-900 pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Callsign:</span>
                        <strong className="text-white font-mono">{agency.tactical_callsign}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">VHF / Frequency:</span>
                        <span className="text-cyan-300 font-mono">{agency.radio_frequency}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Liaison Officer:</span>
                        <span className="text-slate-200">
                          {agency.liaison_officer_rank} {agency.liaison_officer_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Contact:</span>
                        <span className="text-slate-300 font-mono">{agency.liaison_officer_phone}</span>
                      </div>
                    </div>

                    {/* Strength Counters */}
                    <div className="grid grid-cols-3 gap-2 mt-3 border-t border-slate-900 pt-2.5 text-center text-xs">
                      <div className="rounded-lg bg-slate-900 p-1.5">
                        <div className="text-[10px] text-slate-400">Troops</div>
                        <div className="font-bold text-white">{agency.deployed_personnel_count}</div>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-1.5">
                        <div className="text-[10px] text-slate-400">Patrols</div>
                        <div className="font-bold text-blue-300">{agency.patrol_vehicles_count}</div>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-1.5">
                        <div className="text-[10px] text-slate-400">APCs</div>
                        <div className="font-bold text-emerald-300">{agency.armored_vehicles_count}</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Status Toggles */}
                  <div className="border-t border-slate-800 pt-3 flex items-center justify-between gap-2">
                    <select
                      value={agency.status}
                      onChange={(e) =>
                        updateStatusMutation.mutate({
                          id: agency.id,
                          status: e.target.value as TaskforceAgency['status'],
                        })
                      }
                      aria-label="Update taskforce status"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="active">Status: Active Patrol</option>
                      <option value="engaged">Status: In Engagement</option>
                      <option value="standby">Status: On Standby</option>
                      <option value="relocating">Status: Relocating</option>
                      <option value="stood_down">Status: Stood Down</option>
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Taskforce Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>🏛</span>
              Deploy Joint Taskforce Detachment
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Coordinate military, police tactical units, civil defence, and emergency corps in key electoral sectors.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                addMutation.mutate({
                  electionSlug,
                  agencyCode,
                  agencyName: agencyName || `${agencyCode} Electoral Taskforce`,
                  sectorName,
                  stateId: stateId === '' ? null : Number(stateId),
                  liaisonOfficerName,
                  liaisonOfficerRank,
                  liaisonOfficerPhone,
                  tacticalCallsign,
                  radioFrequency,
                  deployedPersonnelCount: personnelCount,
                  patrolVehiclesCount: patrolVehicles,
                  armoredVehiclesCount: armoredVehicles,
                  status,
                })
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Service Arm *</label>
                  <select
                    value={agencyCode}
                    onChange={(e) => {
                      const code = e.target.value as TaskforceAgency['agency_code']
                      setAgencyCode(code)
                      if (!agencyName) {
                        if (code === 'NPF') setAgencyName('Nigeria Police Tactical Squad')
                        else if (code === 'NA') setAgencyName('Nigerian Army Safe Conduct')
                        else if (code === 'NSCDC') setAgencyName('NSCDC Protection Unit')
                        else if (code === 'DSS') setAgencyName('DSS Situation Cell')
                        else if (code === 'FRSC') setAgencyName('FRSC Corridor Patrol')
                      }
                    }}
                    required
                    aria-label="Select Service Arm"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="NPF">Nigeria Police Force (NPF)</option>
                    <option value="NA">Nigerian Army (NA)</option>
                    <option value="NN">Nigerian Navy (NN)</option>
                    <option value="NAF">Nigerian Air Force (NAF)</option>
                    <option value="NSCDC">Civil Defence (NSCDC)</option>
                    <option value="DSS">DSS Intelligence</option>
                    <option value="FRSC">FRSC Road Safety</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Sector / Zone Name *</label>
                  <input
                    type="text"
                    value={sectorName}
                    onChange={(e) => setSectorName(e.target.value)}
                    required
                    placeholder="e.g. Kano Central Hub, Port Harcourt Corridor"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">State Command</label>
                  <select
                    value={stateId}
                    onChange={(e) => setStateId(e.target.value === '' ? '' : Number(e.target.value))}
                    aria-label="Select State Command"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Nationwide / Joint Sector</option>
                    {statesData?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Initial Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    aria-label="Select Initial Status"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">Active Patrol</option>
                    <option value="standby">Standby Strike</option>
                    <option value="engaged">Engaged in Interdiction</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tactical Callsign *</label>
                  <input
                    type="text"
                    value={tacticalCallsign}
                    onChange={(e) => setTacticalCallsign(e.target.value)}
                    required
                    placeholder="e.g. THUNDER-01, VIPER-BASE"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Radio Frequency</label>
                  <input
                    type="text"
                    value={radioFrequency}
                    onChange={(e) => setRadioFrequency(e.target.value)}
                    placeholder="145.200 MHz / Tactical Ch 3"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Liaison Officer *</label>
                  <input
                    type="text"
                    value={liaisonOfficerName}
                    onChange={(e) => setLiaisonOfficerName(e.target.value)}
                    required
                    placeholder="Full Name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Rank</label>
                  <input
                    type="text"
                    value={liaisonOfficerRank}
                    onChange={(e) => setLiaisonOfficerRank(e.target.value)}
                    placeholder="Major / CSP"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Phone *</label>
                  <input
                    type="text"
                    value={liaisonOfficerPhone}
                    onChange={(e) => setLiaisonOfficerPhone(e.target.value)}
                    required
                    placeholder="+234 803..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Troops</label>
                  <input
                    type="number"
                    value={personnelCount}
                    onChange={(e) => setPersonnelCount(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Patrol Vans</label>
                  <input
                    type="number"
                    value={patrolVehicles}
                    onChange={(e) => setPatrolVehicles(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Armored APCs</label>
                  <input
                    type="number"
                    value={armoredVehicles}
                    onChange={(e) => setArmoredVehicles(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
                  disabled={addMutation.isPending}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  {addMutation.isPending ? 'Deploying...' : 'Deploy Detachment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
