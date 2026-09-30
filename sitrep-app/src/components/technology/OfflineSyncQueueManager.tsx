import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface ConflictRecord {
  id: number
  client_id: string
  user_id: string
  username: string
  officer_name: string
  entity_type: string
  server_payload: Record<string, any>
  client_payload: Record<string, any>
  resolution_strategy: 'server_wins' | 'client_wins' | 'manual_merged'
  resolved_at: string
}

export const OfflineSyncQueueManager: React.FC = () => {
  const queryClient = useQueryClient()
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [strategy, setStrategy] = useState<'server_wins' | 'client_wins' | 'manual_merged'>('server_wins')

  // 1. Fetch Telemetry
  const { data, isLoading } = useQuery({
    queryKey: ['offline-sync-telemetry'],
    queryFn: async () => {
      return apiJson<{
        queueMetrics: {
          totalCaptured: number
          withPhotos: number
          lastSyncAt: string | null
        }
        conflicts: ConflictRecord[]
      }>('/api/technology/offline-sync/telemetry')
    },
    refetchInterval: 10000,
  })

  // 2. Resolve Conflict Mutation
  const resolveMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return apiJson('/api/technology/offline-sync/resolve', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offline-sync-telemetry'] })
      setShowResolveModal(false)
    },
  })

  const metrics = data?.queueMetrics || { totalCaptured: 0, withPhotos: 0, lastSyncAt: null }
  const conflicts: ConflictRecord[] = data?.conflicts || []

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 shadow-inner text-2xl font-bold">
              🔄
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Offline Sync & Multi-Master Conflict Resolution
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
                  Phase 5
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                IndexedDB outbox telemetry, idempotent deduplication, and payload conflict resolution
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>📦</span>
              Synced Outbox Records
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">
              {metrics.totalCaptured.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-3.5">
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
              <span>📷</span>
              Photo Attachments Processed
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-200 tracking-tight">
              {metrics.withPhotos.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>✓</span>
              Last Queue Ingestion
            </span>
            <div className="mt-1 text-lg font-bold text-emerald-200 tracking-tight truncate">
              {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleTimeString() : 'Active Standby'}
            </div>
          </div>
          <div className="rounded-xl border border-rose-900/30 bg-rose-950/20 p-3.5">
            <span className="text-xs font-medium text-rose-300 flex items-center gap-1.5">
              <span>⚠</span>
              Resolved Sync Conflicts
            </span>
            <div className="mt-1 text-2xl font-bold text-rose-200 tracking-tight">
              {conflicts.length}
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <span>⚙</span>
          Multi-Master Sync Resolution History & Diff Inspector
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading conflict resolution ledger...</div>
        ) : conflicts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No synchronization conflicts encountered. All offline captures merged idempotently without data collisions.
          </div>
        ) : (
          <div className="space-y-3">
            {conflicts.map((conf) => (
              <div
                key={conf.id}
                onClick={() => {
                  setSelectedConflict(conf)
                  setShowResolveModal(true)
                }}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700 cursor-pointer space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      [{conf.client_id}]
                    </span>
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300 uppercase">
                      {conf.entity_type}
                    </span>
                    <span className="text-sm font-bold text-white">{conf.officer_name}</span>
                  </div>

                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                    Strategy: {conf.resolution_strategy.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div className="rounded-lg bg-slate-900 p-2.5 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Server Payload State</div>
                    <pre className="text-slate-300 overflow-x-auto font-mono text-[11px]">
                      {JSON.stringify(conf.server_payload, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-lg bg-slate-900 p-2.5 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Client Offline Submission</div>
                    <pre className="text-slate-300 overflow-x-auto font-mono text-[11px]">
                      {JSON.stringify(conf.client_payload, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Resolve Modal */}
      {showResolveModal && selectedConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>⚖</span>
              Sync Conflict Resolution Policy
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Apply conflict resolution rule for client capture ID: <span className="font-mono text-amber-300">{selectedConflict.client_id}</span>
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                resolveMutation.mutate({
                  clientId: selectedConflict.client_id,
                  userId: selectedConflict.user_id,
                  entityType: selectedConflict.entity_type,
                  serverPayload: selectedConflict.server_payload,
                  clientPayload: selectedConflict.client_payload,
                  resolutionStrategy: strategy,
                })
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Resolution Strategy *</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as any)}
                  aria-label="Resolution Strategy"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="server_wins">Server Wins (Preserve canonical server record)</option>
                  <option value="client_wins">Client Wins (Override with offline device data)</option>
                  <option value="manual_merged">Manual Merged (Concatenate changes)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolveMutation.isPending}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-all cursor-pointer disabled:opacity-50"
                >
                  {resolveMutation.isPending ? 'Applying...' : 'Apply Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
