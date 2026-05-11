import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { chartColors, chartTooltipTheme } from '../../charts/register'
import { NigeriaMap } from '../../components/NigeriaMap'
import { apiJson } from '../../lib/api'
import type { ElectionResultsPayload, ExecutiveDashboardSummary } from './igp-portal-types'

const card = 'sr-card'

type FieldOpsMap = {
  active: {
    userId: string
    displayName: string
    lat: number
    lng: number
    stateHint: string
  }[]
  inactive: { displayName: string; lat: number; lng: number; reason: string }[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG').format(n)
}

function useExecutiveDashboard() {
  return useQuery({
    queryKey: ['igp-dashboard-summary'],
    queryFn: () => apiJson<ExecutiveDashboardSummary>('/api/igp/dashboard-summary'),
  })
}

function useFieldOpsMap() {
  return useQuery({
    queryKey: ['igp-field-operations-map'],
    queryFn: () => apiJson<FieldOpsMap>('/api/igp/field-operations-map'),
  })
}

const PARTY_CHART_PALETTE = [
  '#00C896',
  '#3B82F6',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#84CC16',
]

function partyChartColor(i: number) {
  return PARTY_CHART_PALETTE[i % PARTY_CHART_PALETTE.length]
}

function useIgpElectionList() {
  return useQuery({
    queryKey: ['igp-elections'],
    queryFn: () =>
      apiJson<{ elections: { slug: string; name: string; status: string; electionDate: string | null }[] }>(
        '/api/igp/elections',
      ),
  })
}

function useIgpElectionResults(slug: string | null) {
  return useQuery({
    queryKey: ['igp-election-results', slug],
    queryFn: () =>
      apiJson<ElectionResultsPayload>(`/api/igp/election-results/${encodeURIComponent(slug!)}`),
    enabled: Boolean(slug),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  })
}

export function IGPReadOnlyBanner() {
  return (
    <div className="mb-6 rounded-xl border border-[#c9a227]/35 bg-gradient-to-r from-[#c9a227]/10 to-[#0dccb0]/10 px-4 py-3 text-[13px] text-[var(--portal-muted)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <span className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[#00C896]">IGP portal</span>
      <span className="ml-3">
        Read-only executive intelligence — data from live system KPIs and field deployment (no data entry) (§04 / §M26–M31).
      </span>
    </div>
  )
}

export function IGPOverview() {
  const dash = useExecutiveDashboard()
  const d = dash.data

  const readinessDonut = useMemo(
    () =>
      d
        ? {
            labels: ['Readiness index', 'Open items'],
            datasets: [
              {
                data: [d.readiness.readinessPercent, Math.max(0, 100 - d.readiness.readinessPercent)],
                backgroundColor: [chartColors.green, chartColors.border],
                borderColor: '#0A1628',
                borderWidth: 4,
              },
            ],
          }
        : null,
    [d],
  )

  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">National overview</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Live KPIs from operations database · same signals as command view (§M26)</p>
      </header>

      {dash.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {dash.error instanceof Error ? dash.error.message : 'Could not load executive summary'}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BigKpi
          value={d ? fmt(d.kpis.registeredPus) : '—'}
          label="Registered PUs (system)"
          color="text-[#00C896]"
          loading={dash.isLoading}
        />
        <BigKpi
          value={d ? fmt(d.kpis.activeFieldOfficers) : '—'}
          label="Active field officers"
          color="text-[#3B82F6]"
          loading={dash.isLoading}
        />
        <BigKpi
          value={d ? fmt(d.geography.pollingUnits) : '—'}
          label="PU catalog (geography)"
          color="text-[#F59E0B]"
          loading={dash.isLoading}
        />
        <BigKpi
          value={d ? fmt(d.kpis.pendingApprovals) : '—'}
          label="Pending approvals"
          color="text-[#EF4444]"
          loading={dash.isLoading}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Readiness index</div>
          {readinessDonut ? (
            <Doughnut
              data={readinessDonut}
              options={{
                cutout: '65%',
                plugins: {
                  legend: { position: 'right', labels: { color: chartColors.muted } },
                  tooltip: chartTooltipTheme(),
                },
              }}
            />
          ) : (
            <p className="py-12 text-center text-sm text-[var(--portal-muted)]">{dash.isLoading ? 'Loading…' : '—'}</p>
          )}
        </div>
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">National footprint</div>
          <dl className="grid gap-3 text-sm text-[var(--portal-muted)]">
            <div className="flex justify-between border-b border-[color:var(--portal-border)] pb-2">
              <dt>States &amp; FCT</dt>
              <dd className="font-(--font-mono) text-[var(--portal-fg)]">{d ? fmt(d.geography.statesAndFct) : '—'}</dd>
            </div>
            <div className="flex justify-between border-b border-[color:var(--portal-border)] pb-2">
              <dt>LGAs</dt>
              <dd className="font-(--font-mono) text-[var(--portal-fg)]">{d ? fmt(d.geography.lgas) : '—'}</dd>
            </div>
            <div className="flex justify-between border-b border-[color:var(--portal-border)] pb-2">
              <dt>Wards</dt>
              <dd className="font-(--font-mono) text-[var(--portal-fg)]">{d ? fmt(d.geography.wards) : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Parties registered</dt>
              <dd className="font-(--font-mono) text-[#00C896]">{d ? fmt(d.kpis.partiesRegistered) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-[var(--portal-dim)]">
            Readiness checklist drives the doughnut; geography reflects imported INEC hierarchy.
          </p>
        </div>
      </div>
    </div>
  )
}

function BigKpi({
  value,
  label,
  color,
  loading,
}: {
  value: string
  label: string
  color: string
  loading?: boolean
}) {
  return (
    <div className="rounded-2xl border border-[#00C896]/15 bg-gradient-to-br from-white/[0.04] to-[#00C896]/5 p-6 text-center">
      <div className={`font-(--font-syne) text-4xl font-extrabold ${loading ? 'animate-pulse text-[var(--portal-dim)]' : color}`}>
        {loading ? '…' : value}
      </div>
      <div className="mt-2 text-xs text-[var(--portal-muted)]">{label}</div>
    </div>
  )
}

export function IGPSecurity() {
  const dash = useExecutiveDashboard()
  const d = dash.data

  const lineData =
    d &&
    ({
      labels: d.chart.labels,
      datasets: [
        {
          label: 'Submissions',
          data: d.chart.submissions,
          borderColor: chartColors.green,
          backgroundColor: 'rgba(0,200,150,.08)',
          fill: true,
          tension: 0.35,
        },
        {
          label: 'Incidents',
          data: d.chart.incidents,
          borderColor: chartColors.red,
          backgroundColor: 'rgba(239,68,68,.08)',
          fill: true,
          tension: 0.35,
        },
      ],
    })

  const doughnut = useMemo(() => {
    if (!d) return null
    const ts = d.chart.submissions.reduce((a, b) => a + b, 0)
    const ti = d.chart.incidents.reduce((a, b) => a + b, 0)
    const safe = ts + ti > 0 ? (ts / (ts + ti)) * 100 : 100
    const risk = Math.min(100, Math.max(0, 100 - safe))
    return {
      labels: ['Operational tempo (submissions)', 'Incident load'],
      datasets: [
        {
          data: [Math.round(safe * 10) / 10, Math.round(risk * 10) / 10],
          backgroundColor: [chartColors.green, chartColors.red],
          borderColor: '#0A1628',
          borderWidth: 2,
        },
      ],
    }
  }, [d])

  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Security status</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Hourly submissions vs incidents from dashboard snapshots · doughnut = relative load (§M27)
        </p>
      </header>

      {dash.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {dash.error instanceof Error ? dash.error.message : 'Could not load metrics'}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          {doughnut ? (
            <Doughnut
              data={doughnut}
              options={{
                cutout: '60%',
                plugins: { legend: { labels: { color: chartColors.muted } }, tooltip: chartTooltipTheme() },
              }}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--portal-muted)]">{dash.isLoading ? 'Loading…' : '—'}</p>
          )}
        </div>
        <div className={card}>
          {lineData ? (
            <Line
              data={lineData}
              options={{
                plugins: { legend: { labels: { color: chartColors.muted } }, tooltip: chartTooltipTheme() },
                scales: {
                  x: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
                  y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
                },
              }}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--portal-muted)]">{dash.isLoading ? 'Loading…' : '—'}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export function IGPResults() {
  const listQ = useIgpElectionList()
  const [slug, setSlug] = useState<string | null>(null)
  const resQ = useIgpElectionResults(slug)

  useEffect(() => {
    const rows = listQ.data?.elections
    if (!rows?.length) return
    setSlug((s) => (s && rows.some((e) => e.slug === s) ? s : rows[0].slug))
  }, [listQ.data?.elections])

  const nationalBar = useMemo(() => {
    const nat = resQ.data?.nationalByParty
    if (!nat?.length) return null
    return {
      labels: nat.map((p) => p.abbreviation || p.name),
      datasets: [
        {
          label: 'Votes (national aggregate)',
          data: nat.map((p) => p.votes),
          backgroundColor: nat.map((_, i) => partyChartColor(i)),
          borderRadius: 6,
        },
      ],
    }
  }, [resQ.data?.nationalByParty])

  const nationalDoughnut = useMemo(() => {
    const nat = resQ.data?.nationalByParty
    if (!nat?.length) return null
    return {
      labels: nat.map((p) => p.abbreviation || p.name),
      datasets: [
        {
          data: nat.map((p) => p.votes),
          backgroundColor: nat.map((_, i) => partyChartColor(i)),
          borderColor: '#0A1628',
          borderWidth: 2,
        },
      ],
    }
  }, [resQ.data?.nationalByParty])

  const stackedStates = useMemo(() => {
    const st = resQ.data?.stackedByState
    if (!st?.labels.length || !st.parties.length) return null
    return {
      labels: st.labels,
      datasets: st.parties.map((p, i) => ({
        label: p.abbreviation || p.name,
        data: st.matrix[i] ?? st.labels.map(() => 0),
        backgroundColor: partyChartColor(i),
        borderRadius: 0,
        stack: 's',
      })),
    }
  }, [resQ.data?.stackedByState])

  const meta = resQ.data?.meta
  const election = resQ.data?.election

  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Election results</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">
            National and state breakdowns from PU uploads · auto-refresh every 12s
          </p>
        </div>
        <label className="block min-w-[220px] text-[13px]">
          <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Election</span>
          <select
            value={slug ?? ''}
            onChange={(e) => setSlug(e.target.value || null)}
            disabled={listQ.isLoading || !listQ.data?.elections?.length}
            className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          >
            {(listQ.data?.elections ?? []).map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name} ({e.status})
              </option>
            ))}
          </select>
        </label>
      </header>

      {listQ.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {listQ.error instanceof Error ? listQ.error.message : 'Could not load elections'}
        </p>
      ) : null}

      {meta && election ? (
        <div className="sr-card flex flex-wrap gap-4 text-sm text-[var(--portal-muted)]">
          <div>
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Reporting PUs</span>
            <div className="mt-0.5 font-(--font-syne) text-lg text-[var(--portal-fg)]">
              {fmt(meta.reportingPollingUnits)}
            </div>
          </div>
          <div>
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Total votes recorded</span>
            <div className="mt-0.5 font-(--font-syne) text-lg text-[#00C896]">{fmt(meta.totalVotes)}</div>
          </div>
          <div>
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Last upload</span>
            <div className="mt-0.5 text-[var(--portal-fg)]">
              {meta.lastUploadedAt
                ? new Date(meta.lastUploadedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                : '—'}
            </div>
          </div>
        </div>
      ) : null}

      {resQ.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {resQ.error instanceof Error ? resQ.error.message : 'Could not load results'}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">National — votes by party</div>
          {resQ.isLoading && <p className="py-12 text-center text-sm text-[var(--portal-muted)]">Loading…</p>}
          {!resQ.isLoading && nationalBar && meta && meta.totalVotes > 0 ? (
            <Bar
              data={nationalBar}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
                scales: {
                  x: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
                  y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
                },
              }}
            />
          ) : null}
          {!resQ.isLoading && (!meta || meta.totalVotes === 0) ? (
            <p className="py-8 text-center text-sm text-[var(--portal-muted)]">No vote totals yet — field PUs have not uploaded tallies for this election.</p>
          ) : null}
        </div>
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">National — share (all PUs)</div>
          {resQ.isLoading && <p className="py-12 text-center text-sm text-[var(--portal-muted)]">Loading…</p>}
          {!resQ.isLoading && nationalDoughnut && meta && meta.totalVotes > 0 ? (
            <Doughnut
              data={nationalDoughnut}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { position: 'bottom', labels: { color: chartColors.muted, boxWidth: 12 } },
                  tooltip: chartTooltipTheme(),
                },
              }}
            />
          ) : null}
          {!resQ.isLoading && (!meta || meta.totalVotes === 0) ? (
            <p className="py-8 text-center text-sm text-[var(--portal-muted)]">Charts appear once collation data exists.</p>
          ) : null}
        </div>
      </div>

      <div className={card}>
        <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">
          By state — votes by party (stacked)
        </div>
        <p className="mb-4 text-xs text-[var(--portal-muted)]">
          Each row is a state; segments are parties reporting from PUs in that state.
        </p>
        {resQ.isLoading && <p className="py-12 text-center text-sm text-[var(--portal-muted)]">Loading…</p>}
        {!resQ.isLoading && stackedStates && meta && meta.totalVotes > 0 ? (
          <div style={{ minHeight: Math.min(900, Math.max(280, (stackedStates.labels?.length ?? 0) * 24)) }} className="relative">
            <Bar
              data={stackedStates}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { color: chartColors.muted, boxWidth: 10 } },
                  tooltip: chartTooltipTheme(),
                },
                scales: {
                  x: {
                    stacked: true,
                    ticks: { color: chartColors.muted },
                    grid: { color: chartColors.border },
                  },
                  y: {
                    stacked: true,
                    ticks: { color: chartColors.muted, font: { size: 10 } },
                    grid: { display: false },
                  },
                },
              }}
            />
          </div>
        ) : null}
        {!resQ.isLoading && (!stackedStates || !meta || meta.totalVotes === 0) ? (
          <p className="py-8 text-center text-sm text-[var(--portal-muted)]">State breakdown appears when uploaded results span at least one state.</p>
        ) : null}
      </div>
    </div>
  )
}

export function IGPHotspots() {
  const mapQ = useFieldOpsMap()
  const pinProps = useMemo(() => {
    const data = mapQ.data
    if (!data) return []
    return [
      ...data.active.map((a) => ({
        lat: a.lat,
        lng: a.lng,
        label: `${a.displayName} · ${a.stateHint}`,
        severity: 'green' as const,
      })),
      ...data.inactive.slice(0, 48).map((u) => ({
        lat: u.lat,
        lng: u.lng,
        label: `${u.displayName} — ${u.reason}`,
        severity: 'amber' as const,
      })),
    ]
  }, [mapQ.data])

  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">National deployment map</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Field officers plotted from provisioned NPF accounts (coordinates derived for demo layout) — green active, amber pending (§M29)
        </p>
      </header>

      {mapQ.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {mapQ.error instanceof Error ? mapQ.error.message : 'Could not load map data'}
        </p>
      ) : null}

      {mapQ.isLoading ? (
        <div className={`${card} py-16 text-center text-sm text-[var(--portal-muted)]`}>Loading deployment…</div>
      ) : pinProps.length === 0 ? (
        <div className={`${card} py-16 text-center text-sm text-[var(--portal-muted)]`}>
          No field officers provisioned yet — use Admin → credential batches to deploy accounts.
        </div>
      ) : (
        <NigeriaMap pins={pinProps} height="400px" hint="Executive security overview — field roster positions" />
      )}
    </div>
  )
}

export function IGPTimeline() {
  const dash = useExecutiveDashboard()
  const d = dash.data

  const rows = useMemo(() => {
    if (!d?.chart.labels.length) return []
    return d.chart.labels.map((lab, i) => ({
      hour: `${lab}:00`,
      submissions: d.chart.submissions[i] ?? 0,
      incidents: d.chart.incidents[i] ?? 0,
    }))
  }, [d])

  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Operational timeline</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Hourly slice from latest dashboard snapshot — complements Security charts (§M30)
        </p>
      </header>

      {dash.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {dash.error instanceof Error ? dash.error.message : 'Could not load timeline'}
        </p>
      ) : null}

      <div className={card}>
        {dash.isLoading ? (
          <p className="py-8 text-center text-sm text-[var(--portal-muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--portal-muted)]">No hourly metrics loaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[color:var(--portal-border)] text-[var(--portal-dim)]">
                  <th className="pb-2 pr-4 font-(--font-mono) text-[10px] uppercase">Hour (WAT)</th>
                  <th className="pb-2 pr-4 font-(--font-mono) text-[10px] uppercase">Submissions</th>
                  <th className="pb-2 font-(--font-mono) text-[10px] uppercase">Incidents</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hour} className="border-b border-[color:var(--portal-border)]/80 text-[var(--portal-muted)]">
                    <td className="py-2 pr-4 font-(--font-mono) text-[11px] text-[var(--portal-fg)]">{r.hour}</td>
                    <td className="py-2 pr-4">{fmt(r.submissions)}</td>
                    <td className="py-2">{fmt(r.incidents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function IGPBriefing() {
  const dash = useExecutiveDashboard()
  const d = dash.data

  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Executive briefing</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">
            RESTRICTED · snapshot generated from current portal session data (§M31)
          </p>
        </div>
        <button
          type="button"
          disabled
          className="rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-4 py-2 text-sm font-semibold text-[var(--portal-muted)]"
          title="PDF export when wired"
        >
          PDF (soon)
        </button>
      </header>

      {dash.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {dash.error instanceof Error ? dash.error.message : 'Could not load briefing data'}
        </p>
      ) : null}

      <div className={`${card} border-l-4 border-[#00C896]`}>
        <div className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
          Classification: RESTRICTED · NPF operational intelligence
        </div>
        {dash.isLoading ? (
          <p className="mt-4 text-sm text-[var(--portal-muted)]">Loading briefing…</p>
        ) : d ? (
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--portal-muted)]">
            <p>
              <span className="font-semibold text-[var(--portal-fg)]">Readiness:</span> {d.readiness.readinessPercent}% of checklist items
              marked complete ({d.readiness.items.filter((x) => x.status === 'done').length}/{d.readiness.items.length} items).
            </p>
            <p>
              <span className="font-semibold text-[var(--portal-fg)]">Field force:</span> {fmt(d.kpis.activeFieldOfficers)} active officers
              provisioned; {fmt(d.kpis.pendingApprovals)} approvals pending.
            </p>
            <p>
              <span className="font-semibold text-[var(--portal-fg)]">Geography:</span> {fmt(d.geography.statesAndFct)} states/FCT,{' '}
              {fmt(d.geography.lgas)} LGAs, {fmt(d.geography.pollingUnits)} polling units in catalog.
            </p>
            <p>
              <span className="font-semibold text-[var(--portal-fg)]">Parties:</span> {fmt(d.kpis.partiesRegistered)} registered in system.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--portal-muted)]">No data.</p>
        )}
      </div>
    </div>
  )
}
