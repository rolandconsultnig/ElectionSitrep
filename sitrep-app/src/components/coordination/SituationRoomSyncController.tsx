import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface SyncState {
  id: number
  active_layout: 'split_tactical' | 'full_map_hotspots' | 'sitrep_ticker' | 'results_wall' | 'inter_agency_matrix'
  active_state_id: number | null
  audio_alerts_enabled: boolean
  controller_username: string | null
  controller_name: string | null
  updated_at: string
}

export const SituationRoomSyncController: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [activeLayout, setActiveLayout] = useState<SyncState['active_layout']>('split_tactical')
  const [activeStateId, setActiveStateId] = useState<number | ''>('')
  const [audioAlerts, setAudioAlerts] = useState<boolean>(true)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // 1. Fetch Sync State
  const { data, isLoading } = useQuery({
    queryKey: ['situation-room-sync'],
    queryFn: async () => {
      const res = await apiJson<{ sync: SyncState }>('/api/coordination/situation-room/sync')
      if (res?.sync) {
        setActiveLayout(res.sync.active_layout)
        setActiveStateId(res.sync.active_state_id ?? '')
        setAudioAlerts(res.sync.audio_alerts_enabled)
      }
      return res.sync
    },
    refetchInterval: 8000,
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

  // 3. Update Sync Mutation
  const syncMutation = useMutation({
    mutationFn: async (payload: {
      activeLayout: string
      activeStateId: number | null
      audioAlertsEnabled: boolean
    }) => {
      return apiJson('/api/coordination/situation-room/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['situation-room-sync'] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
  })

  const sync = data || {
    active_layout: 'split_tactical',
    active_state_id: null,
    audio_alerts_enabled: true,
    controller_username: null,
    controller_name: null,
    updated_at: new Date().toISOString(),
  }

  const LAYOUTS = [
    {
      id: 'split_tactical',
      label: 'Split Tactical Command',
      icon: '⊞',
      desc: 'Dual-panel operations map alongside real-time critical flash signals feed',
    },
    {
      id: 'full_map_hotspots',
      label: 'National Hotspot Density',
      icon: '🗺',
      desc: 'Fullscreen geographic heatmap of all polling unit threat clusters',
    },
    {
      id: 'sitrep_ticker',
      label: 'Live Incident Ticker Wall',
      icon: '📡',
      desc: 'High-density situation stream with automated priority siren alerts',
    },
    {
      id: 'results_wall',
      label: 'Collation & Results Matrix',
      icon: '📊',
      desc: 'Real-time party vote collation and state-by-state return breakdown',
    },
    {
      id: 'inter_agency_matrix',
      label: 'Inter-Agency Taskforce Board',
      icon: '🏛',
      desc: 'Military, Police, NSCDC, and DSS joint asset deployments across sectors',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-purple-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40 shadow-inner text-2xl font-bold">
              📺
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Operations Situation Room Video Wall Synchronizer
                <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-300 border border-purple-500/30">
                  Phase 4
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Centralized wall layout control, synchronized audio sirens, and real-time screen orchestration
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/situation-room"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700 transition-all cursor-pointer"
            >
              <span>📺</span>
              Open Situation Room 1
            </a>
            <a
              href="/svg-monitor"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-500 transition-all cursor-pointer shadow-md shadow-purple-600/30"
            >
              <span>🖥</span>
              Open Large Screen Wall
            </a>
          </div>
        </div>

        {/* Sync State Status */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Last Controlled By:{' '}
              <strong className="text-purple-300 font-semibold">
                {sync.controller_name || sync.controller_username || 'FHQ Operations Desk'}
              </strong>
            </span>
            <span>
              Last Wall Update:{' '}
              <strong className="text-slate-300">
                {new Date(sync.updated_at).toLocaleTimeString()}
              </strong>
            </span>
          </div>

          {saveSuccess && (
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-1 font-bold text-emerald-300 border border-emerald-500/40 animate-fade-in">
              ✓ Video Wall Synchronized Across All Situation Room Screens
            </span>
          )}
        </div>
      </div>

      {/* Synchronizer Controls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-6">
        <div>
          <h3 className="text-base font-bold text-white mb-1">
            Active Video Wall Layout Mode
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Changing this layout will broadcast a live WebSocket event to instantly switch video walls and situation room terminals nationwide.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LAYOUTS.map((item) => {
              const isSelected = activeLayout === item.id

              return (
                <div
                  key={item.id}
                  onClick={() => setActiveLayout(item.id as any)}
                  className={`rounded-xl border p-4 transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'border-purple-500 bg-purple-950/30 shadow-lg ring-1 ring-purple-500/40'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{item.icon}</span>
                    <span
                      className={`h-3 w-3 rounded-full ${
                        isSelected ? 'bg-purple-400 animate-pulse' : 'bg-slate-700'
                      }`}
                    />
                  </div>
                  <h4 className="font-bold text-white text-sm">{item.label}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* State Command Lock & Audio Siren */}
        <div className="border-t border-slate-800 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Synchronized State Focus (Optional)
            </label>
            <select
              value={activeStateId}
              onChange={(e) => setActiveStateId(e.target.value === '' ? '' : Number(e.target.value))}
              aria-label="Select Synchronized State Focus"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Nationwide Multi-State Overview</option>
              {statesData?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <input
              type="checkbox"
              id="audioCheck"
              checked={audioAlerts}
              onChange={(e) => setAudioAlerts(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="audioCheck" className="text-sm font-semibold text-slate-300 cursor-pointer">
              Enable Priority Siren Audio Alerts on Situation Room Walls
            </label>
          </div>
        </div>

        {/* Apply Synchronization CTA */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-end">
          <button
            onClick={() =>
              syncMutation.mutate({
                activeLayout,
                activeStateId: activeStateId === '' ? null : Number(activeStateId),
                audioAlertsEnabled: audioAlerts,
              })
            }
            disabled={syncMutation.isPending || isLoading}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-600/30 hover:bg-purple-500 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>📡</span>
            {syncMutation.isPending ? 'Synchronizing Screens...' : 'Apply & Broadcast Wall State'}
          </button>
        </div>
      </div>
    </div>
  )
}
