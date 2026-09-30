import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface DeviceTelemetry {
  id: number
  user_id: string
  device_id: string
  battery_level: number
  battery_is_charging: boolean
  network_type: '5G' | '4G' | '3G' | '2G' | 'OFFLINE'
  signal_strength_dbm: number
  gps_lat: number | null
  gps_lng: number | null
  gps_accuracy_meters: number
  app_version: string
  biometric_liveness_score: number
  mock_location_detected: boolean
  last_heartbeat: string
  username: string
  officer_name: string
  service_number: string | null
  pu_name: string | null
  pu_code: string | null
  state_name: string | null
}

export const DeviceTelemetryMonitor: React.FC = () => {
  const queryClient = useQueryClient()
  const [filterNetwork, setFilterNetwork] = useState<string>('all')
  const [simulating, setSimulating] = useState(false)

  // 1. Fetch Devices Telemetry
  const { data, isLoading } = useQuery({
    queryKey: ['officer-device-telemetry', filterNetwork],
    queryFn: async () => {
      return apiJson<{
        summary: {
          totalMonitoredDevices: number
          lowBatteryDevices: number
          offlineOr2G: number
          mockLocationFlags: number
          highLivenessVerified: number
        }
        devices: DeviceTelemetry[]
      }>('/api/technology/telemetry/devices')
    },
    refetchInterval: 10000,
  })

  // 2. Simulate Heartbeat Mutation
  const heartbeatMutation = useMutation({
    mutationFn: async () => {
      return apiJson('/api/technology/telemetry/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: `NPF-TERM-${Math.floor(1000 + Math.random() * 9000)}`,
          batteryLevel: Math.floor(40 + Math.random() * 60),
          batteryIsCharging: false,
          networkType: '4G',
          signalStrengthDbm: -68,
          gpsLat: 9.0765 + (Math.random() - 0.5) * 0.05,
          gpsLng: 7.3986 + (Math.random() - 0.5) * 0.05,
          gpsAccuracyMeters: 4.2,
          biometricLivenessScore: 0.998,
          mockLocationDetected: false,
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['officer-device-telemetry'] })
      setSimulating(false)
    },
  })

  const devices: DeviceTelemetry[] = data?.devices || []
  const summary = data?.summary || {
    totalMonitoredDevices: devices.length,
    lowBatteryDevices: devices.filter((d) => d.battery_level < 20).length,
    offlineOr2G: devices.filter((d) => d.network_type === '2G' || d.network_type === 'OFFLINE').length,
    mockLocationFlags: devices.filter((d) => d.mock_location_detected).length,
    highLivenessVerified: devices.filter((d) => Number(d.biometric_liveness_score) > 0.95).length,
  }

  const filteredDevices =
    filterNetwork === 'all'
      ? devices
      : devices.filter((d) => d.network_type === filterNetwork)

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-emerald-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 shadow-inner text-2xl font-bold">
              📱
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Field Officer Device Telemetry & Biometrics Health
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                  Phase 5
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Real-time terminal battery levels, network connectivity, GPS drift accuracy, and biometric anti-spoofing scores
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setSimulating(true)
              heartbeatMutation.mutate()
            }}
            disabled={simulating || heartbeatMutation.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>📡</span>
            {simulating ? 'Transmitting Heartbeat...' : 'Transmit Device Heartbeat'}
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>📱</span>
              Active Field Terminals
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">
              {summary.totalMonitoredDevices} Devices
            </div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>🔐</span>
              Biometrics Liveness (&gt;95%)
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">
              {summary.highLivenessVerified} Verified
            </div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3.5">
            <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <span>🔋</span>
              Low Battery (&lt;20%) Alert
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-200 tracking-tight">
              {summary.lowBatteryDevices} Units
            </div>
          </div>
          <div className="rounded-xl border border-rose-900/30 bg-rose-950/20 p-3.5">
            <span className="text-xs font-medium text-rose-300 flex items-center gap-1.5">
              <span>⚠</span>
              Mock Location Spoofing
            </span>
            <div className="mt-1 text-2xl font-bold text-rose-200 tracking-tight">
              {summary.mockLocationFlags} Flags
            </div>
          </div>
        </div>
      </div>

      {/* Devices List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>📡</span>
            Terminal Live Health & Biometric Telemetry Roster
          </h3>

          <div className="flex items-center gap-3">
            <select
              value={filterNetwork}
              onChange={(e) => setFilterNetwork(e.target.value)}
              aria-label="Filter by network connectivity"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Network Types</option>
              <option value="5G">5G Ultra-Fast</option>
              <option value="4G">4G LTE High</option>
              <option value="3G">3G Standard</option>
              <option value="2G">2G Edge</option>
              <option value="OFFLINE">Offline Local Cache</option>
            </select>
          </div>
        </div>

        {/* Telemetry Cards Grid */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading field device telemetry...</div>
        ) : filteredDevices.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No active terminal telemetry found. Click &quot;Transmit Device Heartbeat&quot; to ping this terminal.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map((dev) => {
              const lowBat = dev.battery_level < 20
              const livenessPct = Math.round(Number(dev.biometric_liveness_score) * 100)

              return (
                <div
                  key={dev.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 transition-all hover:border-slate-700"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-white text-base">{dev.officer_name}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {dev.service_number || dev.username} · {dev.device_id}
                      </div>
                    </div>

                    <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-300">
                      v{dev.app_version}
                    </span>
                  </div>

                  {/* Battery & Network Meter */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-900 p-2 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-slate-400 text-[11px]">
                        <span>Battery</span>
                        <span className={`font-bold ${lowBat ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {dev.battery_level}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            lowBat ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${dev.battery_level}%` }}
                        />
                      </div>
                    </div>

                    <div className="rounded-lg bg-slate-900 p-2 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-slate-400 text-[11px]">
                        <span>Network</span>
                        <span className="font-bold text-cyan-300 font-mono">{dev.network_type}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        Signal: <strong className="text-slate-200">{dev.signal_strength_dbm} dBm</strong>
                      </div>
                    </div>
                  </div>

                  {/* Biometric & Location Accuracy */}
                  <div className="space-y-1.5 text-xs text-slate-300 border-t border-slate-900 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Biometric Liveness:</span>
                      <span className="font-bold text-emerald-400">{livenessPct}% Anti-Spoof</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">GPS Accuracy:</span>
                      <span className="font-mono text-slate-200">±{dev.gps_accuracy_meters}m</span>
                    </div>

                    {dev.pu_name && (
                      <div className="text-[11px] text-slate-400 line-clamp-1">
                        PU: <span className="text-slate-200">{dev.pu_name}</span> ({dev.pu_code})
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-900 pt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Heartbeat: {new Date(dev.last_heartbeat).toLocaleTimeString()}</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span>●</span> Online Live
                    </span>
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
