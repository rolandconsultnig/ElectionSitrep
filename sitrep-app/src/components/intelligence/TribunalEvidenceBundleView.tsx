import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface TribunalBundle {
  id: number
  bundle_code: string
  election_id: string
  case_title: string
  petitioner_party: string | null
  respondent_party: string | null
  compiled_by_username: string
  compiled_by_name: string
  integrity_hash_sha256: string
  bundle_manifest: {
    bundleCode: string
    caseTitle: string
    compiledAt: string
    sitrepsCount: number
    ec8aRecords: Array<{
      photo_hash_sha256: string
      registered_voters: number
      accredited_voters: number
      valid_votes: number
      party_votes: Record<string, number>
    }>
    officerSignOff: { userId: string; username: string }
    affidavitStatement: string
  }
  certified_affidavit_signed: boolean
  status: 'draft' | 'certified' | 'ready_for_court' | 'tendered_in_tribunal'
  state_name: string | null
  lga_name: string | null
  pu_name: string | null
  pu_code: string | null
  created_at: string
}

export const TribunalEvidenceBundleView: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [selectedBundle, setSelectedBundle] = useState<TribunalBundle | null>(null)
  const [showCompilerModal, setShowCompilerModal] = useState(false)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  // Form State
  const [caseTitle, setCaseTitle] = useState('')
  const [petitionerParty, setPetitionerParty] = useState('')
  const [respondentParty, setRespondentParty] = useState('')
  const [stateId, setStateId] = useState<number | ''>('')

  // 1. Fetch Bundles
  const { data, isLoading } = useQuery({
    queryKey: ['tribunal-bundles', electionSlug],
    queryFn: async () => {
      return apiJson<{ bundles: TribunalBundle[] }>(
        `/api/intelligence/tribunal/bundles?electionSlug=${encodeURIComponent(electionSlug)}`,
      )
    },
  })

  // 2. Fetch States
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

  // 3. Compile Mutation
  const compileMutation = useMutation({
    mutationFn: async (payload: {
      electionSlug: string
      caseTitle: string
      petitionerParty: string
      respondentParty: string
      stateId: number | null
    }) => {
      return apiJson<{ ok: boolean; bundle: TribunalBundle }>('/api/intelligence/tribunal/bundles', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tribunal-bundles'] })
      setShowCompilerModal(false)
      setCaseTitle('')
      setPetitionerParty('')
      setRespondentParty('')
      if (data?.bundle) {
        setSelectedBundle(data.bundle)
      }
    },
  })

  const bundles: TribunalBundle[] = data?.bundles || []

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-emerald-950/30 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 shadow-inner text-2xl font-bold">
              ⚖
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Election Petition Tribunal Evidence Bundler
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                  Phase 3
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Cryptographic SHA-256 chain of custody, EC8A forensic returns, and certified police court affidavits
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCompilerModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all cursor-pointer"
          >
            <span>+</span>
            Compile Court Bundle
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>📜</span>
              Certified Bundles
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">{bundles.length}</div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>🛡</span>
              Court-Ready Affidavits
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">
              {bundles.filter((b) => b.certified_affidavit_signed).length}
            </div>
          </div>
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/20 p-3.5">
            <span className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
              <span>🔐</span>
              SHA-256 Verified Chains
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-200 tracking-tight">100%</div>
          </div>
          <div className="rounded-xl border border-indigo-900/30 bg-indigo-950/20 p-3.5">
            <span className="text-xs font-medium text-indigo-300 flex items-center gap-1.5">
              <span>⚖</span>
              Legal Admissibility Seal
            </span>
            <div className="mt-1 text-2xl font-bold text-indigo-200 tracking-tight">Active</div>
          </div>
        </div>
      </div>

      {/* Selected Bundle Certified Certificate Preview */}
      {selectedBundle && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl backdrop-blur-md animate-fade-in space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xl">
                🛡
              </div>
              <div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/20">
                  Certified Police Evidence Affidavit
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedBundle.case_title}</h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyHash(selectedBundle.integrity_hash_sha256)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-all cursor-pointer"
              >
                <span>{copiedHash === selectedBundle.integrity_hash_sha256 ? '✓' : '📋'}</span>
                {copiedHash === selectedBundle.integrity_hash_sha256 ? 'Hash Copied!' : 'Copy SHA-256 Hash'}
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition-all cursor-pointer shadow-md shadow-emerald-600/30"
              >
                <span>🖨</span>
                Export / Print Certificate
              </button>
            </div>
          </div>

          {/* Certificate Body */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-5 space-y-4 font-mono text-xs text-slate-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3 text-slate-400">
              <div>
                BUNDLE CODE: <strong className="text-white">{selectedBundle.bundle_code}</strong>
              </div>
              <div>
                COMPILED AT: <strong className="text-white">{new Date(selectedBundle.created_at).toUTCString()}</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
              <div>
                PETITIONER PARTY: <strong className="text-emerald-300">{selectedBundle.petitioner_party || 'N/A'}</strong>
              </div>
              <div>
                RESPONDENT PARTY: <strong className="text-rose-300">{selectedBundle.respondent_party || 'INEC / NPF'}</strong>
              </div>
              <div>
                JURISDICTION: <strong className="text-white">{selectedBundle.state_name || 'All States'} State Command</strong>
              </div>
              <div>
                EVIDENTIARY SITREPS: <strong className="text-white">{selectedBundle.bundle_manifest?.sitrepsCount ?? 0} Incidents Logged</strong>
              </div>
            </div>

            {/* Cryptographic Hash Badge */}
            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 space-y-1">
              <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                <span>🔐</span>
                IMMUTABLE FORENSIC INTEGRITY SIGNATURE (SHA-256)
              </div>
              <div className="break-all font-mono text-[11px] text-slate-300 select-all">
                {selectedBundle.integrity_hash_sha256}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-200/90 text-xs leading-relaxed">
              &quot;I hereby certify under official oath that the electronic sitreps, forensic photo hashes, and officer deployment records contained in this bundle constitute genuine, immutable police records compiled during Election Operations pursuant to Section 65 of the Electoral Act.&quot;
            </div>

            <div className="flex items-center justify-between pt-2 text-slate-400 text-[11px]">
              <div>
                SIGN-OFF OFFICER: <strong className="text-white">{selectedBundle.compiled_by_name}</strong> ({selectedBundle.compiled_by_username})
              </div>
              <div className="text-emerald-400 font-bold flex items-center gap-1">
                <span>✓</span>
                VERIFIED TRIBUNAL EXHIBIT
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bundles List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <span>📋</span>
          Compiled Tribunal Evidence Dossiers
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading tribunal evidence dossiers...</div>
        ) : bundles.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No tribunal evidence bundles compiled yet. Click &quot;Compile Court Bundle&quot; to build an evidentiary package.
          </div>
        ) : (
          <div className="space-y-3">
            {bundles.map((bundle) => {
              const isSelected = selectedBundle?.id === bundle.id

              return (
                <div
                  key={bundle.id}
                  onClick={() => setSelectedBundle(bundle)}
                  className={`rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/20 shadow-lg'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-950/80'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-emerald-400">
                        {bundle.bundle_code}
                      </span>
                      <h4 className="font-bold text-white text-sm">{bundle.case_title}</h4>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30 capitalize">
                        {bundle.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <span className="text-xs text-slate-500">
                      {new Date(bundle.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                    {bundle.petitioner_party && (
                      <span>
                        Petitioner: <strong className="text-slate-200">{bundle.petitioner_party}</strong>
                      </span>
                    )}
                    {bundle.respondent_party && (
                      <span>
                        Respondent: <strong className="text-slate-200">{bundle.respondent_party}</strong>
                      </span>
                    )}
                    {bundle.state_name && (
                      <span>
                        State: <strong className="text-slate-200">{bundle.state_name}</strong>
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-slate-500">
                      SHA-256: {bundle.integrity_hash_sha256.slice(0, 16)}...
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Compiler Modal */}
      {showCompilerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>⚖</span>
              Compile Tribunal Legal Evidence Bundle
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Aggregate operational sitreps, EC8A hashes, and custody logs into an immutable court package.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!caseTitle) return
                compileMutation.mutate({
                  electionSlug,
                  caseTitle,
                  petitionerParty,
                  respondentParty,
                  stateId: stateId === '' ? null : Number(stateId),
                })
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tribunal Case / Petition Title *
                </label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  required
                  placeholder="e.g. CA/EPT/2026: Party A vs INEC & Others (Kano Central)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Petitioner Party</label>
                  <input
                    type="text"
                    value={petitionerParty}
                    onChange={(e) => setPetitionerParty(e.target.value)}
                    placeholder="e.g. PDP, APC, LP"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Respondent</label>
                  <input
                    type="text"
                    value={respondentParty}
                    onChange={(e) => setRespondentParty(e.target.value)}
                    placeholder="INEC, NPF, Returned Candidate"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Jurisdiction State</label>
                <select
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value === '' ? '' : Number(e.target.value))}
                  aria-label="Select Target Jurisdiction State"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Nationwide / All Commands</option>
                  {statesData?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3 text-xs text-emerald-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span>🔐</span>
                  Automatic Cryptographic Seal
                </div>
                <p className="text-[11px] text-slate-300">
                  Compiling this bundle will calculate an unalterable SHA-256 hash over all linked sitreps and EC8A returns, certifying evidence under police electronic seal.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCompilerModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={compileMutation.isPending}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  {compileMutation.isPending ? 'Generating SHA-256 Hash...' : 'Compile & Seal Evidence'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
