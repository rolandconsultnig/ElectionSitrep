import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type RosterEntry = {
  pu_id: number
  pu_code: string
  pu_name: string
  ward_name: string
  lga_name: string
  state_name: string
  target_strength: number
  agency_breakdown: { npf?: number; nscdc?: number; [k: string]: number | undefined }
  active_officers_count: number
  coverageStatus: 'unstaffed' | 'understaffed' | 'manned' | 'surplus'
  coveragePercent: number
  sector_commander_name?: string | null
  sector_commander_phone?: string | null
}

type RosterResponse = {
  election: { id: string; name: string }
  summary: {
    totalPus: number
    unstaffed: number
    understaffed: number
    manned: number
  }
  roster: RosterEntry[]
}

export function DeploymentRosterManagerView({
  electionSlug,
  stateId,
  lgaId,
}: {
  electionSlug?: string
  stateId?: number
  lgaId?: number
}) {
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<RosterEntry | null>(null)
  const [targetStrengthInput, setTargetStrengthInput] = useState<number>(2)
  const [commanderName, setCommanderName] = useState('')
  const [commanderPhone, setCommanderPhone] = useState('')

  const { data, isLoading } = useQuery<RosterResponse>({
    queryKey: ['deployment-roster', electionSlug, stateId, lgaId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (electionSlug) params.set('electionSlug', electionSlug)
      if (stateId) params.set('stateId', String(stateId))
      if (lgaId) params.set('lgaId', String(lgaId))
      return apiJson<RosterResponse>(`/api/operations/roster?${params.toString()}`)
    },
    refetchInterval: 15_000,
  })

  const updateMutation = useMutation({
    mutationFn: async (vars: { puId: number; targetStrength: number; commanderName?: string; commanderPhone?: string }) => {
      return apiJson('/api/operations/roster', {
        method: 'POST',
        body: JSON.stringify({
          electionSlug,
          pollingUnitId: vars.puId,
          targetStrength: vars.targetStrength,
          sectorCommanderName: vars.commanderName,
          sectorCommanderPhone: vars.commanderPhone,
        }),
      })
    },
    onSuccess: () => {
      setSelectedEntry(null)
      queryClient.invalidateQueries({ queryKey: ['deployment-roster'] })
    },
  })

  const filteredRoster = useMemo(() => {
    if (!data?.roster) return []
    let list = data.roster
    if (filterStatus !== 'all') {
      list = list.filter((r) => r.coverageStatus === filterStatus)
    }
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase()
      list = list.filter(
        (r) =>
          r.pu_code.toLowerCase().includes(s) ||
          r.pu_name.toLowerCase().includes(s) ||
          r.ward_name.toLowerCase().includes(s) ||
          r.lga_name.toLowerCase().includes(s)
      )
    }
    return list
  }, [data?.roster, filterStatus, searchTerm])

  if (isLoading) {
    return (
      <div className="sr-card flex items-center justify-center p-12 text-sm text-[var(--portal-muted)]">
        <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-[#00c46a] border-t-transparent"></span>
        Loading Deployment Roster & Coverage Gap Matrix…
      </div>
    )
  }

  const summary = data?.summary || { totalPus: 0, unstaffed: 0, understaffed: 0, manned: 0 }

  return (
    <div className="space-y-6">
      {/* Header & Coverage Gap KPI Rollup */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-(--font-syne) text-xl font-bold text-[var(--portal-fg)]">
            Deployment Roster & Security Coverage Gap Matrix
          </h2>
          <p className="text-xs text-[var(--portal-muted)]">
            Live officer deployment strength against statutory polling unit security quotas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Total Monitored PUs
          </div>
          <div className="text-2xl font-bold text-[var(--portal-fg)] mt-1">
            {summary.totalPus.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Catalog stations</div>
        </div>

        <div
          className={`sr-card p-4 border transition cursor-pointer ${
            filterStatus === 'unstaffed' ? 'border-[#EF4444] bg-[#EF4444]/10' : 'border-[color:var(--portal-border)]'
          }`}
          onClick={() => setFilterStatus(filterStatus === 'unstaffed' ? 'all' : 'unstaffed')}
        >
          <div className="flex items-center justify-between text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            <span>Critical: 0 Officers</span>
            {summary.unstaffed > 0 && <span className="size-2 rounded-full bg-[#EF4444] animate-ping" />}
          </div>
          <div className={`text-2xl font-bold mt-1 ${summary.unstaffed > 0 ? 'text-[#EF4444]' : 'text-[var(--portal-fg)]'}`}>
            {summary.unstaffed.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Unstaffed Polling Units</div>
        </div>

        <div
          className={`sr-card p-4 border transition cursor-pointer ${
            filterStatus === 'understaffed' ? 'border-[#F59E0B] bg-[#F59E0B]/10' : 'border-[color:var(--portal-border)]'
          }`}
          onClick={() => setFilterStatus(filterStatus === 'understaffed' ? 'all' : 'understaffed')}
        >
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Under-Strength
          </div>
          <div className="text-2xl font-bold text-[#F59E0B] mt-1">
            {summary.understaffed.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">Below quota target</div>
        </div>

        <div
          className={`sr-card p-4 border transition cursor-pointer ${
            filterStatus === 'manned' ? 'border-[#00c46a] bg-[#00c46a]/10' : 'border-[color:var(--portal-border)]'
          }`}
          onClick={() => setFilterStatus(filterStatus === 'manned' ? 'all' : 'manned')}
        >
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Fully Manned / Target Met
          </div>
          <div className="text-2xl font-bold text-[#00c46a] mt-1">
            {summary.manned.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#00c46a]">Adequate coverage</div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-(--font-mono) text-xs text-[var(--portal-muted)]">Filter status:</span>
            {['all', 'unstaffed', 'understaffed', 'manned'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium capitalize transition ${
                  filterStatus === st
                    ? 'bg-[#00c46a] text-black font-semibold'
                    : 'bg-[color:var(--portal-input-bg)] text-[var(--portal-muted)] hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search PU code, ward, LGA…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none w-64"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--portal-fg)]">
            <thead className="border-b border-[color:var(--portal-border)] font-(--font-mono) text-[11px] uppercase text-[var(--portal-dim)] bg-[color:var(--portal-table-header-bg)]">
              <tr>
                <th className="py-2.5 px-3">PU Details</th>
                <th className="py-2.5 px-3">Ward & LGA</th>
                <th className="py-2.5 px-3">Target Quota</th>
                <th className="py-2.5 px-3">Reported Active</th>
                <th className="py-2.5 px-3">Coverage Ratio</th>
                <th className="py-2.5 px-3">Coverage Status</th>
                <th className="py-2.5 px-3">Sector Commander</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--portal-border)]">
              {filteredRoster.map((r) => {
                return (
                  <tr
                    key={r.pu_id}
                    className="hover:bg-[color:var(--portal-table-row-hover)] transition cursor-pointer"
                    onClick={() => {
                      setSelectedEntry(r)
                      setTargetStrengthInput(r.target_strength)
                      setCommanderName(r.sector_commander_name || '')
                      setCommanderPhone(r.sector_commander_phone || '')
                    }}
                  >
                    <td className="py-3 px-3">
                      <div className="font-(--font-mono) font-bold text-[#00c46a]">{r.pu_code}</div>
                      <div className="text-[11px] text-[var(--portal-muted)] line-clamp-1 max-w-[170px]">
                        {r.pu_name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[11px]">
                      <div className="text-[var(--portal-fg)]">{r.ward_name}</div>
                      <div className="text-[10px] text-[var(--portal-dim)]">{r.lga_name}, {r.state_name}</div>
                    </td>
                    <td className="py-3 px-3 font-(--font-mono) font-bold text-[var(--portal-fg)]">
                      {r.target_strength} officers
                    </td>
                    <td className="py-3 px-3 font-(--font-mono)">
                      <span className={`font-bold ${r.active_officers_count === 0 ? 'text-[#EF4444]' : 'text-[#00c46a]'}`}>
                        {r.active_officers_count}
                      </span>
                    </td>
                    <td className="py-3 px-3 w-36">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full rounded-full bg-[var(--portal-border)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, r.coveragePercent)}%`,
                              backgroundColor:
                                r.coveragePercent === 0
                                  ? '#EF4444'
                                  : r.coveragePercent < 100
                                  ? '#F59E0B'
                                  : '#00c46a',
                            }}
                          />
                        </div>
                        <span className="font-(--font-mono) text-[10px] font-bold w-8 text-right">
                          {r.coveragePercent}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {r.coverageStatus === 'unstaffed' && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#EF4444]/20 border border-[#EF4444]/40 px-2 py-0.5 text-[10px] font-bold text-[#EF4444]">
                          ⚠ UNSTAFFED (0)
                        </span>
                      )}
                      {r.coverageStatus === 'understaffed' && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#F59E0B]/20 border border-[#F59E0B]/40 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B]">
                          UNDERSTAFFED
                        </span>
                      )}
                      {r.coverageStatus === 'manned' && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#00c46a]/20 border border-[#00c46a]/40 px-2 py-0.5 text-[10px] font-bold text-[#00c46a]">
                          ✓ MANNED
                        </span>
                      )}
                      {r.coverageStatus === 'surplus' && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#3B82F6]/20 border border-[#3B82F6]/40 px-2 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                          SURPLUS
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[var(--portal-muted)]">
                      <div>{r.sector_commander_name || '—'}</div>
                      {r.sector_commander_phone && (
                        <div className="font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                          {r.sector_commander_phone}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedEntry(r)
                          setTargetStrengthInput(r.target_strength)
                          setCommanderName(r.sector_commander_name || '')
                          setCommanderPhone(r.sector_commander_phone || '')
                        }}
                        className="sr-btn-ghost px-2.5 py-1 text-[11px]"
                      >
                        Edit Target
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Edit Roster Target */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="sr-card max-w-md w-full border-[color:var(--portal-border)] p-6 space-y-4 bg-[#141414]">
            <div className="flex items-start justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a]">
                  ROSTER ASSIGNMENT
                </span>
                <h3 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
                  {selectedEntry.pu_code} · {selectedEntry.pu_name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Required Security Quota (Target Strength)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={targetStrengthInput}
                  onChange={(e) => setTargetStrengthInput(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm font-(--font-mono) text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Sector Commander Name
                </label>
                <input
                  type="text"
                  value={commanderName}
                  onChange={(e) => setCommanderName(e.target.value)}
                  placeholder="e.g. CSP Johnson"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
                  Sector Commander Phone
                </label>
                <input
                  type="text"
                  value={commanderPhone}
                  onChange={(e) => setCommanderPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[color:var(--portal-border)] pt-4">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="sr-btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    puId: selectedEntry.pu_id,
                    targetStrength: targetStrengthInput,
                    commanderName,
                    commanderPhone,
                  })
                }
                className="sr-btn-primary px-4 py-2 text-xs text-white"
              >
                {updateMutation.isPending ? 'Saving…' : 'Save Quota'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
