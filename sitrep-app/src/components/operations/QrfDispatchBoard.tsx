import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type QrfTacticalUnit = {
  id: number
  unit_code: string
  unit_name: string
  state_name?: string | null
  lga_name?: string | null
  base_location: string
  strength_count: number
  commander_name: string
  commander_phone: string
  vehicle_callsign?: string | null
  status: 'standby' | 'mobilizing' | 'deployed' | 'on_scene' | 'returning' | 'offline'
  current_lat?: number | null
  current_lng?: number | null
}

export type QrfDispatchMission = {
  id: number
  unit_id: number
  unit_code: string
  unit_name: string
  commander_name: string
  commander_phone: string
  vehicle_callsign?: string | null
  target_lga_name?: string | null
  target_pu_code?: string | null
  target_pu_name?: string | null
  target_location_name: string
  objective: string
  eta_minutes: number
  status: 'dispatched' | 'en_route' | 'on_scene' | 'resolved' | 'recalled'
  dispatched_by_username: string
  dispatched_at: string
  arrived_at?: string | null
  resolved_at?: string | null
  after_action_notes?: string | null
}

const UNIT_STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  standby: { label: 'STANDBY (READY)', color: '#00c46a', bg: '#00c46a20' },
  mobilizing: { label: 'MOBILIZING', color: '#F59E0B', bg: '#F59E0B20' },
  deployed: { label: 'DEPLOYED / EN ROUTE', color: '#3B82F6', bg: '#3B82F620' },
  on_scene: { label: 'ON SCENE (ENGAGED)', color: '#EF4444', bg: '#EF444420' },
  returning: { label: 'RETURNING TO BASE', color: '#8B5CF6', bg: '#8B5CF620' },
  offline: { label: 'OFFLINE / REST', color: '#6B7280', bg: '#6B728020' },
}

const MISSION_STATUS_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  dispatched: { label: 'DISPATCHED', color: '#3B82F6', bg: '#3B82F620' },
  en_route: { label: 'EN ROUTE', color: '#F59E0B', bg: '#F59E0B20' },
  on_scene: { label: 'ON SCENE', color: '#EF4444', bg: '#EF444420' },
  resolved: { label: 'MISSION RESOLVED', color: '#00c46a', bg: '#00c46a20' },
  recalled: { label: 'RECALLED / STOOD DOWN', color: '#6B7280', bg: '#6B728020' },
}

export function QrfDispatchBoardView({
  stateId,
}: {
  stateId?: number
}) {
  const queryClient = useQueryClient()
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [preselectedUnit, setPreselectedUnit] = useState<QrfTacticalUnit | null>(null)
  const [selectedMission, setSelectedMission] = useState<QrfDispatchMission | null>(null)
  const [missionActionStatus, setMissionActionStatus] = useState<string>('on_scene')
  const [aarNotes, setAarNotes] = useState('')

  // Units query
  const unitsQuery = useQuery<{ units: QrfTacticalUnit[] }>({
    queryKey: ['qrf-units', stateId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (stateId) params.set('stateId', String(stateId))
      return apiJson<{ units: QrfTacticalUnit[] }>(`/api/operations/qrf/units?${params.toString()}`)
    },
    refetchInterval: 8_000,
  })

  // Dispatches query
  const dispatchesQuery = useQuery<{ dispatches: QrfDispatchMission[] }>({
    queryKey: ['qrf-dispatches'],
    queryFn: () => apiJson<{ dispatches: QrfDispatchMission[] }>('/api/operations/qrf/dispatches'),
    refetchInterval: 8_000,
  })

  const updateMissionMutation = useMutation({
    mutationFn: async (vars: { id: number; status: string; afterActionNotes?: string }) => {
      return apiJson(`/api/operations/qrf/dispatches/${vars.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: vars.status,
          afterActionNotes: vars.afterActionNotes,
        }),
      })
    },
    onSuccess: () => {
      setSelectedMission(null)
      queryClient.invalidateQueries({ queryKey: ['qrf-dispatches'] })
      queryClient.invalidateQueries({ queryKey: ['qrf-units'] })
    },
  })

  const units = unitsQuery.data?.units || []
  const dispatches = dispatchesQuery.data?.dispatches || []

  const standbyCount = units.filter((u) => u.status === 'standby').length
  const deployedCount = units.filter((u) => u.status === 'deployed' || u.status === 'on_scene').length
  const activeMissionsCount = dispatches.filter((d) => d.status !== 'resolved' && d.status !== 'recalled').length

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#EF4444] tracking-wider">
            RAPID TACTICAL INTERVENTION · QUICK REACTION FORCE (QRF)
          </span>
          <h2 className="font-(--font-syne) text-xl font-bold text-[var(--portal-fg)]">
            Reinforcement & QRF Dispatch Board
          </h2>
          <p className="text-xs text-[var(--portal-muted)]">
            Live posture, mobile strike teams, ETA tracking, and rapid tactical reinforcement deployment
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setPreselectedUnit(null)
            setShowDispatchModal(true)
          }}
          className="sr-btn-primary px-4 py-2 text-xs text-white flex items-center gap-1.5 self-start sm:self-auto shadow-lg shadow-red-500/10"
        >
          <span>⚡</span> Dispatch Tactical Squad
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Tactical Squads
          </div>
          <div className="text-2xl font-bold text-[var(--portal-fg)] mt-1">
            {units.length}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Total mobile units</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="flex items-center justify-between text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            <span>Standby (Ready)</span>
            <span className="size-2 rounded-full bg-[#00c46a] animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-[#00c46a] mt-1">
            {standbyCount}
          </div>
          <div className="text-[11px] text-[#00c46a]">Instant response posture</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="flex items-center justify-between text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            <span>Engaged / En Route</span>
            {deployedCount > 0 && <span className="size-2 rounded-full bg-[#EF4444] animate-ping" />}
          </div>
          <div className={`text-2xl font-bold mt-1 ${deployedCount > 0 ? 'text-[#EF4444]' : 'text-[var(--portal-fg)]'}`}>
            {deployedCount}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Active tactical operations</div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Active Missions
          </div>
          <div className="text-2xl font-bold text-[#3B82F6] mt-1">
            {activeMissionsCount}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">In progress</div>
        </div>
      </div>

      {/* Tactical Squads Roster Grid */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <h3 className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)]">
          Tactical Units Readiness & Fleet Posture
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {units.map((u) => {
            const statCfg = UNIT_STATUS_BADGES[u.status] || { label: u.status, color: '#00c46a', bg: '#00c46a20' }
            const isStandby = u.status === 'standby'

            return (
              <div
                key={u.id}
                className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)]/50 p-4 space-y-3 transition hover:border-[#00c46a]/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-(--font-mono) text-xs font-bold text-[#00c46a]">
                      {u.unit_code}
                    </div>
                    <div className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)] mt-0.5">
                      {u.unit_name}
                    </div>
                    <div className="text-[11px] text-[var(--portal-muted)]">
                      Base: {u.base_location}
                    </div>
                  </div>

                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-bold font-(--font-mono)"
                    style={{ backgroundColor: statCfg.bg, color: statCfg.color }}
                  >
                    {statCfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-[color:var(--portal-border)] pt-2.5">
                  <div>
                    <span className="text-[var(--portal-dim)]">Strength:</span>{' '}
                    <strong className="text-[var(--portal-fg)]">{u.strength_count} Armed Personnel</strong>
                  </div>
                  <div>
                    <span className="text-[var(--portal-dim)]">Callsign:</span>{' '}
                    <strong className="text-[var(--portal-fg)]">{u.vehicle_callsign || 'PATROL-01'}</strong>
                  </div>
                </div>

                <div className="text-[11px] text-[var(--portal-muted)]">
                  Commander: <strong className="text-[var(--portal-fg)]">{u.commander_name}</strong>{' '}
                  <span className="font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                    ({u.commander_phone})
                  </span>
                </div>

                <div className="pt-1 flex justify-end">
                  {isStandby ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPreselectedUnit(u)
                        setShowDispatchModal(true)
                      }}
                      className="w-full sr-btn-primary py-1.5 text-xs text-white"
                    >
                      ⚡ Rapid Dispatch
                    </button>
                  ) : (
                    <div className="w-full text-center py-1 font-(--font-mono) text-[10px] font-bold text-[var(--portal-muted)] bg-black/20 rounded">
                      UNIT CURRENTLY ENGAGED
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active & Historical Dispatches Table */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <h3 className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)]">
          Live Tactical Dispatches & After-Action Registry
        </h3>

        {dispatches.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--portal-muted)]">
            No tactical squad dispatches recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--portal-fg)]">
              <thead className="border-b border-[color:var(--portal-border)] font-(--font-mono) text-[11px] uppercase text-[var(--portal-dim)] bg-[color:var(--portal-table-header-bg)]">
                <tr>
                  <th className="py-2.5 px-3">Squad</th>
                  <th className="py-2.5 px-3">Target Location</th>
                  <th className="py-2.5 px-3">Mission Objective</th>
                  <th className="py-2.5 px-3">ETA</th>
                  <th className="py-2.5 px-3">Mission Status</th>
                  <th className="py-2.5 px-3">Dispatched At</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--portal-border)]">
                {dispatches.map((d) => {
                  const mStat = MISSION_STATUS_BADGES[d.status] || { label: d.status, color: '#3B82F6', bg: '#3B82F620' }

                  return (
                    <tr
                      key={d.id}
                      className="hover:bg-[color:var(--portal-table-row-hover)] transition cursor-pointer"
                      onClick={() => {
                        setSelectedMission(d)
                        setMissionActionStatus(d.status === 'dispatched' ? 'en_route' : d.status === 'en_route' ? 'on_scene' : 'resolved')
                        setAarNotes(d.after_action_notes || '')
                      }}
                    >
                      <td className="py-3 px-3">
                        <div className="font-(--font-mono) font-bold text-[#00c46a]">{d.unit_code}</div>
                        <div className="text-[10px] text-[var(--portal-muted)]">{d.vehicle_callsign}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-[var(--portal-fg)]">
                        <div>{d.target_location_name}</div>
                        {d.target_lga_name && (
                          <div className="text-[10px] text-[var(--portal-dim)]">{d.target_lga_name}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-[240px]">
                        <div className="text-xs text-[var(--portal-fg)] line-clamp-2">{d.objective}</div>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono) font-bold text-[#F59E0B]">
                        {d.eta_minutes} mins
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: mStat.bg, color: mStat.color }}
                        >
                          {mStat.label}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
                        {new Date(d.dispatched_at).toLocaleTimeString('en-NG')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedMission(d)
                            setMissionActionStatus(d.status === 'dispatched' ? 'en_route' : d.status === 'en_route' ? 'on_scene' : 'resolved')
                            setAarNotes(d.after_action_notes || '')
                          }}
                          className="sr-btn-ghost px-2.5 py-1 text-[11px]"
                        >
                          Manage / AAR
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

      {/* Modal: Dispatch Mission Form */}
      {showDispatchModal && (
        <CreateDispatchModal
          units={units.filter((u) => u.status === 'standby')}
          initialUnit={preselectedUnit}
          onClose={() => setShowDispatchModal(false)}
          onSuccess={() => {
            setShowDispatchModal(false)
            unitsQuery.refetch()
            dispatchesQuery.refetch()
          }}
        />
      )}

      {/* Modal: Mission Update & AAR */}
      {selectedMission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
            <div className="flex items-start justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#EF4444]">
                  TACTICAL MISSION PROGRESS & AAR
                </span>
                <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
                  {selectedMission.unit_code} · {selectedMission.target_location_name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMission(null)}
                className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none"
              >
                &times;
              </button>
            </div>

            <div className="rounded-lg bg-black/30 p-3 border border-[color:var(--portal-border)] space-y-1 text-xs">
              <div className="text-[var(--portal-dim)]">Mission Objective:</div>
              <div className="text-[var(--portal-fg)] font-medium">{selectedMission.objective}</div>
              <div className="text-[11px] text-[var(--portal-muted)] mt-1">
                Commander: <strong>{selectedMission.commander_name}</strong> ({selectedMission.commander_phone})
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Update Mission Status
                </label>
                <select
                  value={missionActionStatus}
                  onChange={(e) => setMissionActionStatus(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                >
                  <option value="en_route">Squad En Route</option>
                  <option value="on_scene">Squad On Scene (Engaged)</option>
                  <option value="resolved">Mission Resolved (Return to Base)</option>
                  <option value="recalled">Recall / Stand Down Squad</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  After-Action Review (AAR) / Situation Notes
                </label>
                <textarea
                  rows={3}
                  value={aarNotes}
                  onChange={(e) => setAarNotes(e.target.value)}
                  placeholder="e.g. Threat neutralized. Crowd dispersed peacefully. 2 arrests made, ballot materials secure. Returning to base."
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
              <button
                type="button"
                onClick={() => setSelectedMission(null)}
                className="sr-btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateMissionMutation.isPending}
                onClick={() =>
                  updateMissionMutation.mutate({
                    id: selectedMission.id,
                    status: missionActionStatus,
                    afterActionNotes: aarNotes,
                  })
                }
                className="sr-btn-primary px-4 py-2 text-xs text-white"
              >
                {updateMissionMutation.isPending ? 'Updating…' : 'Save Status & AAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CreateDispatchModal({
  units,
  initialUnit,
  onClose,
  onSuccess,
}: {
  units: QrfTacticalUnit[]
  initialUnit: QrfTacticalUnit | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [selectedUnitId, setSelectedUnitId] = useState<number | string>(initialUnit?.id || (units[0]?.id ?? ''))
  const [targetLocationName, setTargetLocationName] = useState('')
  const [objective, setObjective] = useState('')
  const [etaMinutes, setEtaMinutes] = useState(15)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      return apiJson('/api/operations/qrf/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          unitId: Number(selectedUnitId),
          targetLocationName,
          objective,
          etaMinutes,
        }),
      })
    },
    onSuccess: () => {
      onSuccess()
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Dispatch failed.')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
        <div className="flex items-center justify-between border-b border-[color:var(--portal-border)] pb-3">
          <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
            Emergency QRF Squad Dispatch
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
              Select Standby Tactical Squad *
            </label>
            <select
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unit_code} — {u.unit_name} ({u.strength_count} men, {u.base_location})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Target Incident Location / Polling Unit *
            </label>
            <input
              type="text"
              required
              value={targetLocationName}
              onChange={(e) => setTargetLocationName(e.target.value)}
              placeholder="e.g. PU 008, Ward 4, Ikeja LGA"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Mission Objective / Directives *
            </label>
            <textarea
              required
              rows={3}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g. Quell ballot box snatching attempt, secure presiding officer, reinforce perimeter security."
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Estimated Time of Arrival (ETA in Minutes)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={etaMinutes}
              onChange={(e) => setEtaMinutes(parseInt(e.target.value, 10) || 15)}
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm font-(--font-mono) text-[var(--portal-fg)] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
          <button type="button" onClick={onClose} className="sr-btn-ghost px-4 py-2 text-xs">
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || !targetLocationName || !objective || !selectedUnitId}
            onClick={() => mutation.mutate()}
            className="sr-btn-primary px-5 py-2 text-xs text-white"
          >
            {mutation.isPending ? 'Mobilizing…' : '⚡ Confirm & Dispatch Squad'}
          </button>
        </div>
      </div>
    </div>
  )
}
