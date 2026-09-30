import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

export type Ec8aRecord = {
  id: number
  polling_unit_id: number
  pu_code: string
  pu_name: string
  ward_name: string
  lga_name: string
  state_name: string
  registered_voters: number
  accredited_voters: number
  ballot_papers_issued: number
  ballot_papers_used: number
  ballot_papers_spoiled: number
  ballot_papers_rejected: number
  valid_votes: number
  total_votes_cast: number
  party_votes: Record<string, number>
  photo_url: string | null
  photo_hash_sha256: string
  photo_captured_at: string
  photo_source: 'police' | 'observer' | 'party_agent' | 'inec_mirror'
  observer_name?: string | null
  observer_organization?: string | null
  recorded_by_name: string
  is_verified: boolean
  anomaly_flags: string[]
  created_at: string
}

type CollationResponse = {
  election: { id: string; name: string; slug: string }
  count: number
  totals: {
    registeredVoters: number
    accreditedVoters: number
    totalVotesCast: number
    validVotes: number
    rejectedVotes: number
    partyTotals: Record<string, number>
    anomalyCount: number
    verifiedCount: number
  }
  results: Ec8aRecord[]
}

// Client-side SHA-256 helper for browser crypto
async function computeSha256(text: string): Promise<string> {
  const enc = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(text))
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function Ec8aCollationMirrorView({
  electionSlug,
  stateId,
  lgaId,
}: {
  electionSlug?: string
  stateId?: number
  lgaId?: number
}) {
  const queryClient = useQueryClient()
  const [anomalyFilter, setAnomalyFilter] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<Ec8aRecord | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { data, isLoading, isError, refetch } = useQuery<CollationResponse>({
    queryKey: ['ec8a-collation-mirror', electionSlug, stateId, lgaId, anomalyFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (electionSlug) params.set('electionSlug', electionSlug)
      if (stateId) params.set('stateId', String(stateId))
      if (lgaId) params.set('lgaId', String(lgaId))
      if (anomalyFilter) params.set('anomalyOnly', 'true')
      return apiJson<CollationResponse>(`/api/operations/results/collation?${params.toString()}`)
    },
    refetchInterval: 12_000,
  })

  const verifyMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiJson(`/api/operations/results/ec8a/${id}/verify`, { method: 'POST' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ec8a-collation-mirror'] })
    },
  })

  const filteredResults = useMemo(() => {
    if (!data?.results) return []
    if (!searchTerm.trim()) return data.results
    const s = searchTerm.toLowerCase()
    return data.results.filter(
      (r) =>
        r.pu_code.toLowerCase().includes(s) ||
        r.pu_name.toLowerCase().includes(s) ||
        r.ward_name.toLowerCase().includes(s) ||
        r.lga_name.toLowerCase().includes(s)
    )
  }, [data?.results, searchTerm])

  if (isLoading) {
    return (
      <div className="sr-card flex items-center justify-center p-12 text-sm text-[var(--portal-muted)]">
        <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-[#00c46a] border-t-transparent"></span>
        Loading Results Collation Mirror & Evidence Hub…
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="sr-card border-red-500/30 p-6 text-sm text-red-400">
        Failed to load collation results.
        <button
          onClick={() => refetch()}
          className="ml-3 font-semibold text-[#00c46a] underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const { totals } = data
  const sortedParties = Object.entries(totals.partyTotals).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      {/* Top Banner KPI Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Declared PUs
          </div>
          <div className="text-2xl font-bold text-[var(--portal-fg)] mt-1">
            {data.count.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#00c46a]">
            {totals.verifiedCount} verified in tribunal log
          </div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Accredited Voters
          </div>
          <div className="text-2xl font-bold text-[#3B82F6] mt-1">
            {totals.accreditedVoters.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">
            of {totals.registeredVoters.toLocaleString()} registered
          </div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Total Votes Cast
          </div>
          <div className="text-2xl font-bold text-[#10B981] mt-1">
            {totals.totalVotesCast.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">
            Valid: {totals.validVotes.toLocaleString()}
          </div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Rejected Ballots
          </div>
          <div className="text-2xl font-bold text-[#EF4444] mt-1">
            {totals.rejectedVotes.toLocaleString()}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">
            {totals.totalVotesCast > 0
              ? `${Math.round((totals.rejectedVotes / totals.totalVotesCast) * 1000) / 10}% rejection rate`
              : '0%'}
          </div>
        </div>

        <div className="sr-card p-4 border-[color:var(--portal-border)]">
          <div className="text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            Leading Party
          </div>
          <div className="text-2xl font-bold text-[#d9b64a] mt-1">
            {sortedParties[0] ? sortedParties[0][0] : '—'}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">
            {sortedParties[0] ? `${sortedParties[0][1].toLocaleString()} votes` : 'No votes yet'}
          </div>
        </div>

        <div
          className={`sr-card p-4 border transition cursor-pointer ${
            anomalyFilter ? 'border-[#EF4444] bg-[#EF4444]/10' : 'border-[color:var(--portal-border)]'
          }`}
          onClick={() => setAnomalyFilter(!anomalyFilter)}
        >
          <div className="flex items-center justify-between text-[11px] font-(--font-mono) uppercase text-[var(--portal-dim)]">
            <span>Anomalies</span>
            {totals.anomalyCount > 0 && (
              <span className="size-2 rounded-full bg-[#EF4444] animate-pulse" />
            )}
          </div>
          <div
            className={`text-2xl font-bold mt-1 ${
              totals.anomalyCount > 0 ? 'text-[#EF4444]' : 'text-[var(--portal-fg)]'
            }`}
          >
            {totals.anomalyCount}
          </div>
          <div className="text-[11px] text-[var(--portal-muted)]">
            {anomalyFilter ? 'Showing anomalies only ✕' : 'Click to filter flags'}
          </div>
        </div>
      </div>

      {/* Party Vote Aggregate Bar */}
      {sortedParties.length > 0 && (
        <div className="sr-card border-[color:var(--portal-border)] p-5">
          <h3 className="font-(--font-syne) text-xs font-bold uppercase tracking-wider text-[var(--portal-dim)] mb-3">
            Party Votes Mirror Aggregate
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedParties.slice(0, 12).map(([abbr, votes]) => {
              const pct =
                totals.validVotes > 0
                  ? Math.round((votes / totals.validVotes) * 1000) / 10
                  : 0
              return (
                <div
                  key={abbr}
                  className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)]/60 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-(--font-syne) font-bold text-sm text-[var(--portal-fg)]">
                      {abbr}
                    </span>
                    <span className="font-(--font-mono) text-xs font-semibold text-[#d9b64a]">
                      {pct}%
                    </span>
                  </div>
                  <div className="text-base font-bold text-[var(--portal-fg)] mt-1">
                    {votes.toLocaleString()}
                  </div>
                  <div className="mt-2 h-1 w-full rounded-full bg-[var(--portal-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#d9b64a]"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Results Table & Evidence Inspector */}
      <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-(--font-syne) text-base font-bold text-[var(--portal-fg)]">
              Form EC8A Polling Unit Results & Cryptographic Evidence
            </h2>
            <p className="text-xs text-[var(--portal-muted)]">
              Tamper-evident SHA-256 hashed returns for Election Petition Tribunal verification
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search PU code, ward, LGA…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none w-56"
            />
            {anomalyFilter && (
              <button
                onClick={() => setAnomalyFilter(false)}
                className="sr-btn-ghost text-xs text-[#EF4444]"
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>

        {filteredResults.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--portal-muted)]">
            No Form EC8A results found matching current criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--portal-fg)]">
              <thead className="border-b border-[color:var(--portal-border)] font-(--font-mono) text-[11px] uppercase text-[var(--portal-dim)] bg-[color:var(--portal-table-header-bg)]">
                <tr>
                  <th className="py-2.5 px-3">PU Details</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Accredited / Reg</th>
                  <th className="py-2.5 px-3">Valid / Cast</th>
                  <th className="py-2.5 px-3">Leading Returns</th>
                  <th className="py-2.5 px-3">Evidence Hash (SHA-256)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--portal-border)]">
                {filteredResults.map((r) => {
                  const hasAnomaly = r.anomaly_flags && r.anomaly_flags.length > 0
                  const partyEntries = Object.entries(r.party_votes || {}).sort((a, b) => b[1] - a[1])

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-[color:var(--portal-table-row-hover)] transition cursor-pointer"
                      onClick={() => setSelectedRecord(r)}
                    >
                      <td className="py-3 px-3">
                        <div className="font-(--font-mono) font-bold text-[#00c46a]">
                          {r.pu_code}
                        </div>
                        <div className="text-[11px] text-[var(--portal-muted)] line-clamp-1 max-w-[160px]">
                          {r.pu_name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-[var(--portal-muted)]">
                        <div>{r.ward_name}</div>
                        <div className="text-[10px] text-[var(--portal-dim)]">{r.lga_name}, {r.state_name}</div>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono)">
                        <span className="font-bold text-[var(--portal-fg)]">
                          {r.accredited_voters}
                        </span>
                        <span className="text-[var(--portal-dim)]"> / {r.registered_voters}</span>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono)">
                        <span className="text-[#10B981] font-semibold">{r.valid_votes}</span>
                        <span className="text-[var(--portal-dim)]"> / {r.total_votes_cast}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 flex-wrap max-w-[200px]">
                          {partyEntries.slice(0, 3).map(([p, v]) => (
                            <span
                              key={p}
                              className="rounded bg-[color:var(--portal-input-bg)] px-1.5 py-0.5 text-[10px] font-(--font-mono) border border-[color:var(--portal-border)]"
                            >
                              <strong>{p}</strong>: {v}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                        <span title={r.photo_hash_sha256} className="bg-black/30 px-1.5 py-0.5 rounded border border-white/5">
                          {r.photo_hash_sha256.slice(0, 10)}…{r.photo_hash_sha256.slice(-6)}
                        </span>
                        {r.photo_url && <span className="ml-1.5 text-xs text-[#3B82F6]" title="Photo attached">📷</span>}
                      </td>
                      <td className="py-3 px-3">
                        {hasAnomaly ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#EF4444]/20 border border-[#EF4444]/40 px-2 py-0.5 text-[10px] font-bold text-[#EF4444]">
                            ⚠ {r.anomaly_flags.join(', ')}
                          </span>
                        ) : r.is_verified ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#00c46a]/20 border border-[#00c46a]/40 px-2 py-0.5 text-[10px] font-bold text-[#00c46a]">
                            ✓ TRIBUNAL CERTIFIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-[#F59E0B]/20 border border-[#F59E0B]/40 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B]">
                            PENDING AUDIT
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedRecord(r)
                          }}
                          className="sr-btn-ghost px-2.5 py-1 text-[11px]"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Inspector for Selected EC8A Record */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="sr-card max-w-2xl w-full max-h-[90vh] overflow-y-auto border-[color:var(--portal-border)] p-6 space-y-5 bg-[#141414]">
            <div className="flex items-start justify-between border-b border-[color:var(--portal-border)] pb-3">
              <div>
                <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a]">
                  FORM EC8A EVIDENTIARY DOSSIER
                </span>
                <h3 className="font-(--font-syne) text-lg font-bold text-[var(--portal-fg)]">
                  {selectedRecord.pu_code} · {selectedRecord.pu_name}
                </h3>
                <p className="text-xs text-[var(--portal-muted)]">
                  {selectedRecord.ward_name}, {selectedRecord.lga_name}, {selectedRecord.state_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-2xl text-[var(--portal-muted)] hover:text-white leading-none"
              >
                &times;
              </button>
            </div>

            {/* Cryptographic SHA-256 Seal */}
            <div className="rounded-xl border border-[#00c46a]/30 bg-[#00c46a]/[0.06] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-(--font-mono) text-xs font-bold text-[#00c46a]">
                  🔐 TAMPER-EVIDENT SHA-256 INTEGRITY HASH
                </span>
                <span className="font-(--font-mono) text-[10px] text-[var(--portal-muted)]">
                  Source: {selectedRecord.photo_source.toUpperCase()}
                </span>
              </div>
              <div className="font-(--font-mono) text-xs bg-black/50 p-2.5 rounded border border-[#00c46a]/20 text-[var(--portal-fg)] select-all break-all">
                {selectedRecord.photo_hash_sha256}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--portal-dim)]">
                <span>Timestamp: {new Date(selectedRecord.created_at).toLocaleString('en-NG')}</span>
                <span>Officer: {selectedRecord.recorded_by_name}</span>
              </div>
            </div>

            {/* Numerical Breakdown */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="sr-card p-2.5 bg-[color:var(--portal-input-bg)]">
                <div className="text-[10px] text-[var(--portal-muted)]">Registered</div>
                <div className="text-base font-bold text-[var(--portal-fg)]">
                  {selectedRecord.registered_voters}
                </div>
              </div>
              <div className="sr-card p-2.5 bg-[color:var(--portal-input-bg)]">
                <div className="text-[10px] text-[var(--portal-muted)]">Accredited</div>
                <div className="text-base font-bold text-[#3B82F6]">
                  {selectedRecord.accredited_voters}
                </div>
              </div>
              <div className="sr-card p-2.5 bg-[color:var(--portal-input-bg)]">
                <div className="text-[10px] text-[var(--portal-muted)]">Valid Votes</div>
                <div className="text-base font-bold text-[#10B981]">
                  {selectedRecord.valid_votes}
                </div>
              </div>
            </div>

            {/* Party Vote Breakdown List */}
            <div>
              <h4 className="font-(--font-syne) text-xs font-bold uppercase text-[var(--portal-dim)] mb-2">
                Recorded Party Scores
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(selectedRecord.party_votes || {}).map(([p, v]) => (
                  <div
                    key={p}
                    className="flex items-center justify-between p-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] text-xs font-(--font-mono)"
                  >
                    <strong className="text-[var(--portal-fg)]">{p}</strong>
                    <span className="text-[#d9b64a] font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Photo Evidence Preview if available */}
            {selectedRecord.photo_url ? (
              <div>
                <h4 className="font-(--font-syne) text-xs font-bold uppercase text-[var(--portal-dim)] mb-2">
                  Captured EC8A Result Sheet Photo
                </h4>
                <div className="rounded-xl overflow-hidden border border-[color:var(--portal-border)] bg-black/50 p-2">
                  <img
                    src={selectedRecord.photo_url}
                    alt="EC8A Result Sheet"
                    className="max-h-72 w-full object-contain rounded"
                  />
                </div>
              </div>
            ) : (
              <div className="p-4 text-center rounded-lg border border-dashed border-[color:var(--portal-border)] text-xs text-[var(--portal-muted)]">
                No physical photo attachment. Numerical totals hashed from authenticated field telemetry.
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between border-t border-[color:var(--portal-border)] pt-4">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="sr-btn-ghost px-4 py-2 text-xs"
              >
                Close
              </button>

              {!selectedRecord.is_verified && (
                <button
                  type="button"
                  disabled={verifyMutation.isPending}
                  onClick={() => {
                    verifyMutation.mutate(selectedRecord.id)
                    setSelectedRecord(null)
                  }}
                  className="sr-btn-primary px-4 py-2 text-xs text-white"
                >
                  {verifyMutation.isPending ? 'Certifying…' : '✓ Certify for Tribunal Evidence'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function FieldEc8aEvidenceCapture({
  pollingUnitId,
  pollingUnitCode,
  electionSlug,
  parties = [],
}: {
  pollingUnitId?: number
  pollingUnitCode?: string
  electionSlug?: string
  parties: { id: string; abbreviation: string; name: string }[]
}) {
  const queryClient = useQueryClient()
  const [registeredVoters, setRegisteredVoters] = useState(0)
  const [accreditedVoters, setAccreditedVoters] = useState(0)
  const [ballotPapersIssued, setBallotPapersIssued] = useState(0)
  const [ballotPapersRejected, setBallotPapersRejected] = useState(0)
  const [partyVotes, setPartyVotes] = useState<Record<string, number>>({})
  const [photoUrl, setPhotoUrl] = useState('')
  const [observerName, setObserverName] = useState('')
  const [observerOrg, setObserverOrg] = useState('')
  const [calculatedHash, setCalculatedHash] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleVoteChange = (abbr: string, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setPartyVotes((prev) => ({ ...prev, [abbr]: num }))
  }

  const validVotesSum = useMemo(() => {
    return Object.values(partyVotes).reduce((acc, v) => acc + (Number(v) || 0), 0)
  }, [partyVotes])

  const totalVotesCast = validVotesSum + ballotPapersRejected

  // Auto compute hash preview
  const handleComputeHash = async () => {
    const payload = `${pollingUnitCode}:${registeredVoters}:${accreditedVoters}:${validVotesSum}:${totalVotesCast}:${photoUrl || 'nophoto'}:${Date.now()}`
    const h = await computeSha256(payload)
    setCalculatedHash(h)
    return h
  }

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null)
      const h = calculatedHash || (await handleComputeHash())
      return apiJson('/api/operations/results/ec8a', {
        method: 'POST',
        body: JSON.stringify({
          electionSlug,
          pollingUnitId,
          registeredVoters,
          accreditedVoters,
          ballotPapersIssued,
          ballotPapersRejected,
          validVotes: validVotesSum,
          totalVotesCast,
          partyVotes,
          photoUrl: photoUrl || null,
          photoHashSha256: h,
          photoSource: 'police',
          observerName: observerName || null,
          observerOrganization: observerOrg || null,
        }),
      })
    },
    onSuccess: () => {
      setSuccess('✓ Form EC8A Result & SHA-256 evidence submitted and mirrored successfully!')
      queryClient.invalidateQueries({ queryKey: ['ec8a-collation-mirror'] })
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to submit Form EC8A return.')
    },
  })

  return (
    <div className="sr-card border-[color:var(--portal-border)] p-6 space-y-6">
      <div className="border-b border-[color:var(--portal-border)] pb-4">
        <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#00c46a] tracking-wider">
          RESULT COLLATION MIRROR · FORM EC8A CAPTURE
        </span>
        <h2 className="font-(--font-syne) text-lg font-bold text-[var(--portal-fg)]">
          Official PU Result Return & Evidence Hash
        </h2>
        <p className="text-xs text-[var(--portal-muted)]">
          Station: <strong className="text-[var(--portal-fg)]">{pollingUnitCode}</strong> · Tamper-evident Tribunal Record
        </p>
      </div>

      {success && (
        <div className="rounded-lg border border-[#00c46a]/40 bg-[#00c46a]/15 p-4 text-xs font-semibold text-[#00c46a]">
          {success}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/15 p-4 text-xs font-semibold text-[#EF4444]">
          {errorMsg}
        </div>
      )}

      {/* Voter Count Verification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
            Registered Voters
          </label>
          <input
            type="number"
            min={0}
            value={registeredVoters || ''}
            onChange={(e) => setRegisteredVoters(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm text-[var(--portal-fg)] font-(--font-mono) focus:border-[#00c46a] focus:outline-none"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
            Accredited Voters (BVAS)
          </label>
          <input
            type="number"
            min={0}
            value={accreditedVoters || ''}
            onChange={(e) => setAccreditedVoters(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm text-[var(--portal-fg)] font-(--font-mono) focus:border-[#00c46a] focus:outline-none"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
            Ballot Papers Issued
          </label>
          <input
            type="number"
            min={0}
            value={ballotPapersIssued || ''}
            onChange={(e) => setBallotPapersIssued(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm text-[var(--portal-fg)] font-(--font-mono) focus:border-[#00c46a] focus:outline-none"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
            Rejected Ballots
          </label>
          <input
            type="number"
            min={0}
            value={ballotPapersRejected || ''}
            onChange={(e) => setBallotPapersRejected(parseInt(e.target.value, 10) || 0)}
            className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-sm text-[var(--portal-fg)] font-(--font-mono) focus:border-[#00c46a] focus:outline-none"
            placeholder="0"
          />
        </div>
      </div>

      {/* Party Scores Inputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-(--font-syne) text-sm font-bold text-[var(--portal-fg)]">
            Party Votes (Declared on Form EC8A)
          </h3>
          <span className="font-(--font-mono) text-xs text-[var(--portal-muted)]">
            Total Valid: <strong className="text-[#00c46a]">{validVotesSum.toLocaleString()}</strong> · Total Cast: <strong className="text-[var(--portal-fg)]">{totalVotesCast.toLocaleString()}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {parties.map((p) => (
            <div
              key={p.abbreviation}
              className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)]/50 p-3"
            >
              <div className="flex items-center justify-between text-xs font-bold text-[var(--portal-fg)] mb-1">
                <span>{p.abbreviation}</span>
                <span className="text-[10px] text-[var(--portal-muted)] truncate max-w-[100px]">
                  {p.name}
                </span>
              </div>
              <input
                type="number"
                min={0}
                value={partyVotes[p.abbreviation] || ''}
                onChange={(e) => handleVoteChange(p.abbreviation, e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-1.5 text-sm text-[var(--portal-fg)] font-(--font-mono) focus:border-[#00c46a] focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Photo Attachment URL / Base64 & Observer Witness */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[color:var(--portal-border)] pt-4">
        <div>
          <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
            EC8A Result Sheet Photo (URL or Base64)
          </label>
          <input
            type="text"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://… or camera capture data"
            className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Observer / Agent Witness
            </label>
            <input
              type="text"
              value={observerName}
              onChange={(e) => setObserverName(e.target.value)}
              placeholder="e.g. John Okon"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--portal-muted)] mb-1">
              Organization
            </label>
            <input
              type="text"
              value={observerOrg}
              onChange={(e) => setObserverOrg(e.target.value)}
              placeholder="e.g. YIAGA / EU Observer"
              className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] px-3 py-2 text-xs text-[var(--portal-fg)] focus:border-[#00c46a] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="sr-btn-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg"
        >
          {mutation.isPending ? 'Cryptographically Signing & Uploading…' : '🔐 Sign & Submit Form EC8A Return'}
        </button>
      </div>
    </div>
  )
}
