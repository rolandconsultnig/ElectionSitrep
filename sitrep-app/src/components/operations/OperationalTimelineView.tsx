import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type OperationalMilestoneKey =
  | 'materials_received'
  | 'polls_opened'
  | 'accreditation_started'
  | 'voting_closed'
  | 'counting_started'
  | 'results_declared'

export const MILESTONES_CONFIG: {
  key: OperationalMilestoneKey
  label: string
  icon: string
  description: string
  color: string
}[] = [
  {
    key: 'materials_received',
    label: 'Materials Received',
    icon: '📦',
    description: 'Sensitive materials & BVAS arrived at PU from RAC',
    color: '#3B82F6',
  },
  {
    key: 'polls_opened',
    label: 'Polls Opened',
    icon: '🚪',
    description: 'INEC ad-hoc staff present and polling station active',
    color: '#10B981',
  },
  {
    key: 'accreditation_started',
    label: 'Accreditation & Voting',
    icon: '👥',
    description: 'BVAS voter authentication and ballot issuing in progress',
    color: '#F59E0B',
  },
  {
    key: 'voting_closed',
    label: 'Voting Closed',
    icon: '🛑',
    description: 'Queue cutoff executed and official voting concluded',
    color: '#8B5CF6',
  },
  {
    key: 'counting_started',
    label: 'Sorting & Counting',
    icon: '🔢',
    description: 'Ballot sorting and manual count commenced in public view',
    color: '#EC4899',
  },
  {
    key: 'results_declared',
    label: 'Results Declared (EC8A)',
    icon: '📜',
    description: 'Form EC8A completed, signed, pasted and uploaded',
    color: '#00c46a',
  },
]

type TimelineSummary = {
  election: { id: string; name: string; slug: string }
  totalPus: number
  milestones: Record<
    OperationalMilestoneKey,
    { count: number; percent: number; lastUpdated: string | null }
  >
  recentUpdates: {
    id: number
    milestone: OperationalMilestoneKey
    timestamp: string
    notes: string
    pu_code: string
    pu_name: string
    ward_name: string
    lga_name: string
    state_name: string
    officer_name: string
  }[]
}

export function OperationalTimelineSummaryView({
  electionSlug,
  stateId,
  lgaId,
}: {
  electionSlug?: string
  stateId?: number
  lgaId?: number
}) {
  const { data, isLoading, isError, refetch } = useQuery<TimelineSummary>({
    queryKey: ['timeline-summary', electionSlug, stateId, lgaId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (electionSlug) params.set('electionSlug', electionSlug)
      if (stateId) params.set('stateId', String(stateId))
      if (lgaId) params.set('lgaId', String(lgaId))
      return apiJson<TimelineSummary>(`/api/operations/timeline/summary?${params.toString()}`)
    },
    refetchInterval: 10_000,
  })

  if (isLoading) {
    return (
      <div className="sr-card flex items-center justify-center p-12 text-sm text-[var(--portal-muted)]">
        <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-[#00c46a] border-t-transparent"></span>
        Loading Election Day Operational Timeline…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="sr-card border-red-500/30 p-6 text-sm text-red-400">
        Failed to load operational timeline summary.
        <button
          onClick={() => refetch()}
          className="ml-3 font-semibold text-[#00c46a] underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const { totalPus, milestones, recentUpdates } = data

  return (
    <div className="space-y-6">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {MILESTONES_CONFIG.map((cfg) => {
          const stat = milestones[cfg.key] || { count: 0, percent: 0 }
          return (
            <div
              key={cfg.key}
              className="sr-card relative overflow-hidden border-[color:var(--portal-border)] p-4 transition hover:border-[#00c46a]/40"
            >
              <div
                className="absolute top-0 left-0 h-1 w-full"
                style={{ backgroundColor: cfg.color }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xl">{cfg.icon}</span>
                <span
                  className="font-(--font-mono) text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                >
                  {stat.percent}%
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-[var(--portal-fg)]">
                  {stat.count.toLocaleString()}
                </div>
                <div className="font-(--font-syne) text-xs font-semibold text-[var(--portal-fg)]">
                  {cfg.label}
                </div>
                <div className="mt-1 text-[11px] text-[var(--portal-muted)] line-clamp-1">
                  of {totalPus.toLocaleString()} PUs
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--portal-border)]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, stat.percent)}%`, backgroundColor: cfg.color }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress Rollup Breakdown */}
      <div className="sr-card border-[color:var(--portal-border)] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[color:var(--portal-border)] pb-4">
          <div>
            <h2 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
              Operational Milestone Pipeline Roll-up
            </h2>
            <p className="text-xs text-[var(--portal-muted)]">
              Sequential polling unit readiness & lifecycle tracking across jurisdiction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#00c46a] animate-ping" />
            <span className="font-(--font-mono) text-xs text-[#00c46a]">LIVE TELEMETRY</span>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {MILESTONES_CONFIG.map((cfg, idx) => {
            const stat = milestones[cfg.key] || { count: 0, percent: 0, lastUpdated: null }
            return (
              <div key={cfg.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="font-(--font-mono) text-[11px] font-bold text-[var(--portal-dim)]">
                      0{idx + 1}
                    </span>
                    <span className="text-base">{cfg.icon}</span>
                    <span className="font-semibold text-[var(--portal-fg)]">{cfg.label}</span>
                    <span className="hidden md:inline text-[11px] text-[var(--portal-muted)]">
                      · {cfg.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-(--font-mono)">
                    <span className="text-[var(--portal-muted)]">
                      {stat.count.toLocaleString()} / {totalPus.toLocaleString()} PUs
                    </span>
                    <span className="font-bold text-[var(--portal-fg)] w-12 text-right">
                      {stat.percent}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--portal-input-bg)]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, stat.percent)}%`,
                      backgroundColor: cfg.color,
                      boxShadow: `0 0 10px ${cfg.color}60`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Live Operational Event Stream */}
      <div className="sr-card border-[color:var(--portal-border)] p-6">
        <h3 className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)] mb-4 flex items-center justify-between">
          <span>Real-time Field Milestone Stream</span>
          <span className="font-(--font-mono) text-[11px] text-[var(--portal-muted)]">
            Last {recentUpdates.length} verified events
          </span>
        </h3>

        {recentUpdates.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--portal-muted)]">
            No milestone events logged yet. Field officers can check in milestones from the Field App.
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--portal-border)] overflow-hidden">
            {recentUpdates.map((ev) => {
              const cfg = MILESTONES_CONFIG.find((c) => c.key === ev.milestone)
              return (
                <div
                  key={ev.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 px-2 transition hover:bg-[color:var(--portal-table-row-hover)] rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0">{cfg?.icon || '⏱'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${cfg?.color || '#00c46a'}20`,
                            color: cfg?.color || '#00c46a',
                          }}
                        >
                          {cfg?.label || ev.milestone}
                        </span>
                        <span className="font-(--font-mono) text-xs font-bold text-[var(--portal-fg)]">
                          {ev.pu_code}
                        </span>
                        <span className="text-xs text-[var(--portal-muted)]">{ev.pu_name}</span>
                      </div>
                      <div className="text-[11px] text-[var(--portal-dim)] mt-0.5">
                        {ev.ward_name} · {ev.lga_name}, {ev.state_name} · Reported by{' '}
                        <strong className="text-[var(--portal-muted)]">{ev.officer_name}</strong>
                        {ev.notes && <span className="italic text-[var(--portal-fg)] ml-2">"{ev.notes}"</span>}
                      </div>
                    </div>
                  </div>
                  <div className="font-(--font-mono) text-[11px] text-[var(--portal-dim)] shrink-0 self-end sm:self-auto">
                    {new Date(ev.timestamp).toLocaleTimeString('en-NG', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
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

export function FieldMilestoneChecklist({
  pollingUnitId,
  pollingUnitCode,
  pollingUnitName,
  electionSlug,
}: {
  pollingUnitId?: number
  pollingUnitCode?: string
  pollingUnitName?: string
  electionSlug?: string
}) {
  const queryClient = useQueryClient()
  const [activeNotes, setActiveNotes] = useState<Record<string, string>>({})
  const [submittingKey, setSubmittingKey] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const { data } = useQuery<{
    milestones: {
      id: number
      milestone: OperationalMilestoneKey
      timestamp: string
      notes: string
      officer_name: string
    }[]
  }>({
    queryKey: ['field-pu-timeline', pollingUnitId, electionSlug],
    queryFn: () => {
      if (!pollingUnitId) return { milestones: [] }
      const params = new URLSearchParams()
      if (electionSlug) params.set('electionSlug', electionSlug)
      return apiJson<{ milestones: any[] }>(
        `/api/operations/timeline/pu/${pollingUnitId}?${params.toString()}`
      )
    },
    enabled: Boolean(pollingUnitId),
  })

  const recordedMap = (data?.milestones || []).reduce<
    Record<string, { timestamp: string; notes: string; officer: string }>
  >((acc, m) => {
    acc[m.milestone] = { timestamp: m.timestamp, notes: m.notes, officer: m.officer_name }
    return acc
  }, {})

  const mutation = useMutation({
    mutationFn: async ({
      milestone,
      notes,
    }: {
      milestone: OperationalMilestoneKey
      notes?: string
    }) => {
      return apiJson('/api/operations/timeline/milestone', {
        method: 'POST',
        body: JSON.stringify({
          pollingUnitId,
          electionSlug,
          milestone,
          notes,
          timestamp: new Date().toISOString(),
        }),
      })
    },
    onSuccess: (_, vars) => {
      setSuccessMsg(`✓ Milestone "${vars.milestone.replace('_', ' ')}" recorded successfully!`)
      setTimeout(() => setSuccessMsg(null), 4000)
      queryClient.invalidateQueries({ queryKey: ['field-pu-timeline'] })
      queryClient.invalidateQueries({ queryKey: ['timeline-summary'] })
    },
    onSettled: () => {
      setSubmittingKey(null)
    },
  })

  const handleLog = (milestoneKey: OperationalMilestoneKey) => {
    if (!pollingUnitId) return
    setSubmittingKey(milestoneKey)
    mutation.mutate({
      milestone: milestoneKey,
      notes: activeNotes[milestoneKey] || '',
    })
  }

  if (!pollingUnitId) {
    return (
      <div className="sr-card border-[#F59E0B]/30 p-6 text-sm text-[#F59E0B]">
        No polling unit is assigned to your account. Polling Unit assignment is required to log
        official operational timeline milestones.
      </div>
    )
  }

  return (
    <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--portal-border)] pb-4">
        <div>
          <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a] tracking-wider">
            ELECTION DAY PROTOCOL · POLICE & OBSERVER TIMELINE
          </span>
          <h2 className="font-(--font-syne) text-lg font-bold text-[var(--portal-fg)]">
            PU Operational Milestone Checklist
          </h2>
          <p className="text-xs text-[var(--portal-muted)]">
            Station: <strong className="text-[var(--portal-fg)]">{pollingUnitCode}</strong> ·{' '}
            {pollingUnitName}
          </p>
        </div>
        <div className="text-right">
          <span className="font-(--font-mono) text-xs text-[var(--portal-muted)]">
            Status:{' '}
            <strong className="text-[#00c46a]">
              {Object.keys(recordedMap).length} / 6 Milestones Completed
            </strong>
          </span>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-[#00c46a]/40 bg-[#00c46a]/15 p-3 text-xs font-semibold text-[#00c46a]">
          {successMsg}
        </div>
      )}

      <div className="space-y-4">
        {MILESTONES_CONFIG.map((cfg, idx) => {
          const rec = recordedMap[cfg.key]
          const isDone = Boolean(rec)
          const isSubmitting = submittingKey === cfg.key

          return (
            <div
              key={cfg.key}
              className={`rounded-xl border p-4 transition ${
                isDone
                  ? 'border-[#00c46a]/35 bg-[#00c46a]/[0.04]'
                  : 'border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)]/40 hover:border-[#00c46a]/30'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-lg"
                    style={{ backgroundColor: `${cfg.color}25` }}
                  >
                    {cfg.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)]">
                        {idx + 1}. {cfg.label}
                      </span>
                      {isDone && (
                        <span className="rounded bg-[#00c46a]/20 px-2 py-0.5 font-(--font-mono) text-[10px] font-bold text-[#00c46a]">
                          ✓ COMPLETED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--portal-muted)] mt-0.5">{cfg.description}</p>
                    {isDone && (
                      <div className="mt-1 font-(--font-mono) text-[11px] text-[var(--portal-dim)]">
                        Recorded at:{' '}
                        <strong className="text-[var(--portal-fg)]">
                          {new Date(rec.timestamp).toLocaleTimeString('en-NG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </strong>
                        {rec.notes && <span className="ml-2 italic text-[var(--portal-muted)]">"{rec.notes}"</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  {!isDone && (
                    <input
                      type="text"
                      placeholder="Optional notes…"
                      value={activeNotes[cfg.key] || ''}
                      onChange={(e) =>
                        setActiveNotes((prev) => ({ ...prev, [cfg.key]: e.target.value }))
                      }
                      className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-2.5 py-1.5 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
                    />
                  )}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleLog(cfg.key)}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                      isDone
                        ? 'sr-btn-ghost text-[var(--portal-muted)] hover:text-white'
                        : 'sr-btn-primary text-white'
                    }`}
                  >
                    {isSubmitting ? 'Logging…' : isDone ? 'Re-confirm / Update' : `Log ${cfg.label}`}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
