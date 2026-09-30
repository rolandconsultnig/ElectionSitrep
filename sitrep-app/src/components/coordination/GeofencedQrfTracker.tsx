import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface GeofenceRule {
  id: number
  name: string
  min_severity: string
  max_radius_km: number
  auto_dispatch_enabled: boolean
  alert_agencies: string[]
  is_active: boolean
}

interface MatchedUnit {
  id: number
  unit_code: string
  callsign: string
  unit_type: string
  commander_name: string
  commander_phone: string
  personnel_count: number
  vehicles_count: number
  state_name: string | null
  lga_name: string | null
  current_lat: number | null
  current_lng: number | null
  distanceKm: number
  withinGeofence: boolean
}

export const GeofencedQrfTracker: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [targetLat, setTargetLat] = useState<number>(9.0765) // Default Abuja/Central
  const [targetLng, setTargetLng] = useState<number>(7.3986)
  const [radiusKm, setRadiusKm] = useState<number>(15)
  const [severity, setSeverity] = useState<string>('critical')
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null)

  // 1. Fetch Geofence Rules
  const { data: rulesData } = useQuery({
    queryKey: ['geofence-rules'],
    queryFn: async () => {
      return apiJson<{ rules: GeofenceRule[] }>('/api/coordination/geofence/rules')
    },
  })

  // 2. Fetch/Match Nearest Tactical Units
  const { data: matchData, isLoading, refetch } = useQuery({
    queryKey: ['geofence-match', targetLat, targetLng, radiusKm, severity],
    queryFn: async () => {
      return apiJson<{
        matchedUnitsCount: number
        units: MatchedUnit[]
      }>('/api/coordination/geofence/match', {
        method: 'POST',
        body: JSON.stringify({
          lat: targetLat,
          lng: targetLng,
          radiusKm,
          severity,
        }),
      })
    },
  })

  // 3. Dispatch Unit Mutation
  const dispatchMutation = useMutation({
    mutationFn: async (payload: { unitId: number; priority: string; taskingNotes: string }) => {
      return apiJson('/api/operations/qrf/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          electionSlug,
          unitId: payload.unitId,
          priority: payload.priority,
          taskingNotes: payload.taskingNotes,
          targetLat,
          targetLng,
        }),
      })
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['geofence-match'] })
      queryClient.invalidateQueries({ queryKey: ['qrf-dispatches'] })
      setDispatchSuccess(`Tactical unit dispatched! Record #${data?.dispatch?.id || 'OK'}`)
      setTimeout(() => setDispatchSuccess(null), 4000)
    },
  })

  const rules: GeofenceRule[] = rulesData?.rules || []
  const units: MatchedUnit[] = matchData?.units || []
  const matchedCount = matchData?.matchedUnitsCount || 0

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-cyan-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40 shadow-inner text-2xl font-bold">
              🎯
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Geofenced QRF Proximity Interceptor & Triangulation
                <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-500/30">
                  Phase 4
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Automated radial force triangulation and rapid incident interception to nearest standby strike teams
              </p>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-600/30 hover:bg-cyan-500 transition-all cursor-pointer"
          >
            <span>🔄</span>
            Re-calculate Triangulation
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>🎯</span>
              Matched Units in Radius
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">
              {matchedCount} Units ({radiusKm}km)
            </div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>⚡</span>
              Nearest Response Strike
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">
              {units.length > 0 ? `${units[0].distanceKm} km` : 'N/A'}
            </div>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-3.5">
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
              <span>🛡</span>
              Active Geofence Policies
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-200 tracking-tight">
              {rules.length} Policies
            </div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3.5">
            <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <span>⏱</span>
              Estimated Intercept Time
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-200 tracking-tight">
              {units.length > 0 ? `${Math.max(3, Math.round(units[0].distanceKm * 1.5))} mins` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {dispatchSuccess && (
        <div className="rounded-xl bg-emerald-500/20 border border-emerald-500/50 p-4 text-sm font-bold text-emerald-200 animate-fade-in flex items-center gap-2">
          <span>✓</span>
          {dispatchSuccess}
        </div>
      )}

      {/* Target Triangulation Controls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <span>📍</span>
          Incident Coordinates & Radial Threshold Configuration
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Incident Latitude</label>
            <input
              type="number"
              step="0.0001"
              value={targetLat}
              onChange={(e) => setTargetLat(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Incident Longitude</label>
            <input
              type="number"
              step="0.0001"
              value={targetLng}
              onChange={(e) => setTargetLng(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Max Intercept Radius (km)</label>
            <input
              type="number"
              min="1"
              max="100"
              value={radiusKm}
              onChange={(e) => setRadiusKm(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Threat Tier</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Threat Tier"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-500"
            >
              <option value="critical">Critical (Ballot Hijack / Weapons)</option>
              <option value="high">High (Violent Mob / BVAS Snatch)</option>
              <option value="medium">Medium (Disorder)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Triangulated Proximity List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <span>⚡</span>
          Nearest Standby Tactical Units & Intercept Proximity
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Calculating radial distances to tactical strike units...</div>
        ) : units.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No standby tactical strike units found in the operational database.
          </div>
        ) : (
          <div className="space-y-3">
            {units.map((unit) => {
              const inside = unit.withinGeofence
              const estTime = Math.max(3, Math.round(unit.distanceKm * 1.5))

              return (
                <div
                  key={unit.id}
                  className={`rounded-xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    inside
                      ? 'border-cyan-500/50 bg-cyan-950/20'
                      : 'border-slate-800 bg-slate-950/40 opacity-70'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-cyan-400">
                        {unit.unit_code}
                      </span>
                      <h4 className="font-bold text-white text-base">{unit.callsign}</h4>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                        {unit.unit_type}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          inside
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {inside ? 'WITHIN GEOFENCE' : 'OUTSIDE RADIUS'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 flex items-center gap-4 pt-1">
                      <span>
                        Commander: <strong className="text-slate-200">{unit.commander_name}</strong> ({unit.commander_phone})
                      </span>
                      <span>
                        Strength: <strong className="text-slate-200">{unit.personnel_count} Officers</strong>, {unit.vehicles_count} Vehicles
                      </span>
                    </div>
                  </div>

                  {/* Distance and Dispatch CTA */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-lg font-bold text-cyan-300 font-mono">
                        {unit.distanceKm} km
                      </div>
                      <div className="text-[11px] text-slate-400 font-semibold">
                        ~{estTime} mins ETA
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        dispatchMutation.mutate({
                          unitId: unit.id,
                          priority: severity,
                          taskingNotes: `Immediate Geofenced Intercept at coordinates (${targetLat}, ${targetLng})`,
                        })
                      }
                      disabled={dispatchMutation.isPending}
                      className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition-all cursor-pointer shadow-md shadow-cyan-600/30"
                    >
                      <span>⚡</span>
                      Dispatch Unit Now
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
