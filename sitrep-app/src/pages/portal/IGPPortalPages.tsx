import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Doughnut, Line } from 'react-chartjs-2'
import { chartColors, chartTooltipTheme } from '../../charts/register'
import { CommandOfficerMap } from '../../components/CommandOfficerMap'
import { ElectionResultsView } from '../../components/ElectionResultsView'
import { IGPExecutiveDashboard } from '../../components/IGPExecutiveDashboard'
import { apiJson } from '../../lib/api'
import type { ExecutiveDashboardSummary } from './igp-portal-types'

const card = 'sr-card'

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG').format(n)
}

function useExecutiveDashboard() {
  return useQuery({
    queryKey: ['igp-dashboard-summary'],
    queryFn: () => apiJson<ExecutiveDashboardSummary>('/api/igp/dashboard-summary'),
  })
}

export function IGPReadOnlyBanner() {
  return null
}

export function IGPOverview() {
  const dash = useExecutiveDashboard()
  const d = dash.data

  return (
    <div className="-m-4 sm:-m-6 md:-m-8">
      <IGPExecutiveDashboard 
        kpis={d?.kpis || { registeredPus: 0, activeFieldOfficers: 0, pendingApprovals: 0, partiesRegistered: 0 }}
        geography={d?.geography || { statesAndFct: 0, lgas: 0, wards: 0, pollingUnits: 0 }}
        readiness={d?.readiness || { items: [], readinessPercent: 0 }}
        isLoading={dash.isLoading}
        isError={dash.isError}
      />
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
          borderColor: '#0a1510',
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
  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <ElectionResultsView
        heading="Election results"
        subheading="INEC official declaration where available, plus live PU collation · auto-refresh every 12s"
      />
    </div>
  )
}

export function IGPHotspots() {
  return (
    <div className="space-y-6">
      <IGPReadOnlyBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Live Officer &amp; Incident Map</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Live officer positions, safety status, and open incidents.</p>
      </header>
      <CommandOfficerMap />
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

      <div className={`${card} border-l-4 border-[#d9b64a]`}>
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
