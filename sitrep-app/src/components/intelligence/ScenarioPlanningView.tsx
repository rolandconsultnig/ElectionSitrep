import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface ScenarioPlaybook {
  id: number
  slug: string
  title: string
  scenario_type: 'runoff' | 'inconclusive' | 'supplementary' | 'crowd_control' | 'curfew' | 'tribunal_security'
  trigger_conditions: string
  security_doctrine: string
  force_disposition_matrix: Array<{ sector: string; units: number; type: string }>
  rules_of_engagement: string
  communication_channels: string
  checklist_steps: string[]
}

interface ScenarioActivation {
  id: number
  playbook_id: number
  playbook_title: string
  playbook_slug: string
  scenario_type: string
  security_doctrine: string
  rules_of_engagement: string
  communication_channels: string
  default_checklist: string[]
  state_id: number | null
  state_name: string | null
  lga_id: number | null
  lga_name: string | null
  activated_by: string
  activated_by_username: string
  status: 'active' | 'monitoring' | 'deescalated' | 'closed'
  activation_rationale: string
  active_checkpoints_count: number
  completed_steps: string[]
  activated_at: string
  closed_at: string | null
}

export const ScenarioPlanningView: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [selectedPlaybook, setSelectedPlaybook] = useState<ScenarioPlaybook | null>(null)
  const [showActivateModal, setShowActivateModal] = useState(false)

  // Activation form
  const [activationPlaybookId, setActivationPlaybookId] = useState<number | null>(null)
  const [stateId, setStateId] = useState<number | ''>('')
  const [activationRationale, setActivationRationale] = useState('')
  const [checkpointsCount, setCheckpointsCount] = useState(6)

  // 1. Fetch Playbooks
  const { data: playbooksData } = useQuery({
    queryKey: ['scenario-playbooks'],
    queryFn: async () => {
      return apiJson<{ playbooks: ScenarioPlaybook[] }>('/api/intelligence/scenarios/playbooks')
    },
  })

  // 2. Fetch Active Scenario Activations
  const { data: activationsData, isLoading } = useQuery({
    queryKey: ['scenario-activations'],
    queryFn: async () => {
      return apiJson<{ activations: ScenarioActivation[] }>('/api/intelligence/scenarios/activations')
    },
    refetchInterval: 15000,
  })

  // 3. Fetch States
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

  // 4. Activate Scenario Mutation
  const activateMutation = useMutation({
    mutationFn: async (payload: {
      playbookId: number
      electionSlug: string
      stateId: number | null
      activationRationale: string
      activeCheckpointsCount: number
    }) => {
      return apiJson('/api/intelligence/scenarios/activate', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenario-activations'] })
      setShowActivateModal(false)
      setActivationRationale('')
    },
  })

  // 5. Update / Step toggle Mutation
  const updateActivationMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: number
      updates: { status?: string; completedSteps?: string[]; activeCheckpointsCount?: number }
    }) => {
      return apiJson(`/api/intelligence/scenarios/activations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenario-activations'] })
    },
  })

  const playbooks: ScenarioPlaybook[] = playbooksData?.playbooks || []
  const activations: ScenarioActivation[] = activationsData?.activations || []
  const activeCount = activations.filter((a) => a.status === 'active' || a.status === 'monitoring').length

  const handleStepToggle = (activation: ScenarioActivation, step: string) => {
    const current = Array.isArray(activation.completed_steps) ? activation.completed_steps : []
    const updated = current.includes(step) ? current.filter((s) => s !== step) : [...current, step]
    updateActivationMutation.mutate({ id: activation.id, updates: { completedSteps: updated } })
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-amber-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 shadow-inner text-2xl font-bold">
              🧭
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Post-Election Scenario Planning & Doctrine Playbooks
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
                  Phase 3
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Runoff contingencies, supplementary polling protocols, crowd control cordon, and rapid response doctrines
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-slate-800/90 border border-slate-700 px-3.5 py-2 text-xs font-bold text-amber-300 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              {activeCount} Active Operations
            </span>
          </div>
        </div>

        {/* Playbook Overview Pills */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-800/80 pt-4">
          {playbooks.map((pb) => (
            <button
              key={pb.id}
              onClick={() => {
                setSelectedPlaybook(pb)
                setActivationPlaybookId(pb.id)
              }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                selectedPlaybook?.id === pb.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold'
                  : 'bg-slate-800/80 text-slate-300 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              <span>📄</span>
              {pb.title}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Playbook Doctrine Viewer */}
      {selectedPlaybook && (
        <div className="rounded-2xl border border-amber-500/40 bg-slate-900/90 p-5 shadow-xl backdrop-blur-md animate-fade-in space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/30">
                Doctrine: {selectedPlaybook.scenario_type.toUpperCase()}
              </span>
              <h3 className="text-lg font-bold text-white mt-1">{selectedPlaybook.title}</h3>
            </div>
            <button
              onClick={() => {
                setActivationPlaybookId(selectedPlaybook.id)
                setShowActivateModal(true)
              }}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-all cursor-pointer"
            >
              <span>▶</span>
              Activate Doctrine on State / Sector
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <span>⚠</span>
                Trigger Conditions
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">{selectedPlaybook.trigger_conditions}</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <span>🛡</span>
                Rules of Engagement (ROE)
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">{selectedPlaybook.rules_of_engagement}</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <span>📡</span>
                Communications & Frequencies
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">{selectedPlaybook.communication_channels}</p>
            </div>
          </div>

          {/* Force Disposition Grid */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
              <span>◈</span>
              Force Disposition Matrix
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {Array.isArray(selectedPlaybook.force_disposition_matrix) &&
                selectedPlaybook.force_disposition_matrix.map((f, idx) => (
                  <div key={idx} className="rounded-lg bg-slate-900 border border-slate-800 p-2.5 text-xs">
                    <div className="font-bold text-white">{f.sector}</div>
                    <div className="text-amber-400 font-semibold mt-0.5">
                      {f.units} Units — <span className="text-slate-300">{f.type}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Operational Activations Board */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <span>⚡</span>
          Live Scenario Deployments & Operational Checklists
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading active scenario deployments...</div>
        ) : activations.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No live scenario doctrines currently active. Select a playbook above to initiate emergency response.
          </div>
        ) : (
          <div className="space-y-4">
            {activations.map((act) => {
              const isActive = act.status === 'active' || act.status === 'monitoring'
              const completed = Array.isArray(act.completed_steps) ? act.completed_steps : []
              const checklist = Array.isArray(act.default_checklist) ? act.default_checklist : []
              const progressPct = checklist.length > 0 ? Math.round((completed.length / checklist.length) * 100) : 0

              return (
                <div
                  key={act.id}
                  className={`rounded-xl border p-5 transition-all ${
                    isActive
                      ? 'border-amber-500/40 bg-slate-950/80 shadow-lg'
                      : 'border-slate-800 bg-slate-950/40 opacity-70'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 border border-amber-500/30">
                          {act.scenario_type}
                        </span>
                        <h4 className="font-bold text-white text-base">{act.playbook_title}</h4>
                        {act.state_name && (
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-300">
                            {act.state_name} State
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Rationale: <strong className="text-slate-200">{act.activation_rationale}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                        <span>⏱</span>
                        {new Date(act.activated_at).toLocaleTimeString()}
                      </span>
                      {isActive && (
                        <button
                          onClick={() =>
                            updateActivationMutation.mutate({
                              id: act.id,
                              updates: { status: 'deescalated' },
                            })
                          }
                          className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer"
                        >
                          <span>⏹</span>
                          De-escalate & Stand Down
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Checklist & Checkpoints Progress */}
                  <div className="border-t border-slate-900 pt-3 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">
                        Operational Checklist Execution ({completed.length}/{checklist.length} steps)
                      </span>
                      <span className="font-bold text-amber-400">{progressPct}% Completed</span>
                    </div>

                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {checklist.map((step, idx) => {
                        const isDone = completed.includes(step)
                        return (
                          <button
                            key={idx}
                            onClick={() => handleStepToggle(act, step)}
                            disabled={!isActive}
                            className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
                              isDone
                                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
                                : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <span className="shrink-0 mt-0.5 font-bold">
                              {isDone ? '☑' : '☐'}
                            </span>
                            <span className={isDone ? 'line-through text-slate-400' : 'text-slate-200'}>
                              {step}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Activate Scenario Modal */}
      {showActivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>🧭</span>
              Deploy & Activate Doctrine Playbook
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Authorize field commands to execute contingency doctrines and set up tactical perimeters.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!activationPlaybookId || !activationRationale) return
                activateMutation.mutate({
                  playbookId: activationPlaybookId,
                  electionSlug,
                  stateId: stateId === '' ? null : Number(stateId),
                  activationRationale,
                  activeCheckpointsCount: checkpointsCount,
                })
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target State Command</label>
                <select
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value === '' ? '' : Number(e.target.value))}
                  aria-label="Select Target State Command"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Active Static Checkpoints / Cordons
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={checkpointsCount}
                  onChange={(e) => setCheckpointsCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Activation Rationale & Operational Order *
                </label>
                <textarea
                  value={activationRationale}
                  onChange={(e) => setActivationRationale(e.target.value)}
                  required
                  rows={3}
                  placeholder="e.g. INEC declares supplementary poll in 14 PUs; activate 300m perimeter and Joint QRF escort."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowActivateModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={activateMutation.isPending}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/30 hover:bg-amber-400 transition-all cursor-pointer disabled:opacity-50"
                >
                  {activateMutation.isPending ? 'Authorizing...' : 'Authorize Deployment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
