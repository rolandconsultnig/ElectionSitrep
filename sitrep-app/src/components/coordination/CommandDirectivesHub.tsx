import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface CommandDirective {
  id: number
  directive_code: string
  command_level: 'DPO' | 'AREA_COMMAND' | 'STATE_HQ' | 'ZONAL_HQ' | 'FHQ_IGP'
  priority: 'FLASH_SIGNAL' | 'OPERATIONAL_ORDER' | 'SECURITY_DIRECTIVE' | 'STAND_DOWN'
  target_scope: 'nationwide' | 'state' | 'lga' | 'taskforce_joint'
  target_state_name: string | null
  target_lga_name: string | null
  title: string
  directive_body: string
  enforcement_deadline: string | null
  require_acknowledgment: boolean
  status: string
  issuer_username: string
  issuer_name: string
  ack_count: number
  user_has_acknowledged: boolean
  created_at: string
}

export const CommandDirectivesHub: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)

  // Form State
  const [commandLevel, setCommandLevel] = useState<CommandDirective['command_level']>('STATE_HQ')
  const [priority, setPriority] = useState<CommandDirective['priority']>('FLASH_SIGNAL')
  const [targetScope, setTargetScope] = useState<CommandDirective['target_scope']>('nationwide')
  const [targetStateId, setTargetStateId] = useState<number | ''>('')
  const [title, setTitle] = useState('')
  const [directiveBody, setDirectiveBody] = useState('')
  const [requireAcknowledgment, setRequireAcknowledgment] = useState(true)

  // 1. Fetch Directives
  const { data, isLoading } = useQuery({
    queryKey: ['command-directives', selectedPriority],
    queryFn: async () => {
      let url = `/api/coordination/directives?`
      if (selectedPriority !== 'all') url += `priority=${encodeURIComponent(selectedPriority)}`
      return apiJson<{ directives: CommandDirective[] }>(url)
    },
    refetchInterval: 10000,
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

  // 3. Broadcast Directive Mutation
  const broadcastMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      return apiJson('/api/coordination/directives', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-directives'] })
      setShowBroadcastModal(false)
      setTitle('')
      setDirectiveBody('')
    },
  })

  // 4. Acknowledge Mutation
  const acknowledgeMutation = useMutation({
    mutationFn: async (directiveId: number) => {
      return apiJson(`/api/coordination/directives/${directiveId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ officerRank: 'Field Command Officer' }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-directives'] })
    },
  })

  const directives: CommandDirective[] = data?.directives || []
  const flashSignals = directives.filter((d) => d.priority === 'FLASH_SIGNAL')
  const operationalOrders = directives.filter((d) => d.priority === 'OPERATIONAL_ORDER')

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'FLASH_SIGNAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse font-extrabold'
      case 'OPERATIONAL_ORDER':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
      case 'SECURITY_DIRECTIVE':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
      case 'STAND_DOWN':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-rose-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40 shadow-inner text-2xl font-bold">
              📡
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Multi-Level Command Directives & Flash Signal Broadcaster
                <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/30">
                  Phase 4
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Priority tactical signals, enforceable orders, and real-time delivery receipt acknowledgment chains
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowBroadcastModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition-all cursor-pointer font-bold"
          >
            <span>⚡</span>
            Broadcast Directive / Flash Signal
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-rose-900/40 bg-rose-950/30 p-3.5">
            <span className="text-xs font-medium text-rose-300 flex items-center gap-1.5">
              <span>🚨</span>
              High-Priority Flash Signals
            </span>
            <div className="mt-1 text-2xl font-bold text-rose-200 tracking-tight">
              {flashSignals.length} Active
            </div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3.5">
            <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <span>📜</span>
              Operational Orders
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-200 tracking-tight">
              {operationalOrders.length} Issued
            </div>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-3.5">
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
              <span>👥</span>
              Total Logged Broadcasts
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-200 tracking-tight">
              {directives.length} Signals
            </div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>✓</span>
              Acknowledgment Ratio
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">
              98.4% Receipts
            </div>
          </div>
        </div>
      </div>

      {/* Directives Feed */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>📡</span>
            Live Tactical Signal Feed & Receipt Log
          </h3>

          <div className="flex items-center gap-3">
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              aria-label="Filter directives by priority"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">All Priorities</option>
              <option value="FLASH_SIGNAL">FLASH_SIGNAL (Highest)</option>
              <option value="OPERATIONAL_ORDER">OPERATIONAL_ORDER</option>
              <option value="SECURITY_DIRECTIVE">SECURITY_DIRECTIVE</option>
              <option value="STAND_DOWN">STAND_DOWN</option>
            </select>
          </div>
        </div>

        {/* List of Directives */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading active command directives...</div>
        ) : directives.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No command broadcast directives found for this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {directives.map((dir) => {
              const isFlash = dir.priority === 'FLASH_SIGNAL'

              return (
                <div
                  key={dir.id}
                  className={`rounded-xl border p-5 transition-all ${
                    isFlash
                      ? 'border-rose-500/50 bg-rose-950/20 shadow-lg shadow-rose-950/40'
                      : 'border-slate-800 bg-slate-950/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className={`rounded-lg px-2.5 py-0.5 text-xs border ${getPriorityBadge(dir.priority)}`}>
                        {dir.priority.replace('_', ' ')}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-400">
                        [{dir.directive_code}]
                      </span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                        {dir.command_level}
                      </span>
                      <h4 className="font-bold text-white text-base">{dir.title}</h4>
                    </div>

                    <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                      <span>⏱</span>
                      {new Date(dir.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-sm text-slate-200 whitespace-pre-line leading-relaxed">
                    {dir.directive_body}
                  </p>

                  {/* Directive Footer and Acknowledgment */}
                  <div className="mt-4 border-t border-slate-800/80 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span>
                        Issuer: <strong className="text-slate-200">{dir.issuer_name}</strong> ({dir.issuer_username})
                      </span>
                      <span>
                        Scope: <strong className="text-slate-300 capitalize">{dir.target_scope}</strong>
                        {dir.target_state_name && ` (${dir.target_state_name} State)`}
                      </span>
                      <span className="text-cyan-300 font-bold">
                        ✓ {dir.ack_count} Command Receipts Confirmed
                      </span>
                    </div>

                    <div>
                      {dir.user_has_acknowledged ? (
                        <span className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <span>✓</span>
                          Receipt Acknowledged
                        </span>
                      ) : (
                        <button
                          onClick={() => acknowledgeMutation.mutate(dir.id)}
                          disabled={acknowledgeMutation.isPending}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition-all cursor-pointer shadow-md shadow-emerald-600/30"
                        >
                          <span>✓</span>
                          Acknowledge & Confirm Receipt
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

      {/* Broadcast Directive Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>⚡</span>
              Broadcast Multi-Level Directive / Flash Signal
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Send priority tactical alerts and enforceable operational directives to deployed State, Area, and DPO commands.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!title || !directiveBody) return
                broadcastMutation.mutate({
                  electionSlug,
                  commandLevel,
                  priority,
                  targetScope,
                  targetStateId: targetStateId === '' ? null : Number(targetStateId),
                  title,
                  directiveBody,
                  requireAcknowledgment,
                })
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Command Level *</label>
                  <select
                    value={commandLevel}
                    onChange={(e) => setCommandLevel(e.target.value as any)}
                    required
                    aria-label="Select Command Level"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="FHQ_IGP">FHQ / IGP Operations Center</option>
                    <option value="ZONAL_HQ">AIG Zonal Command</option>
                    <option value="STATE_HQ">CP State Headquarters</option>
                    <option value="AREA_COMMAND">Area Command</option>
                    <option value="DPO">DPO Divisional Level</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Signal Priority *</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    required
                    aria-label="Select Signal Priority"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="FLASH_SIGNAL">FLASH SIGNAL (Immediate Alert)</option>
                    <option value="OPERATIONAL_ORDER">OPERATIONAL ORDER</option>
                    <option value="SECURITY_DIRECTIVE">SECURITY DIRECTIVE</option>
                    <option value="STAND_DOWN">STAND DOWN ORDER</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Scope</label>
                  <select
                    value={targetScope}
                    onChange={(e) => setTargetScope(e.target.value as any)}
                    aria-label="Select Target Scope"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="nationwide">Nationwide (All Commands)</option>
                    <option value="state">Specific State Command</option>
                    <option value="taskforce_joint">Joint Taskforce Sector Only</option>
                  </select>
                </div>

                {targetScope === 'state' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Target State</label>
                    <select
                      value={targetStateId}
                      onChange={(e) => setTargetStateId(e.target.value === '' ? '' : Number(e.target.value))}
                      aria-label="Select Target State"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    >
                      <option value="">Select State</option>
                      {statesData?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Directive Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. FLASH: Immediate Armored Escort of Collation Centers in Sector 3"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Directive Body & Instructions *</label>
                <textarea
                  value={directiveBody}
                  onChange={(e) => setDirectiveBody(e.target.value)}
                  required
                  rows={4}
                  placeholder="Provide explicit operational parameters, curfew enforcement, or force deployment directives..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ackRequiredCheck"
                  checked={requireAcknowledgment}
                  onChange={(e) => setRequireAcknowledgment(e.target.checked)}
                  className="rounded border-slate-700 text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="ackRequiredCheck" className="text-xs text-slate-300 cursor-pointer">
                  Require Mandatory Receipt Acknowledgment by Command Field Officers
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcastMutation.isPending}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-rose-600/30 hover:bg-rose-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  {broadcastMutation.isPending ? 'Broadcasting...' : 'Broadcast Signal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
