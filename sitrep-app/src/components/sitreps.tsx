import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiJson } from '../lib/api'

/* -------------------------------------------------------------------------- */
/* Types matching the API (`GET /api/sitreps`, `/api/sitreps/summary`)        */
/* -------------------------------------------------------------------------- */

export type SitRepSeverity = 'low' | 'medium' | 'critical'
export type SitRepKind = 'sitrep' | 'incident' | 'violence'
export type SitRepStatus = 'new' | 'acknowledged' | 'escalated' | 'resolved'

export type SitRepItem = {
  id: string
  kind: SitRepKind
  category: string
  severity: SitRepSeverity
  title: string
  body: string
  status: SitRepStatus
  createdAt: string
  lat: number | null
  lng: number | null
  author: string
  authorUsername: string
  authorPortal: string
  state: string | null
  lga: string | null
  puCode: string | null
}

export type SitRepFeedResponse = {
  jurisdiction: { level: string; stateName: string | null; lgaName: string | null }
  sitreps: SitRepItem[]
}

export type SitRepSummary = {
  total: number
  bySeverity: Record<string, number>
  byStatus: Record<string, number>
  byKind: Record<string, number>
}

/* -------------------------------------------------------------------------- */
/* Queries / mutations                                                         */
/* -------------------------------------------------------------------------- */

export function useSitRepFeed(opts: { severity?: string; kind?: string; status?: string; limit?: number } = {}) {
  const params = new URLSearchParams()
  if (opts.severity) params.set('severity', opts.severity)
  if (opts.kind) params.set('kind', opts.kind)
  if (opts.status) params.set('status', opts.status)
  params.set('limit', String(opts.limit ?? 200))
  const qs = params.toString()
  return useQuery({
    queryKey: ['sitreps', qs],
    queryFn: () => apiJson<SitRepFeedResponse>(`/api/sitreps?${qs}`),
    refetchInterval: 30_000,
  })
}

export function useSitRepSummary() {
  return useQuery({
    queryKey: ['sitreps-summary'],
    queryFn: () => apiJson<SitRepSummary>('/api/sitreps/summary'),
    refetchInterval: 30_000,
  })
}

function useInvalidateSitreps() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: ['sitreps'] })
    void qc.invalidateQueries({ queryKey: ['sitreps-summary'] })
  }
}

export function useSitRepStatusMutation() {
  const invalidate = useInvalidateSitreps()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SitRepStatus }) =>
      apiJson(`/api/sitreps/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
  })
}

/* -------------------------------------------------------------------------- */
/* Styling                                                                     */
/* -------------------------------------------------------------------------- */

export type SitRepPalette = {
  text: string
  muted: string
  dim: string
  card: string
  border: string
  input: string
  accentText: string
}

/** Portal pages (theme-aware CSS vars). */
export const PORTAL_PALETTE: SitRepPalette = {
  text: 'text-[var(--portal-fg)]',
  muted: 'text-[var(--portal-muted)]',
  dim: 'text-[var(--portal-dim)]',
  card: 'bg-[var(--portal-card,#0a1510)]',
  border: 'border-[color:var(--portal-border)]',
  input: 'bg-[var(--portal-input-bg)] border-[color:var(--portal-border)] text-[var(--portal-fg)]',
  accentText: 'text-[#00c46a]',
}

/** Standalone tactical situation-room screens (always dark). */
export const TACTICAL_PALETTE: SitRepPalette = {
  text: 'text-slate-200',
  muted: 'text-slate-400',
  dim: 'text-slate-500',
  card: 'bg-slate-900/50',
  border: 'border-slate-800/70',
  input: 'bg-slate-950/70 border-slate-700/70 text-slate-100',
  accentText: 'text-cyan-400',
}

export const SEVERITY_META: Record<SitRepSeverity, { label: string; dot: string; chip: string }> = {
  critical: { label: 'Critical', dot: 'bg-[#f43f5e]', chip: 'border-[#f43f5e]/50 bg-[#f43f5e]/10 text-[#f8718a]' },
  medium: { label: 'Medium', dot: 'bg-[#f59e0b]', chip: 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#fbbf24]' },
  low: { label: 'Low', dot: 'bg-[#10b981]', chip: 'border-[#10b981]/50 bg-[#10b981]/10 text-[#34d399]' },
}

const KIND_LABEL: Record<string, string> = {
  sitrep: 'SitRep',
  incident: 'Incident',
  violence: 'Violence flash',
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  escalated: 'Escalated',
  resolved: 'Resolved',
}

export function formatSitRepTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleTimeString('en-NG', { hour12: false, hour: '2-digit', minute: '2-digit' })} WAT`
}

export function formatSitRepDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })
}

/* -------------------------------------------------------------------------- */
/* Feed list                                                                   */
/* -------------------------------------------------------------------------- */

export function SitRepFeedList({
  items,
  palette,
  canAct = true,
  emptyHint = 'No situation reports in your jurisdiction yet.',
}: {
  items: SitRepItem[]
  palette: SitRepPalette
  canAct?: boolean
  emptyHint?: string
}) {
  const statusMutation = useSitRepStatusMutation()
  const [actionError, setActionError] = useState('')

  const act = (id: string, status: SitRepStatus) => {
    setActionError('')
    statusMutation.mutate({ id, status }, { onError: (e) => setActionError(e.message) })
  }

  if (!items.length) {
    return (
      <div className={`rounded-lg border border-dashed ${palette.border} px-4 py-8 text-center text-sm ${palette.muted}`}>
        {emptyHint}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {actionError ? <p className="text-xs text-rose-400">{actionError}</p> : null}
      {items.map((item) => {
        const sev = SEVERITY_META[item.severity] ?? SEVERITY_META.low
        const isCmd = item.id.startsWith('cmd-')
        return (
          <article
            key={item.id}
            className={`relative overflow-hidden rounded-lg border ${palette.border} ${palette.card} p-3 pl-4`}
          >
            <span className={`absolute left-0 top-0 h-full w-0.5 ${sev.dot}`} aria-hidden />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`rounded border px-1.5 py-0.5 font-(--font-mono) text-[9px] font-bold uppercase tracking-widest ${sev.chip}`}>
                {sev.label}
              </span>
              <span className={`font-(--font-mono) text-[9px] uppercase tracking-widest ${palette.dim}`}>
                {KIND_LABEL[item.kind] ?? item.kind} · {item.category}
              </span>
              <span className={`ml-auto font-(--font-mono) text-[10px] ${palette.dim}`}>
                {formatSitRepDate(item.createdAt)} {formatSitRepTime(item.createdAt)}
              </span>
            </div>
            <h4 className={`mt-1.5 text-sm font-semibold leading-snug ${palette.text}`}>{item.title}</h4>
            {item.body ? <p className={`mt-1 text-xs leading-relaxed ${palette.muted}`}>{item.body}</p> : null}
            <div className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-(--font-mono) text-[10px] uppercase tracking-wider ${palette.dim}`}>
              <span>
                {[item.puCode, item.lga, item.state].filter(Boolean).join(' · ') || 'National'}
              </span>
              <span>by {item.author}</span>
              <span className={item.status === 'new' ? 'text-amber-400' : item.status === 'escalated' ? 'text-rose-400' : palette.accentText}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              {canAct && isCmd && item.status !== 'resolved' ? (
                <span className="ml-auto flex gap-1.5">
                  {item.status === 'new' ? (
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() => act(item.id, 'acknowledged')}
                      className={`rounded border ${palette.border} px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${palette.accentText} hover:brightness-125 disabled:opacity-40`}
                    >
                      Acknowledge
                    </button>
                  ) : null}
                  {item.status !== 'escalated' ? (
                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() => act(item.id, 'escalated')}
                      className="rounded border border-rose-500/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
                    >
                      Escalate
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={statusMutation.isPending}
                    onClick={() => act(item.id, 'resolved')}
                    className={`rounded border ${palette.border} px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${palette.muted} hover:brightness-125 disabled:opacity-40`}
                  >
                    Resolve
                  </button>
                </span>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                    */
/* -------------------------------------------------------------------------- */

const COMPOSER_KINDS: Array<{ id: SitRepKind; label: string }> = [
  { id: 'sitrep', label: 'Routine SitRep' },
  { id: 'incident', label: 'Incident' },
  { id: 'violence', label: 'Violence flash' },
]

const COMPOSER_CATEGORIES = ['security', 'logistics', 'personnel', 'materials', 'turnout', 'crowd', 'weather', 'general']

export function SitRepComposer({
  palette,
  scopeLabel,
  onFiled,
}: {
  palette: SitRepPalette
  /** e.g. "Files under: Oyo State Command" */
  scopeLabel: string
  onFiled?: () => void
}) {
  const invalidate = useInvalidateSitreps()
  const [kind, setKind] = useState<SitRepKind>('sitrep')
  const [severity, setSeverity] = useState<SitRepSeverity>('low')
  const [category, setCategory] = useState('security')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiJson('/api/sitreps', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setTitle('')
      setBody('')
      setError('')
      invalidate()
      onFiled?.()
    },
    onError: (e) => setError(e.message),
  })

  const submit = () => {
    if (!title.trim()) {
      setError('Give the report a title.')
      return
    }
    mutation.mutate({ kind, severity, category, title: title.trim(), body: body.trim() })
  }

  const chipBase = 'rounded-full border px-3 py-1 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider transition-colors'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {COMPOSER_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setKind(k.id)}
            className={`${chipBase} ${kind === k.id ? `border-cyan-500/60 bg-cyan-500/15 ${palette.accentText}` : `${palette.border} ${palette.muted}`}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`font-(--font-mono) text-[9px] uppercase tracking-widest ${palette.dim}`}>Severity</span>
        {(Object.keys(SEVERITY_META) as SitRepSeverity[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverity(s)}
            className={`${chipBase} ${severity === s ? SEVERITY_META[s].chip : `${palette.border} ${palette.muted}`}`}
          >
            {SEVERITY_META[s].label}
          </button>
        ))}
        <span className={`ml-2 font-(--font-mono) text-[9px] uppercase tracking-widest ${palette.dim}`}>Category</span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`rounded border px-2 py-1 font-(--font-mono) text-[10px] uppercase ${palette.input}`}
        >
          {COMPOSER_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={191}
        placeholder="Report title — e.g. ‘PU 04-12-006 voting concluded peacefully’"
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500/50 ${palette.input}`}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Details: what happened, where, actions taken, assistance required…"
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-cyan-500/50 ${palette.input}`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending}
          className="rounded-lg bg-cyan-600 px-4 py-2 font-(--font-mono) text-[11px] font-bold uppercase tracking-widest text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          {mutation.isPending ? 'Filing…' : 'File report'}
        </button>
        <span className={`font-(--font-mono) text-[9px] uppercase tracking-widest ${palette.dim}`}>{scopeLabel}</span>
        {error ? <span className="text-xs text-rose-400">{error}</span> : null}
      </div>
    </div>
  )
}
