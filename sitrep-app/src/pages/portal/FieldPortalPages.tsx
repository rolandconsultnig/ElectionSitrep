import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar } from 'react-chartjs-2'
import { chartColors, chartTooltipTheme } from '../../charts/register'
import { apiJson } from '../../lib/api'
import { enqueueOffline, flushQueueIfOnline, getQueueDepth, listQueue } from '../../lib/offlineQueue'
import type { FieldPortalContext } from './field-portal-types'
import { currentPosition, fetchIncidentTypes, SEVERITY_STYLE, type Severity } from '../../lib/incidents'

const card = 'sr-card'

type PartyRow = {
  id: string
  inecRegisterCode: string
  name: string
  abbreviation: string
  presidentialCandidate?: string | null
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG').format(n)
}

function useOfflineQueueDepth(): number {
  const [depth, setDepth] = useState(() => getQueueDepth())
  useEffect(() => {
    const id = setInterval(() => setDepth(getQueueDepth()), 750)
    return () => clearInterval(id)
  }, [])
  return depth
}

function useFieldContext() {
  return useQuery({
    queryKey: ['field-context'],
    queryFn: () => apiJson<FieldPortalContext>('/api/field/context'),
  })
}

function useParties() {
  return useQuery({
    queryKey: ['parties'],
    queryFn: () => apiJson<{ parties: PartyRow[] }>('/api/parties'),
  })
}

function assignmentSubtitle(ctx: FieldPortalContext | undefined): string {
  if (!ctx?.assignment) {
    return 'No polling unit assigned — your administrator can link your account to a PU in the admin console.'
  }
  const { pollingUnit, ward, lga, state } = ctx.assignment
  return `${pollingUnit.code} · ${pollingUnit.name} · ${ward.name} · ${lga.name}, ${state.name}`
}

function puPayloadFromContext(ctx: FieldPortalContext | undefined) {
  if (!ctx?.assignment) {
    return { puCode: null as string | null, puId: null as number | null, jurisdiction: null as string | null }
  }
  const pu = ctx.assignment.pollingUnit
  return {
    puCode: pu.code,
    puId: pu.id,
    jurisdiction: `${ctx.assignment.ward.name}, ${ctx.assignment.state.code}`,
  }
}

function countQueuedToday(): number {
  const today = new Date().toDateString()
  return listQueue().filter((q) => new Date(q.createdAt).toDateString() === today).length
}

const FIELD_QUICK_ACTIONS = [
  { to: '/field/sitrep', label: 'SitRep', icon: '📝', hint: 'Structured PU report' },
  { to: '/field/voting', label: 'Vote tally', icon: '✓', hint: 'Upload party totals' },
  { to: '/field/turnout', label: 'Turnout', icon: '📊', hint: 'National pulse' },
  { to: '/field/incidents', label: 'Incident', icon: '⚠', hint: 'Escalate to chain' },
  { to: '/field/violence', label: 'Violence', icon: '🚨', hint: 'Urgent — CP / HQ' },
  { to: '/field/reference', label: 'Parties', icon: '⚑', hint: 'Candidates ref.' },
  { to: '/field/history', label: 'History', icon: '🕐', hint: 'Queue on device' },
  { to: '/field/communications', label: 'Comms', icon: '💬', hint: 'HQ Chat & Video' },
] as const

export function FieldOfflineBanner() {
  const depth = useOfflineQueueDepth()
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function handleRetry() {
    if (!online) {
      setSyncStatus('Cannot sync while offline. Reconnect and try again.')
      return
    }

    setSyncing(true)
    setSyncStatus(null)

    try {
      const syncedCount = await flushQueueIfOnline()
      setSyncStatus(
        syncedCount > 0
          ? `Synced ${syncedCount} pending item${syncedCount === 1 ? '' : 's'}.`
          : 'No pending items were synced. Try again when the API is reachable.',
      )
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : 'Retry failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="sr-card mb-6 flex flex-col gap-3 border-[#0dccb0]/20 bg-[var(--portal-input-bg)]/80 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[13px] text-[var(--portal-muted)]">
        <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Offline queue · Field PWA</span>
        <span className="ml-3">
          {online ? (
            <span className="text-[#00C896]">Online — sync enabled</span>
          ) : (
            <span className="text-[#F59E0B]">Offline — submissions queued locally</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3 font-(--font-mono) text-[11px] text-[var(--portal-muted)]">
        Pending items: <strong className="text-[var(--portal-fg)]">{depth}</strong>
        <button
          type="button"
          disabled={syncing}
          onClick={handleRetry}
          className="sr-btn-ghost px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {syncing ? 'Syncing…' : 'Retry sync'}
        </button>
      </div>
      {syncStatus && <div className="text-[11px] text-[var(--portal-muted)]">{syncStatus}</div>}
    </div>
  )
}

export function FieldDashboard() {
  const q = useFieldContext()
  const depth = useOfflineQueueDepth()
  const ctx = q.data
  const todayQueued = useMemo(() => countQueuedToday(), [depth])

  return (
    <div className="space-y-6 pb-8">
      <FieldOfflineBanner />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Field agent dashboard</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">
            {q.isLoading && 'Loading assignment and elections…'}
            {q.isError && (
              <span className="text-[#EF4444]">{(q.error as Error)?.message || 'Could not load field context.'}</span>
            )}
            {ctx && (
              <>
                <span className="text-[var(--portal-fg)]">{ctx.officer.displayName}</span>
                <span className="mx-2 text-[var(--portal-dim)]">·</span>
                {assignmentSubtitle(ctx)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={q.isFetching}
          onClick={() => q.refetch()}
          className="sr-btn-ghost shrink-0 self-start px-4 py-2 text-[13px] disabled:opacity-50"
        >
          {q.isFetching ? 'Refreshing…' : 'Refresh status'}
        </button>
      </header>

      <div>
        <h2 className="mb-3 font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--portal-dim)]">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FIELD_QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="sr-card group flex gap-3 border-[color:var(--portal-border)] py-3 transition hover:border-[#0dccb0]/45 hover:bg-[#0dccb0]/[0.06]"
            >
              <span className="text-2xl leading-none opacity-90">{a.icon}</span>
              <span className="min-w-0">
                <span className="block font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)] group-hover:text-[#0dccb0]">
                  {a.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--portal-muted)]">{a.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="National PUs (catalog)"
          value={ctx ? fmt(ctx.geography.pollingUnits) : '—'}
          sub="Live geography summary"
          tone="green"
        />
        <Stat
          label="Active elections"
          value={ctx ? String(ctx.activeElections.length) : '—'}
          sub={ctx?.activeElections[0]?.name ?? 'None scheduled as active'}
          tone="blue"
        />
        <Stat label="Queued submissions today" value={String(todayQueued)} sub="Local queue (this device)" tone="amber" />
        <Stat label="Pending sync" value={String(depth)} sub="Local queue depth for device sync" tone="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-4 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Reporting workflow</div>
          <div className="flex flex-wrap gap-2 text-[11px] font-(--font-mono)">
            {['Setup', 'Voting open', 'Voting closed', 'Submitted', 'Synced'].map((s) => (
              <span key={s} className="rounded-full bg-white/[0.06] px-3 py-1 text-[var(--portal-dim)]">
                {s}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--portal-muted)]">
            Status hooks to central ops when your PU is assigned and ingest APIs are enabled; queue holds drafts offline.
          </p>
        </div>
        <div className={card}>
          <div className="mb-2 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Evidence</div>
          <p className="text-xs leading-relaxed text-[var(--portal-muted)]">
            EC8A photo uploads store SHA-256 at ingest; duplicate-hash detection flags possible sheet cloning (§07).
          </p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const col =
    tone === 'green'
      ? 'text-[#00C896]'
      : tone === 'blue'
        ? 'text-[#3B82F6]'
        : tone === 'amber'
          ? 'text-[#F59E0B]'
          : 'text-[#EF4444]'
  return (
    <div className={card}>
      <div className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-muted)]">{label}</div>
      <div className={`mt-2 font-(--font-syne) text-3xl font-bold ${col}`}>{value}</div>
      <div className="mt-1 text-xs text-[var(--portal-dim)]">{sub}</div>
    </div>
  )
}

export function FieldSitRep() {
  const [busy, setBusy] = useState(false)
  const [severity, setSeverity] = useState('GREEN')
  const [accredited, setAccredited] = useState('')
  const [narrative, setNarrative] = useState('')
  const ctxQ = useFieldContext()
  const pu = puPayloadFromContext(ctxQ.data)

  async function onSubmit() {
    setBusy(true)
    await enqueueOffline({
      type: 'sitrep',
      createdAt: new Date().toISOString(),
      payload: {
        severity,
        accredited: accredited === '' ? null : Number(accredited),
        narrative: narrative.trim() || undefined,
        ...pu,
      },
    })
    setBusy(false)
    alert('SitRep queued locally. Retry sync when online to deliver it to the backend.')
  }

  return (
    <div className="space-y-6">
      <FieldOfflineBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Submit SitRep</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Structured report · EC8A photo · SHA-256 · party agent countersignature (production){' '}
          {ctxQ.data && (
            <span className="block pt-1 text-[11px] text-[var(--portal-dim)]">{assignmentSubtitle(ctxQ.data)}</span>
          )}
        </p>
      </header>
      <div className={card}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Severity</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
            >
              <option value="GREEN">Green</option>
              <option value="AMBER">Amber</option>
              <option value="RED">Red</option>
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Accredited count</span>
            <input
              type="number"
              value={accredited}
              onChange={(e) => setAccredited(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
            />
          </label>
        </div>
        <label className="mt-4 block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Narrative</span>
          <textarea
            rows={4}
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Voting concluded peacefully. Party agents present."
            className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          />
        </label>
        <label className="mt-4 block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">EC8A image</span>
          <input type="file" accept="image/*" className="mt-2 block w-full text-sm text-[var(--portal-muted)]" />
        </label>
        <button type="button" disabled={busy} onClick={onSubmit} className="sr-btn-primary mt-6 disabled:opacity-50">
          Submit SitRep
        </button>
      </div>
    </div>
  )
}

function useFieldElections() {
  return useQuery({
    queryKey: ['field-elections'],
    queryFn: () =>
      apiJson<{ elections: { slug: string; name: string; status: string; electionDate: string | null }[] }>(
        '/api/field/elections',
      ),
  })
}

export function FieldVoting() {
  const electionsQ = useFieldElections()
  const ctxQ = useFieldContext()
  const pu = puPayloadFromContext(ctxQ.data)
  const [electionSlug, setElectionSlug] = useState('')
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const [prevElections, setPrevElections] = useState(electionsQ.data?.elections)
  const [prevElectionSlug, setPrevElectionSlug] = useState(electionSlug)

  if (electionsQ.data?.elections !== prevElections) {
    setPrevElections(electionsQ.data?.elections)
    const list = electionsQ.data?.elections
    if (list?.length) {
      setElectionSlug((s) => (s && list.some((e) => e.slug === s) ? s : list[0].slug))
    }
  }

  if (electionSlug !== prevElectionSlug) {
    setPrevElectionSlug(electionSlug)
    setVotes({})
  }

  const candQ = useQuery({
    queryKey: ['field-election-candidates', electionSlug],
    queryFn: () =>
      apiJson<{ parties: PartyRow[] }>(
        `/api/field/elections/${encodeURIComponent(electionSlug)}/candidate-parties`,
      ),
    enabled: Boolean(electionSlug),
  })

  const rows = candQ.data?.parties ?? []

  async function submit() {
    if (!electionSlug) return
    setBusy(true)
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline')
      }

      await apiJson<{ ok: boolean }>(`/api/field/elections/${encodeURIComponent(electionSlug)}/votes`, {
        method: 'POST',
        body: JSON.stringify({
          votes: rows.map((p) => ({ partyId: p.id, votes: Number(votes[p.id]) || 0 })),
        }),
      })
      alert('Votes uploaded for your PU — national IGP charts refresh automatically.')
    } catch (e) {
      const isOfflineError =
        typeof navigator !== 'undefined' && !navigator.onLine
          ? true
          : e instanceof Error && /offline|Cannot reach|Request failed \(0\)/i.test(e.message)

      if (isOfflineError) {
        await enqueueOffline({
          type: 'vote_tally',
          createdAt: new Date().toISOString(),
          payload: {
            electionSlug,
            votes: rows.map((p) => ({ partyId: p.id, votes: Number(votes[p.id]) || 0 })),
            ...pu,
          },
        })
        alert('Vote tally saved locally. Retry sync when you are online.')
      } else {
        alert(e instanceof Error ? e.message : 'Upload failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <FieldOfflineBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Voting status & vote tally</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Party rows match the selected election&apos;s candidates · uploaded to national collation ·{' '}
          {ctxQ.data && (
            <span className="block pt-1 text-[11px] text-[var(--portal-dim)]">{assignmentSubtitle(ctxQ.data)}</span>
          )}
        </p>
      </header>
      <div className={card}>
        <label className="mb-4 block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Election</span>
          <select
            value={electionSlug}
            onChange={(e) => setElectionSlug(e.target.value)}
            disabled={electionsQ.isLoading || !electionsQ.data?.elections?.length}
            className="mt-1 w-full max-w-md rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          >
            {(electionsQ.data?.elections ?? []).map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name} ({e.status})
              </option>
            ))}
          </select>
        </label>

        {electionsQ.isError && (
          <p className="text-sm text-[#EF4444]">{(electionsQ.error as Error)?.message || 'Failed to load elections.'}</p>
        )}
        {!electionsQ.isLoading && !(electionsQ.data?.elections?.length ?? 0) && (
          <p className="text-sm text-[var(--portal-muted)]">No elections available.</p>
        )}

        {candQ.isLoading && electionSlug && <p className="text-sm text-[var(--portal-muted)]">Loading candidates…</p>}
        {candQ.isError && (
          <p className="text-sm text-[#EF4444]">{(candQ.error as Error)?.message || 'Failed to load candidates.'}</p>
        )}
        {!candQ.isLoading && electionSlug && rows.length === 0 && (
          <p className="text-sm text-[var(--portal-muted)]">
            No candidates for this election — finish Admin → Election setup (party slots) first.
          </p>
        )}
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">
                <th className="pb-2">Party</th>
                <th className="pb-2">Votes</th>
              </tr>
            </thead>
            <tbody className="text-[var(--portal-muted)]">
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-[color:var(--portal-border)]">
                  <td className="py-2 text-[var(--portal-fg)]">
                    {p.abbreviation || p.name}{' '}
                    <span className="text-[var(--portal-dim)]">({p.inecRegisterCode})</span>
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      value={votes[p.id] ?? ''}
                      onChange={(e) => setVotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="0"
                      className="w-24 rounded border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-2 py-1 text-[var(--portal-fg)]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-[#F59E0B]">Σ party votes must not exceed accredited voters (hard validation at API).</p>
        <button type="button" disabled={busy || !rows.length || !electionSlug} onClick={submit} className="sr-btn-primary mt-4 disabled:opacity-50">
          Upload PU tally
        </button>
      </div>
    </div>
  )
}

export function FieldTurnout() {
  const ctxQ = useFieldContext()
  const pulse = ctxQ.data?.nationalPulse
  const data = useMemo(() => {
    if (pulse && pulse.labels.length) {
      return {
        labels: pulse.labels,
        datasets: [
          {
            label: 'National submissions (hourly)',
            data: pulse.submissions,
            backgroundColor: 'rgba(0,200,150,.45)',
            borderColor: chartColors.green,
            borderWidth: 1,
          },
        ],
      }
    }
    return {
      labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'],
      datasets: [
        {
          label: 'No live hourly metrics available',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(0,200,150,.25)',
          borderColor: chartColors.green,
          borderWidth: 1,
        },
      ],
    }
  }, [pulse])

  return (
    <div className="space-y-6">
      <FieldOfflineBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Voter turnout</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          National pulse from live KPI snapshot — same hourly series as executive dashboards; PU-level turnout when wired.
        </p>
      </header>
      <div className={card}>
        {ctxQ.isLoading && <p className="text-sm text-[var(--portal-muted)]">Loading pulse…</p>}
        {ctxQ.isError && (
          <p className="mb-4 text-sm text-[#EF4444]">{(ctxQ.error as Error)?.message || 'Could not load context.'}</p>
        )}
        <Bar
          data={data}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
            scales: {
              x: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
              y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
            },
          }}
        />
      </div>
    </div>
  )
}

export function FieldIncidents() {
  const [busy, setBusy] = useState(false)
  const [typeCode, setTypeCode] = useState('')
  const [severity, setSeverity] = useState<Severity | ''>('')
  const [detail, setDetail] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const ctxQ = useFieldContext()
  const pu = puPayloadFromContext(ctxQ.data)
  const typesQ = useQuery({ queryKey: ['incident-types'], queryFn: fetchIncidentTypes, staleTime: 3_600_000 })
  const types = typesQ.data?.types ?? []
  const selected = types.find((t) => t.code === typeCode)
  const effectiveSeverity: Severity = severity || selected?.defaultSeverity || 'low'

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) setPhotoDataUrl(ev.target.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function submit(isFlash: boolean) {
    const code = isFlash && !typeCode ? 'other' : typeCode
    if (!code) return setMsg('Select an incident type.')
    if (!isFlash && effectiveSeverity !== 'low' && detail.trim().length < 5) {
      return setMsg('Describe what happened (required for medium, high and critical incidents).')
    }
    setBusy(true)
    const pos = await currentPosition()
    await enqueueOffline({
      type: 'incident',
      createdAt: new Date().toISOString(),
      payload: {
        typeCode: code,
        severity: isFlash ? 'critical' : effectiveSeverity,
        isFlash,
        description: detail.trim() || undefined,
        photoDataUrl: photoDataUrl || undefined,
        lat: pos?.lat,
        lng: pos?.lng,
        ...pu,
      },
    })
    void flushQueueIfOnline()
    setBusy(false)
    setDetail('')
    setPhotoDataUrl('')
    setMsg(isFlash ? 'FLASH sent — Force HQ and all commands alerted.' : 'Incident submitted. It will sync automatically if offline.')
  }

  return (
    <div className="space-y-6">
      <FieldOfflineBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Report incident</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Severity routes the alert: Low → DPO · Medium → Area Command · High → State · Critical/FLASH → Force HQ. Unanswered alerts
          escalate automatically.
        </p>
      </header>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm('Send FLASH report? This alerts every command dashboard immediately.')) void submit(true)
        }}
        className="w-full rounded-xl bg-red-600 px-4 py-4 text-lg font-extrabold tracking-widest text-white shadow-lg shadow-red-900/40 disabled:opacity-50"
      >
        ⚡ FLASH
      </button>
      <div className={card}>
        <label className="block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Incident type *</span>
          <select
            value={typeCode}
            onChange={(e) => {
              setTypeCode(e.target.value)
              setSeverity('')
            }}
            className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          >
            <option value="">— Select —</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Severity</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['low', 'medium', 'high', 'critical'] as Severity[]).map((sv) => (
              <button
                key={sv}
                type="button"
                onClick={() => setSeverity(sv)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                  effectiveSeverity === sv ? SEVERITY_STYLE[sv] : 'border border-[color:var(--portal-border)] text-[var(--portal-muted)]'
                }`}
              >
                {sv}
              </button>
            ))}
          </div>
        </div>
        <label className="mt-4 block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">
            Details {effectiveSeverity !== 'low' ? '*' : ''}
          </span>
          <textarea
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
            placeholder="What happened, how many people, who observed it, time."
          />
        </label>
        <label className="mt-4 block text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Evidence photo (optional, SHA-256 hashed)</span>
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="mt-2 block w-full text-sm text-[var(--portal-muted)]" />
        </label>
        {photoDataUrl && (
          <div className="mt-2">
            <img src={photoDataUrl} alt="Incident" className="h-32 w-auto rounded-md object-cover" />
          </div>
        )}
        {msg && <p className="mt-4 text-sm text-[var(--portal-fg)]">{msg}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit(false)}
          className="mt-6 rounded-lg bg-[#EF4444]/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Submit incident & escalate
        </button>
      </div>
    </div>
  )
}

export function FieldViolence() {
  const [busy, setBusy] = useState(false)
  const ctxQ = useFieldContext()
  const pu = puPayloadFromContext(ctxQ.data)

  async function urgent() {
    setBusy(true)
    await enqueueOffline({
      type: 'violence',
      createdAt: new Date().toISOString(),
      payload: { level: 'URGENT', ...pu },
    })
    setBusy(false)
    alert('Violence report queued locally — confirm voice escalation per SOP.')
  }

  return (
    <div className="space-y-6">
      <FieldOfflineBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Violence & disturbance log</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Fatality triggers mandatory Force HQ escalation · URGENT SMS to CP, DIG, IGP duty desk (§M15)
        </p>
      </header>
      <div className={card}>
        <button
          type="button"
          disabled={busy}
          onClick={urgent}
          className="w-full rounded-lg bg-[#EF4444] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          URGENT — Violence report
        </button>
      </div>
    </div>
  )
}

export function FieldReference() {
  const q = useParties()

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Parties & candidates reference</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Read-only from <span className="font-(--font-mono) text-[11px]">GET /api/parties</span> · candidate lines follow admin election setup.
        </p>
      </header>
      <div className={`${card} max-h-[min(70vh,560px)] overflow-auto text-sm`}>
        {q.isLoading && <p className="text-[var(--portal-muted)]">Loading parties…</p>}
        {q.isError && <p className="text-[#EF4444]">{(q.error as Error)?.message || 'Failed to load parties.'}</p>}
        {q.data?.parties?.length ? (
          <ul className="divide-y divide-[color:var(--portal-border)]">
            {q.data.parties.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <div>
                  <span className="font-semibold text-[var(--portal-fg)]">{p.name}</span>{' '}
                  <span className="font-(--font-mono) text-[11px] text-[var(--portal-dim)]">{p.abbreviation}</span>
                </div>
                <div className="text-[11px] text-[var(--portal-muted)]">
                  INEC {p.inecRegisterCode}
                  {p.presidentialCandidate ? ` · ${p.presidentialCandidate}` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !q.isLoading && <p className="text-[var(--portal-muted)]">No parties configured.</p>
        )}
      </div>
    </div>
  )
}

export function FieldHistory() {
  const depth = useOfflineQueueDepth()
  const items = useMemo(() => [...listQueue()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [depth])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Submission history</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          This device&apos;s offline queue · sync status · backend history export pending implementation (§M17)
        </p>
      </header>
      <div className={card}>
        {items.length === 0 ? (
          <p className="text-sm text-[var(--portal-muted)]">No queued submissions on this device yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">
                <th className="pb-2">Time (UTC)</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Sync</th>
              </tr>
            </thead>
            <tbody className="text-[var(--portal-muted)]">
              {items.map((row) => (
                <tr key={row.id} className="border-t border-[color:var(--portal-border)]">
                  <td className="py-2 font-(--font-mono) text-[12px]">{row.createdAt.slice(11, 19)}</td>
                  <td className="py-2 text-[var(--portal-fg)]">{row.type}</td>
                  <td className="py-2">{row.synced ? <span className="text-[#00C896]">Synced</span> : <span className="text-[#F59E0B]">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
