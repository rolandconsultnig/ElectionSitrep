import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Line } from 'react-chartjs-2'
import { ElectionCalendarModal } from '../../components/ElectionCalendarModal'
import { ElectionSetupWizard } from '../../components/ElectionSetupWizard'
import { OperationsMap } from '../../components/OperationsMap'
import type { GeoFeatureCollection } from '../../components/operations-map-types'
import { PartyLogo } from '../../components/PartyLogo'
import { chartColors, chartTooltipTheme } from '../../charts/register'
import { apiFetch, apiJson } from '../../lib/api'

type ApiParty = {
  id: string
  inecRegisterCode: string
  name: string
  abbreviation: string
  status: string
  logoUrl: string | null
  logoDataUrl: string | null
  annexSn?: number | null
  presidentialCandidate?: string | null
}

type DashboardSummary = {
  kpis: {
    registeredPus: number
    activeFieldOfficers: number
    pendingApprovals: number
    partiesRegistered: number
  }
  chart: { labels: string[]; submissions: number[]; incidents: number[] }
  readiness: {
    items: { label: string; status: 'done' | 'progress' | 'pending' }[]
    readinessPercent: number
  }
  recentProvisioning: { username: string; officer: string; role: string; state: string; status: string }[]
}

type ElectionApiRow = {
  slug: string
  name: string
  electionType: string
  electionDate: string | null
  jurisdictionsCount: number
  puCount: number
  status: string
  votingCloseTime: string | null
  ruleEnforcement: string | null
  electionCategory?: string
  contestTypes?: string[]
  isRerun?: boolean
  governorshipStateId?: number | null
  governorshipAllStates?: boolean
}

function formatElectionMonth(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

const card = 'sr-card'
const th = 'px-3 py-2 text-left font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]'
const td = 'border-t border-[color:var(--portal-border)] px-3 py-2 text-[13px] text-[var(--portal-muted)]'

export function AdminDashboard() {
  const navigate = useNavigate()
  const [calOpen, setCalOpen] = useState(false)
  const dash = useQuery({
    queryKey: ['admin-dashboard-summary'],
    queryFn: () => apiJson<DashboardSummary>('/api/admin/dashboard-summary'),
  })
  const electionsCal = useQuery({
    queryKey: ['admin-elections'],
    queryFn: () => apiJson<{ elections: ElectionApiRow[] }>('/api/admin/elections'),
  })

  const chartJsData =
    dash.data &&
    ({
      labels: dash.data.chart.labels,
      datasets: [
        {
          label: 'Submissions',
          data: dash.data.chart.submissions,
          borderColor: chartColors.green,
          backgroundColor: 'rgba(0,200,150,.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
        {
          label: 'Incidents',
          data: dash.data.chart.incidents,
          borderColor: chartColors.red,
          backgroundColor: 'rgba(239,68,68,.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
        },
      ],
    })

  if (dash.isLoading) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--portal-muted)]">Loading dashboard…</p>
      </div>
    )
  }

  if (dash.isError || !dash.data || !chartJsData) {
    return (
      <div className="space-y-6">
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {dash.isError ? (dash.error as Error).message : 'No dashboard data'}
        </p>
      </div>
    )
  }

  const d = dash.data
  const fmt = (n: number) => n.toLocaleString('en-NG')
  const pct = d.readiness.readinessPercent

  return (
    <div className="space-y-6">
      <ElectionCalendarModal
        open={calOpen}
        onClose={() => setCalOpen(false)}
        elections={(electionsCal.data?.elections ?? []).map((e) => ({
          name: e.name,
          electionDate: e.electionDate,
          electionType: e.electionType,
          status: e.status,
        }))}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">System health · Election readiness · NPF technical foundation</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] px-4 py-2.5 font-(--font-mono) text-xs font-semibold uppercase tracking-wider text-[#0dccb0] transition hover:border-[#0dccb0]/40"
          onClick={() => setCalOpen(true)}
        >
          <span aria-hidden>📅</span>
          Election calendar
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered PUs" value={fmt(d.kpis.registeredPus)} hint="National coverage" tone="green" />
        <Stat label="Active field officers" value={fmt(d.kpis.activeFieldOfficers)} hint="Provisioned NPF accounts" tone="blue" />
        <Stat label="Parties registered" value={fmt(d.kpis.partiesRegistered)} hint="INEC-accredited" tone="amber" />
        <Stat label="Pending approvals" value={fmt(d.kpis.pendingApprovals)} hint="Requires action" tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`lg:col-span-2 ${card}`}>
          <div className="mb-4 flex items-center justify-between font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">
            Volume — last 24h
            <span className="font-(--font-mono) text-[10px] font-normal text-[var(--portal-dim)]">Submissions vs incidents</span>
          </div>
          <Line
            data={chartJsData}
            options={{
              responsive: true,
              plugins: {
                legend: { labels: { color: chartColors.muted, boxWidth: 10 } },
                tooltip: chartTooltipTheme(),
              },
              scales: {
                x: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
                y: { ticks: { color: chartColors.muted }, grid: { color: chartColors.border } },
              },
            }}
          />
        </div>
        <div className={card}>
          <div className="font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Election readiness</div>
          {d.readiness.items.map((item) => (
            <ReadinessRow key={item.label} label={item.label} status={item.status} />
          ))}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--portal-input-bg)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00C896] to-[#00A87C]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 font-(--font-mono) text-[10px] text-[var(--portal-dim)]">{pct}% readiness</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Recent provisioning</div>
          <table className="w-full text-sm">
            <thead>
              <tr className={th}>
                <th className={th}>Officer</th>
                <th className={th}>Role</th>
                <th className={th}>State</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {d.recentProvisioning.length === 0 ? (
                <tr>
                  <td colSpan={4} className={`${td} text-[var(--portal-dim)]`}>
                    No provisioned accounts yet.
                  </td>
                </tr>
              ) : (
                d.recentProvisioning.map((row) => (
                  <tr key={row.username}>
                    <td className={`${td} text-[var(--portal-fg)]`}>{row.officer}</td>
                    <td className={td}>{row.role}</td>
                    <td className={td}>{row.state}</td>
                    <td className={td}>
                      <span
                        className={
                          row.status === 'Active'
                            ? 'rounded bg-[#00C896]/15 px-2 py-0.5 text-[11px] text-[#00C896]'
                            : 'rounded bg-[#F59E0B]/15 px-2 py-0.5 text-[11px] text-[#F59E0B]'
                        }
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Quick actions</div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded-lg bg-[#00C896] px-4 py-2 text-sm font-semibold text-[#0A1628]"
              onClick={() => navigate('/admin/elections')}
            >
              Configure active election
            </button>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2 text-sm text-[var(--portal-muted)]"
              onClick={() => navigate('/admin/credential-batches')}
            >
              Credential batches (provision officers)
            </button>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2 text-sm text-[var(--portal-muted)]"
              onClick={() => navigate('/admin/audit')}
            >
              View audit log
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: 'green' | 'blue' | 'amber' | 'red'
}) {
  const c =
    tone === 'green'
      ? 'text-[#00C896]'
      : tone === 'blue'
        ? 'text-[#3B82F6]'
        : tone === 'amber'
          ? 'text-[#F59E0B]'
          : 'text-[#EF4444]'
  return (
    <div className={`${card} relative overflow-hidden`}>
      <div className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-muted)]">{label}</div>
      <div className={`mt-2 font-(--font-syne) text-3xl font-bold ${c}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--portal-dim)]">{hint}</div> : null}
    </div>
  )
}

function ReadinessRow({ label, status }: { label: string; status: 'done' | 'progress' | 'pending' }) {
  const badge =
    status === 'done'
      ? 'bg-[#00C896]/15 text-[#00C896]'
      : status === 'progress'
        ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
        : 'bg-[#EF4444]/15 text-[#EF4444]'
  const text = status === 'done' ? 'Done' : status === 'progress' ? 'In progress' : 'Pending'
  return (
    <div className="mb-2 flex items-center justify-between text-[13px]">
      <span className="text-[var(--portal-muted)]">{label}</span>
      <span className={`rounded px-2 py-0.5 text-[11px] ${badge}`}>{text}</span>
    </div>
  )
}

export function AdminElections() {
  const qc = useQueryClient()
  const electionsQuery = useQuery({
    queryKey: ['admin-elections'],
    queryFn: () => apiJson<{ elections: ElectionApiRow[] }>('/api/admin/elections'),
  })

  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardMode, setWizardMode] = useState<'create' | 'edit'>('create')
  const [wizardEditSlug, setWizardEditSlug] = useState<string | null>(null)

  return (
    <div className="relative space-y-6">
      <ElectionSetupWizard
        open={wizardOpen}
        mode={wizardMode}
        editSlug={wizardEditSlug}
        onClose={() => {
          setWizardOpen(false)
          setWizardEditSlug(null)
        }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['admin-elections'] })
          if (wizardEditSlug) void qc.invalidateQueries({ queryKey: ['election-setup', wizardEditSlug] })
        }}
      />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Election setup & configuration</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">
            Multiple concurrent elections · 25% Presidential rule · supplementary / court-order flags
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-[#00C896] px-4 py-2 text-sm font-semibold text-[#0A1628]"
          onClick={() => {
            setWizardMode('create')
            setWizardEditSlug(null)
            setWizardOpen(true)
          }}
        >
          + New election
        </button>
      </header>
      {electionsQuery.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {(electionsQuery.error as Error).message}
        </p>
      ) : null}
      <div className={card}>
        {electionsQuery.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading elections…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Election</th>
                <th className={th}>Type</th>
                <th className={th}>Date</th>
                <th className={th}>Jurisdictions</th>
                <th className={th}>PUs</th>
                <th className={th}>Status</th>
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(electionsQuery.data?.elections ?? []).map((e) => (
                <tr key={e.slug}>
                  <td className={`${td} font-medium text-[var(--portal-fg)]`}>{e.name}</td>
                  <td className={td}>{e.electionType}</td>
                  <td className={td}>{formatElectionMonth(e.electionDate)}</td>
                  <td className={td}>{e.jurisdictionsCount}</td>
                  <td className={td}>{e.puCount.toLocaleString('en-NG')}</td>
                  <td className={td}>
                    <span className="rounded bg-[#00C896]/15 px-2 py-0.5 text-[11px] capitalize text-[#00C896]">{e.status}</span>
                  </td>
                  <td className={td}>
                    <button
                      type="button"
                      className="rounded-lg border border-[color:var(--portal-border)] px-3 py-1 text-[12px] font-medium text-[#0dccb0] hover:bg-[var(--portal-table-row-hover)]"
                      onClick={() => {
                        setWizardMode('edit')
                        setWizardEditSlug(e.slug)
                        setWizardOpen(true)
                      }}
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function AdminParties() {
  const qc = useQueryClient()
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  const partiesQuery = useQuery({
    queryKey: ['parties'],
    queryFn: async () => {
      const res = await apiFetch('/api/parties')
      const data = await parseJsonResponse(res)
      const parties = (data as { parties: ApiParty[] }).parties
      return parties
    },
  })

  const uploadLogo = useMutation({
    mutationFn: async ({ registerCode, file }: { registerCode: string; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch(`/api/parties/${encodeURIComponent(registerCode)}/logo`, { method: 'PUT', body: fd })
      await parseJsonResponse(res)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parties'] })
    },
  })

  const removeLogo = useMutation({
    mutationFn: async (registerCode: string) => {
      const res = await apiFetch(`/api/parties/${encodeURIComponent(registerCode)}/logo`, { method: 'DELETE' })
      await parseJsonResponse(res)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parties'] })
    },
  })

  const onPickFile = useCallback(
    (registerCode: string, file: File | undefined) => {
      setUploadErr(null)
      if (!file) return
      uploadLogo.mutate(
        { registerCode, file },
        { onError: (e: Error) => setUploadErr(e.message) },
      )
    },
    [uploadLogo],
  )

  const onRemoveUpload = useCallback(
    (registerCode: string) => {
      setUploadErr(null)
      removeLogo.mutate(registerCode, { onError: (e: Error) => setUploadErr(e.message) })
    },
    [removeLogo],
  )

  const parties = partiesQuery.data
  const busy = uploadLogo.isPending || removeLogo.isPending

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Political parties</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          INEC-accredited parties ({parties?.length ?? '…'}) · lifecycle Under Review → Active →
          Suspended · names aligned to{' '}
          <a
            href="https://www.inecnigeria.org/list-of-political-parties"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0dccb0] underline-offset-2 hover:underline"
          >
            INEC register
          </a>
        </p>
      </header>
      <div className={card}>
        {uploadErr ? (
          <p className="mb-4 rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
            {uploadErr}
          </p>
        ) : null}
        {partiesQuery.isError ? (
          <p className="mb-4 rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
            {(partiesQuery.error as Error).message}
          </p>
        ) : null}
        {partiesQuery.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading parties from the database…</p>
        ) : (
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-[color:var(--portal-table-row-hover)] shadow-[0_1px_0_var(--portal-border)]">
                <tr>
                  <th className={`${th} min-w-[140px]`}>Logo</th>
                  <th className={th}>Party</th>
                  <th className={th}>Abbr</th>
                  <th className={th}>Register ref.</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(parties ?? []).map((p) => {
                  const inputId = `party-logo-${p.inecRegisterCode}`
                  return (
                    <tr key={p.inecRegisterCode}>
                      <td className={`${td} align-top`}>
                        <div className="flex flex-col gap-2">
                          <PartyLogo
                            abbreviation={p.abbreviation}
                            partyName={p.name}
                            logoUrl={p.logoUrl ?? undefined}
                            uploadedDataUrl={p.logoDataUrl}
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              id={inputId}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              className="sr-only"
                              disabled={busy}
                              onChange={(e) => {
                                onPickFile(p.inecRegisterCode, e.target.files?.[0])
                                e.target.value = ''
                              }}
                            />
                            <label
                              htmlFor={inputId}
                              className={`cursor-pointer rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-2 py-1 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider text-[#0dccb0] transition hover:border-[#0dccb0]/50 ${busy ? 'pointer-events-none opacity-50' : ''}`}
                            >
                              Upload
                            </label>
                            {p.logoDataUrl ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="rounded-lg px-2 py-1 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider text-[var(--portal-muted)] underline-offset-2 hover:text-[#fca5a5] hover:underline disabled:opacity-50"
                                onClick={() => onRemoveUpload(p.inecRegisterCode)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className={`${td} font-medium text-[var(--portal-fg)]`}>{p.name}</td>
                      <td className={td}>{p.abbreviation}</td>
                      <td className={`${td} font-(--font-mono) text-[12px]`}>{p.inecRegisterCode}</td>
                      <td className={td}>
                        <span className="rounded bg-[#00C896]/15 px-2 py-0.5 text-[11px] text-[#00C896]">{p.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 border-t border-[color:var(--portal-border)] pt-4 text-xs text-[var(--portal-dim)]">
          <strong className="text-[var(--portal-muted)]">Manual logos:</strong> upload PNG, JPEG, WebP, or SVG (max 3 MB server-side). Images are stored in PostgreSQL and served as data URLs in this workspace; uploads replace{' '}
          <code className="font-(--font-mono) text-[11px]">logoUrl</code> and default tiles. Built-in fallbacks remain under{' '}
          <code className="font-(--font-mono) text-[11px]">/party-logos/&lt;abbr&gt;.svg</code>.
        </p>
      </div>
    </div>
  )
}

export function AdminCandidates() {
  const electionsList = useQuery({
    queryKey: ['admin-elections'],
    queryFn: () => apiJson<{ elections: ElectionApiRow[] }>('/api/admin/elections'),
  })
  const slug = electionsList.data?.elections?.[0]?.slug ?? ''
  const candQuery = useQuery({
    queryKey: ['admin-candidates', slug],
    queryFn: () =>
      apiJson<{
        electionName: string
        candidates: {
          candidateName: string
          partyName: string
          partyAbbreviation: string
          runningMateName: string | null
          status: string
        }[]
      }>(`/api/admin/elections/${encodeURIComponent(slug)}/candidates`),
    enabled: Boolean(slug),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Candidates</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Per party · per election · sourced from INEC annex (database).
        </p>
      </header>
      <div className={card}>
        {electionsList.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading elections…</p>
        ) : !slug ? (
          <p className="text-sm text-[var(--portal-muted)]">
            No elections in the register yet. Add one under{' '}
            <strong className="text-[var(--portal-fg)]">Election setup &amp; configuration</strong>, then seed candidates via the
            API or database as needed.
          </p>
        ) : candQuery.isError ? (
          <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
            {(candQuery.error as Error).message}
          </p>
        ) : candQuery.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading candidates…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Candidate</th>
                <th className={th}>Party</th>
                <th className={th}>Election</th>
                <th className={th}>Running mate</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(candQuery.data?.candidates ?? []).map((c) => (
                <tr key={`${c.partyAbbreviation}-${c.candidateName}`}>
                  <td className={`${td} text-[var(--portal-fg)]`}>{c.candidateName}</td>
                  <td className={td}>{c.partyName}</td>
                  <td className={td}>{candQuery.data?.electionName ?? '—'}</td>
                  <td className={td}>{c.runningMateName ?? '—'}</td>
                  <td className={td}>
                    <span className="rounded bg-[#00C896]/15 px-2 py-0.5 text-[11px] capitalize text-[#00C896]">{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

type GeoStateRow = { id: number; code: string; name: string; centerLat: number; centerLng: number }
type GeoLgaRow = { id: number; stateId: number; code: string; name: string; centerLat: number; centerLng: number }
type GeoWardRow = { id: number; lgaId: number; code: string; name: string }
type GeoPuRow = { id: number; wardId: number; code: string; name: string; lat: number; lng: number }

export function AdminGeography() {
  const geoQuery = useQuery({
    queryKey: ['admin-geography-summary'],
    queryFn: () =>
      apiJson<{
        statesAndFct: number
        lgas: number
        wards: number
        pollingUnits: number
      }>('/api/admin/geography-summary'),
  })

  const statesQ = useQuery({
    queryKey: ['geography-states'],
    queryFn: () => apiJson<{ states: GeoStateRow[] }>('/api/geography/states'),
  })

  const [stateId, setStateId] = useState<number | ''>('')
  const [lgaId, setLgaId] = useState<number | ''>('')
  const [wardId, setWardId] = useState<number | ''>('')
  const [puId, setPuId] = useState<number | ''>('')

  useEffect(() => {
    setLgaId('')
    setWardId('')
    setPuId('')
  }, [stateId])

  useEffect(() => {
    setWardId('')
    setPuId('')
  }, [lgaId])

  useEffect(() => {
    setPuId('')
  }, [wardId])

  const lgasQ = useQuery({
    queryKey: ['geography-lgas', stateId],
    queryFn: () => apiJson<{ lgas: GeoLgaRow[] }>(`/api/geography/lgas?stateId=${stateId}`),
    enabled: stateId !== '',
  })

  const wardsQ = useQuery({
    queryKey: ['geography-wards', lgaId],
    queryFn: () => apiJson<{ wards: GeoWardRow[] }>(`/api/geography/wards?lgaId=${lgaId}`),
    enabled: lgaId !== '',
  })

  const pusQ = useQuery({
    queryKey: ['geography-pus', wardId],
    queryFn: () => apiJson<{ pollingUnits: GeoPuRow[] }>(`/api/geography/polling-units?wardId=${wardId}`),
    enabled: wardId !== '',
  })

  const g = geoQuery.data
  const selectedPu = (pusQ.data?.pollingUnits ?? []).find((p) => p.id === puId)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">LGAs & polling units</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Zone → state → LGA → ward → PU · GPS per PU · officer assignment with audit trail
        </p>
      </header>
      {geoQuery.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {(geoQuery.error as Error).message}
        </p>
      ) : null}
      {statesQ.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {(statesQ.error as Error).message}{' '}
          <span className="text-[var(--portal-dim)]">Run DB migration (geo tables) if this persists.</span>
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat
          label="States + FCT"
          value={g ? String(g.statesAndFct) : geoQuery.isLoading ? '…' : '—'}
          hint=""
          tone="green"
        />
        <Stat label="LGAs" value={g ? g.lgas.toLocaleString('en-NG') : geoQuery.isLoading ? '…' : '—'} hint="" tone="blue" />
        <Stat label="Wards" value={g ? g.wards.toLocaleString('en-NG') : geoQuery.isLoading ? '…' : '—'} hint="" tone="amber" />
        <Stat
          label="Polling units"
          value={g ? g.pollingUnits.toLocaleString('en-NG') : geoQuery.isLoading ? '…' : '—'}
          hint="National register (summary)"
          tone="red"
        />
      </div>

      <div className={`${card} space-y-4`}>
        <div className="font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Hierarchy selector</div>
        <p className="text-xs text-[var(--portal-muted)]">
          Demo subset loaded from the database (Lagos, FCT, Kano). Choosing each level loads the next dropdown automatically.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">State</span>
            <select
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
              value={stateId === '' ? '' : String(stateId)}
              onChange={(e) => setStateId(e.target.value ? Number(e.target.value) : '')}
              disabled={statesQ.isLoading}
            >
              <option value="">Select state…</option>
              {(statesQ.data?.states ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Local government</span>
            <select
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-50"
              value={lgaId === '' ? '' : String(lgaId)}
              onChange={(e) => setLgaId(e.target.value ? Number(e.target.value) : '')}
              disabled={stateId === '' || lgasQ.isLoading}
            >
              <option value="">{stateId === '' ? 'Select state first…' : lgasQ.isLoading ? 'Loading…' : 'Select LGA…'}</option>
              {(lgasQ.data?.lgas ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Ward</span>
            <select
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-50"
              value={wardId === '' ? '' : String(wardId)}
              onChange={(e) => setWardId(e.target.value ? Number(e.target.value) : '')}
              disabled={lgaId === '' || wardsQ.isLoading}
            >
              <option value="">{lgaId === '' ? 'Select LGA first…' : wardsQ.isLoading ? 'Loading…' : 'Select ward…'}</option>
              {(wardsQ.data?.wards ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Polling unit</span>
            <select
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-50"
              value={puId === '' ? '' : String(puId)}
              onChange={(e) => setPuId(e.target.value ? Number(e.target.value) : '')}
              disabled={wardId === '' || pusQ.isLoading}
            >
              <option value="">{wardId === '' ? 'Select ward first…' : pusQ.isLoading ? 'Loading…' : 'Select PU…'}</option>
              {(pusQ.data?.pollingUnits ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedPu ? (
          <div className="rounded-lg border border-[#0dccb0]/25 bg-[#0dccb0]/10 px-3 py-2 font-(--font-mono) text-[11px] text-[var(--portal-muted)]">
            GPS · lat {selectedPu.lat.toFixed(5)}, lng {selectedPu.lng.toFixed(5)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function AdminOperationsMap() {
  const fieldMap = useQuery({
    queryKey: ['admin-field-ops-map'],
    queryFn: () =>
      apiJson<{
        active: Array<{
          userId: string
          username: string
          displayName: string
          serviceNumber: string | null
          lat: number
          lng: number
          stateHint: string
        }>
        inactive: Array<{
          userId: string
          username: string
          displayName: string
          serviceNumber: string | null
          lat: number
          lng: number
          stateHint: string
          reason: string
        }>
      }>('/api/admin/field-operations-map'),
  })

  const statesLayer = useQuery({
    queryKey: ['geo-layer-states'],
    queryFn: () => apiJson<GeoFeatureCollection>('/api/geo/layers/states'),
  })

  const lgasLayer = useQuery({
    queryKey: ['geo-layer-lgas'],
    queryFn: () => apiJson<GeoFeatureCollection>('/api/geo/layers/lgas'),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Operations map</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Event pins · state &amp; LGA boundaries · street-oriented base map · active field officers vs inactive list
        </p>
      </header>
      {fieldMap.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {(fieldMap.error as Error).message}
        </p>
      ) : null}
      {statesLayer.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {(statesLayer.error as Error).message}
        </p>
      ) : null}
      {fieldMap.isLoading || statesLayer.isLoading ? (
        <p className="text-sm text-[var(--portal-muted)]">Loading map data…</p>
      ) : (
        <OperationsMap
          statesGeo={statesLayer.data ?? null}
          lgasGeo={lgasLayer.data ?? null}
          activeFieldOps={fieldMap.data?.active ?? []}
          inactiveFieldOps={fieldMap.data?.inactive ?? []}
        />
      )}
    </div>
  )
}

export function AdminUsers() {
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      apiJson<{ users: { officer: string; role: string; jurisdiction: string; twoFa: string }[] }>('/api/admin/users'),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">User management</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Bulk CSV · SMS credential dispatch · 2FA · session revoke · jurisdiction in JWT
        </p>
      </header>
      <div className={card}>
        {usersQuery.isError ? (
          <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
            {(usersQuery.error as Error).message}
          </p>
        ) : usersQuery.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading users…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Officer</th>
                <th className={th}>Role</th>
                <th className={th}>Jurisdiction</th>
                <th className={th}>2FA</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data?.users ?? []).map((u) => (
                <tr key={u.officer}>
                  <td className={`${td} font-medium text-[var(--portal-fg)]`}>{u.officer}</td>
                  <td className={td}>{u.role}</td>
                  <td className={td}>{u.jurisdiction}</td>
                  <td className={td}>
                    <span className="text-[var(--portal-muted)]">{u.twoFa}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function AdminRoles() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Roles & access matrix</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Section 3.2 — capabilities enforced at API (JWT jurisdiction claims)</p>
      </header>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-[720px] w-full text-xs">
          <thead>
            <tr>
              <th className={th}>Role</th>
              <th className={th}>Submit data</th>
              <th className={th}>View live</th>
              <th className={th}>Lock / declare</th>
              <th className={th}>Manage users</th>
              <th className={th}>Audit log</th>
              <th className={th}>Issue orders</th>
            </tr>
          </thead>
          <tbody className="text-[var(--portal-muted)]">
            <tr>
              <td className={`${td} text-[var(--portal-fg)]`}>System Admin</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>Full system</td>
              <td className={td}>Full system</td>
              <td className={td}>✗</td>
            </tr>
            <tr>
              <td className={`${td} text-[var(--portal-fg)]`}>NPF Data Officer</td>
              <td className={td}>Configure</td>
              <td className={td}>Configure</td>
              <td className={td}>✗</td>
              <td className={td}>Limited</td>
              <td className={td}>Read only</td>
              <td className={td}>✗</td>
            </tr>
            <tr>
              <td className={`${td} text-[var(--portal-fg)]`}>Field Officer (PU)</td>
              <td className={td}>PU only</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
            </tr>
            <tr>
              <td className={`${td} text-[var(--portal-fg)]`}>CP</td>
              <td className={td}>✗</td>
              <td className={td}>State</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>Read only</td>
              <td className={td}>State</td>
            </tr>
            <tr>
              <td className={`${td} text-[var(--portal-fg)]`}>IGP</td>
              <td className={td}>✗</td>
              <td className={td}>Declared</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>✗</td>
              <td className={td}>National</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function AdminAudit() {
  const auditQuery = useQuery({
    queryKey: ['admin-audit-log'],
    queryFn: () =>
      apiJson<{
        entries: {
          createdAt: string
          action: string
          entityType: string
          entityId: string | null
          actor: string
        }[]
      }>('/api/admin/audit-log?limit=50'),
  })

  function formatWat(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', hour12: false })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Audit logs</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Append-only chain · SHA-256 references · WAT timestamps · export for tribunal
        </p>
      </header>
      <div className={card}>
        {auditQuery.isError ? (
          <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
            {(auditQuery.error as Error).message}
          </p>
        ) : auditQuery.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading audit log…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>WAT</th>
                <th className={th}>Actor</th>
                <th className={th}>Action</th>
                <th className={th}>Entity</th>
              </tr>
            </thead>
            <tbody>
              {(auditQuery.data?.entries ?? []).map((e) => (
                <tr key={`${e.createdAt}-${e.action}-${e.entityId ?? ''}`}>
                  <td className={`${td} font-(--font-mono) text-[12px]`}>{formatWat(e.createdAt)}</td>
                  <td className={td}>{e.actor}</td>
                  <td className={td}>
                    <span className="rounded bg-[#3B82F6]/15 px-2 py-0.5 font-(--font-mono) text-[11px] text-[#3B82F6]">{e.action}</span>
                  </td>
                  <td className={td}>
                    {e.entityType}
                    {e.entityId ? `: ${e.entityId}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

type AppSettings = {
  detection?: { anomalySigma?: number; ocrMismatchPct?: number }
  notifications?: { smsGateway?: string; broadcastLangs?: string[] }
}

export function AdminSettings() {
  const qc = useQueryClient()
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState(false)

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiJson<{ settings: AppSettings }>('/api/admin/settings'),
  })

  const [sigma, setSigma] = useState(3)
  const [ocrPct, setOcrPct] = useState(5)
  const [smsGateway, setSmsGateway] = useState('africas_talking')

  useEffect(() => {
    const s = settingsQuery.data?.settings
    if (!s) return
    if (s.detection?.anomalySigma != null) setSigma(Number(s.detection.anomalySigma))
    if (s.detection?.ocrMismatchPct != null) setOcrPct(Number(s.detection.ocrMismatchPct))
    if (s.notifications?.smsGateway) setSmsGateway(String(s.notifications.smsGateway))
  }, [settingsQuery.data])

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          settings: {
            detection: { anomalySigma: sigma, ocrMismatchPct: ocrPct },
            notifications: { smsGateway },
          },
        }),
      })
      await parseJsonResponse(res)
    },
    onSuccess: () => {
      setSaveErr(null)
      setSaveOk(true)
      window.setTimeout(() => setSaveOk(false), 2500)
      void qc.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: (e: Error) => setSaveErr(e.message),
  })

  const langLabel = (settingsQuery.data?.settings?.notifications?.broadcastLangs ?? ['en', 'ha', 'yo', 'ig'])
    .map((c) =>
      ({ en: 'English', ha: 'Hausa', yo: 'Yoruba', ig: 'Igbo' } as Record<string, string>)[c] ?? c,
    )
    .join(' · ')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">System settings</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Anomaly thresholds · SMS gateway · broadcast languages</p>
      </header>

      {settingsQuery.isError ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {(settingsQuery.error as Error).message}
        </p>
      ) : null}

      {saveErr ? (
        <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
          {saveErr}
        </p>
      ) : null}
      {saveOk ? (
        <p className="rounded-lg border border-[#0dccb0]/30 bg-[#0dccb0]/10 px-3 py-2 text-sm text-[#0dccb0]" role="status">
          Settings saved.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Detection</div>
          <label className="mb-3 block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Anomaly σ threshold</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={sigma}
              onChange={(e) => setSigma(Number(e.target.value))}
              disabled={settingsQuery.isLoading}
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-60"
            />
          </label>
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">OCR mismatch alert (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              value={ocrPct}
              onChange={(e) => setOcrPct(Number(e.target.value))}
              disabled={settingsQuery.isLoading}
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-60"
            />
          </label>
        </div>
        <div className={card}>
          <div className="mb-3 font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Notifications</div>
          <label className="mb-3 block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">SMS gateway</span>
            <select
              value={smsGateway}
              onChange={(e) => setSmsGateway(e.target.value)}
              disabled={settingsQuery.isLoading}
              className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-60"
            >
              <option value="africas_talking">Africa&apos;s Talking</option>
              <option value="twilio">Twilio</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="block text-[13px]">
            <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Broadcast languages</span>
            <p className="mt-1 text-xs text-[var(--portal-dim)]">{langLabel}</p>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={settingsQuery.isLoading || saveSettings.isPending}
          className="rounded-lg bg-[#00C896] px-5 py-2 text-sm font-semibold text-[#0A1628] disabled:opacity-50"
          onClick={() => {
            setSaveErr(null)
            saveSettings.mutate()
          }}
        >
          {saveSettings.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
