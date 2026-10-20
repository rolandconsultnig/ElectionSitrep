import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut } from 'react-chartjs-2'
import { chartColors, chartTooltipTheme } from '../charts/register'
import { apiJson } from '../lib/api'
import type { ElectionResultsPayload, OfficialElectionTotals } from '../pages/portal/igp-portal-types'

const card = 'sr-card'

type OfficialPartyRow = NonNullable<ElectionResultsPayload['official']>['byParty'][number]

function fmt(n: number) {
  return new Intl.NumberFormat('en-NG').format(n)
}

const PARTY_CHART_PALETTE = [
  '#d9b64a',
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

function useElectionList() {
  return useQuery({
    queryKey: ['igp-elections'],
    queryFn: () =>
      apiJson<{ elections: { slug: string; name: string; status: string; electionDate: string | null }[] }>(
        '/api/igp/elections',
      ),
  })
}

function useElectionResults(slug: string | null) {
  return useQuery({
    queryKey: ['igp-election-results', slug],
    queryFn: () =>
      apiJson<ElectionResultsPayload>(`/api/igp/election-results/${encodeURIComponent(slug!)}`),
    enabled: Boolean(slug),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  })
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">{label}</span>
      <div className="mt-0.5 font-(--font-syne) text-lg" style={{ color: tone ?? 'var(--portal-fg)' }}>
        {value}
      </div>
    </div>
  )
}

/**
 * INEC-declared result block. Only rendered for concluded elections whose
 * official figures have been loaded (migration_028 + load-official-results).
 * Kept visually distinct from the live PU aggregate so the two are never
 * mistaken for each other — NPF monitors results, INEC declares them.
 */
function OfficialDeclaration({
  totals,
  byParty,
  collatedVotes,
}: {
  totals: OfficialElectionTotals | null
  byParty: OfficialPartyRow[]
  collatedVotes: number
}) {
  const bar = useMemo(() => {
    if (!byParty.length) return null
    return {
      labels: byParty.map((p) => p.abbreviation || p.name),
      datasets: [
        {
          label: 'Official votes (INEC declared)',
          data: byParty.map((p) => p.votes),
          backgroundColor: byParty.map((_, i) => partyChartColor(i)),
          borderRadius: 6,
        },
      ],
    }
  }, [byParty])

  const turnout =
    totals?.registeredVoters && totals?.accreditedVoters
      ? Math.round((totals.accreditedVoters / totals.registeredVoters) * 1000) / 10
      : null

  const omitted = Object.entries(totals?.omittedParties ?? {})
  const coverage =
    totals?.validVotes && totals.validVotes > 0
      ? Math.round((collatedVotes / totals.validVotes) * 1000) / 10
      : null

  return (
    <div className={`${card} border-l-4 border-[#d9b64a]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-(--font-syne) text-sm font-semibold text-[#d9b64a]">
            INEC official declaration
          </div>
          <p className="mt-1 text-xs text-[var(--portal-muted)]">
            Declared figures of record. NPF collation below is monitoring data and does not supersede this.
          </p>
        </div>
        {totals?.declaredWinnerCandidate ? (
          <div className="rounded-lg border border-[#d9b64a]/30 bg-[#d9b64a]/10 px-3 py-2 text-right">
            <div className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Declared winner</div>
            <div className="font-(--font-syne) text-sm font-bold text-[#d9b64a]">
              {totals.declaredWinnerCandidate}
              {totals.declaredWinnerParty ? ` (${totals.declaredWinnerParty})` : ''}
            </div>
          </div>
        ) : null}
      </div>

      {totals ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {totals.registeredVoters != null && <Figure label="Registered" value={fmt(totals.registeredVoters)} />}
          {totals.accreditedVoters != null && (
            <Figure label="Accredited" value={fmt(totals.accreditedVoters)} />
          )}
          {totals.votesCast != null && <Figure label="Votes cast" value={fmt(totals.votesCast)} />}
          {totals.validVotes != null && (
            <Figure label="Valid votes" value={fmt(totals.validVotes)} tone="#d9b64a" />
          )}
          {totals.rejectedVotes != null && <Figure label="Rejected" value={fmt(totals.rejectedVotes)} />}
          {turnout != null && <Figure label="Turnout" value={`${turnout}%`} />}
        </div>
      ) : null}

      {bar ? (
        <div className="mt-6">
          <Bar
            data={bar}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
              scales: {
                x: { ticks: { color: chartColors.muted }, grid: { display: false } },
                y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
              },
            }}
          />
        </div>
      ) : null}

      {byParty.length ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--portal-border)] text-[var(--portal-dim)]">
                <th className="pb-2 pr-4 font-(--font-mono) text-[10px] uppercase">Party</th>
                <th className="pb-2 pr-4 font-(--font-mono) text-[10px] uppercase">Official votes</th>
                <th className="pb-2 font-(--font-mono) text-[10px] uppercase">Share of valid</th>
              </tr>
            </thead>
            <tbody>
              {byParty.map((p) => (
                <tr
                  key={p.abbreviation || p.name}
                  className="border-b border-[color:var(--portal-border)]/80 text-[var(--portal-muted)]"
                >
                  <td className="py-2 pr-4 font-(--font-mono) text-[11px] text-[var(--portal-fg)]">
                    {p.abbreviation || p.name}
                  </td>
                  <td className="py-2 pr-4">{fmt(p.votes)}</td>
                  <td className="py-2">{p.voteShare}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 space-y-1 text-xs text-[var(--portal-muted)]">
        {coverage != null ? (
          <p>
            NPF field collation currently accounts for {fmt(collatedVotes)} votes — {coverage}% of the official
            valid total.
          </p>
        ) : null}
        {omitted.length ? (
          <p>
            Parties outside the seeded INEC catalog are excluded from the table but counted in the valid total:{' '}
            {omitted.map(([abbr, v]) => `${abbr} ${fmt(v)}`).join(', ')}.
          </p>
        ) : null}
        {totals?.declaredAt ? (
          <p>
            Declared {new Date(totals.declaredAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {totals.returningOfficer ? ` by ${totals.returningOfficer}` : ''}.
          </p>
        ) : null}
        {totals?.source ? <p className="text-[var(--portal-dim)]">Source: {totals.source}</p> : null}
      </div>
    </div>
  )
}

/**
 * Shared election results view used by both the IGP (§M28) and Management
 * (§M21) portals — same API payload, same official/live split, so the two
 * command tiers can never read different numbers off the same election.
 */
export function ElectionResultsView({ heading, subheading }: { heading: string; subheading: string }) {
  const listQ = useElectionList()
  const [slug, setSlug] = useState<string | null>(null)
  const resQ = useElectionResults(slug)

  const [prevElections, setPrevElections] = useState(listQ.data?.elections)

  if (listQ.data?.elections !== prevElections) {
    setPrevElections(listQ.data?.elections)
    const rows = listQ.data?.elections
    if (rows?.length) {
      setSlug((s) => (s && rows.some((e) => e.slug === s) ? s : rows[0].slug))
    }
  }

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
          borderColor: '#0a1510',
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
  const official = resQ.data?.official

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">{heading}</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">{subheading}</p>
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

      {official ? (
        <OfficialDeclaration
          totals={official.totals}
          byParty={official.byParty}
          collatedVotes={meta?.totalVotes ?? 0}
        />
      ) : null}

      {meta && election ? (
        <div className={`${card} flex flex-wrap gap-4 text-sm text-[var(--portal-muted)]`}>
          <Figure label="Reporting PUs" value={fmt(meta.reportingPollingUnits)} />
          <Figure label="Total votes recorded" value={fmt(meta.totalVotes)} tone="#d9b64a" />
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
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">
            NPF collation — votes by party
          </div>
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
            <p className="py-8 text-center text-sm text-[var(--portal-muted)]">
              No vote totals yet — field PUs have not uploaded tallies for this election.
            </p>
          ) : null}
        </div>
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">
            NPF collation — share (all PUs)
          </div>
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
            <p className="py-8 text-center text-sm text-[var(--portal-muted)]">
              Charts appear once collation data exists.
            </p>
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
          <div
            style={{ minHeight: Math.min(900, Math.max(280, (stackedStates.labels?.length ?? 0) * 24)) }}
            className="relative"
          >
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
                  x: { stacked: true, ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
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
          <p className="py-8 text-center text-sm text-[var(--portal-muted)]">
            State breakdown appears when uploaded results span at least one state.
          </p>
        ) : null}
      </div>
    </div>
  )
}
