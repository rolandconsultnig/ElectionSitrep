import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'
import { PartyLogo } from '../PartyLogo'

interface PartySummaryItem {
  partyId: string
  partyName: string
  partyAbbr: string
  total: number
  accused: number
  complainant: number
  victim: number
  witness: number
}

interface AttributionRecord {
  id: number
  incident_sitrep_id: number | null
  election_id: string | null
  party_id: string
  party_name: string
  party_abbreviation: string
  role: 'accused' | 'complainant' | 'victim' | 'witness' | 'mediator'
  agent_name: string | null
  agent_phone: string | null
  agent_party_role: string | null
  allegation_details: string
  evidence_notes: string | null
  sitrep_title: string | null
  sitrep_category: string | null
  sitrep_severity: string | null
  state_name: string | null
  lga_name: string | null
  pu_name: string | null
  pu_code: string | null
  created_at: string
}

export const PartyAttributionView: React.FC<{ electionSlug?: string }> = ({
  electionSlug = 'presidential-2026',
}) => {
  const queryClient = useQueryClient()
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedParty, setSelectedParty] = useState<string>('all')
  const [showLogModal, setShowLogModal] = useState(false)

  // Form State
  const [partyId, setPartyId] = useState('')
  const [role, setRole] = useState<'accused' | 'complainant' | 'victim' | 'witness' | 'mediator'>('accused')
  const [agentName, setAgentName] = useState('')
  const [agentPhone, setAgentPhone] = useState('')
  const [agentPartyRole, setAgentPartyRole] = useState('Polling Agent')
  const [allegationDetails, setAllegationDetails] = useState('')
  const [evidenceNotes, setEvidenceNotes] = useState('')

  // 1. Fetch Political Parties
  const { data: partiesData } = useQuery({
    queryKey: ['political-parties', electionSlug],
    queryFn: async () => {
      try {
        const json = await apiJson<{ parties?: Array<{ id: string; abbreviation: string; name: string }> }>(
          `/api/field/elections/${encodeURIComponent(electionSlug)}/candidate-parties`,
        )
        return json.parties || []
      } catch {
        return []
      }
    },
  })

  // 2. Fetch Attribution Records
  const { data, isLoading } = useQuery({
    queryKey: ['party-attributions', electionSlug, selectedParty, selectedRole],
    queryFn: async () => {
      let url = `/api/intelligence/parties/attribution?electionSlug=${encodeURIComponent(electionSlug)}`
      if (selectedParty !== 'all') url += `&partyId=${encodeURIComponent(selectedParty)}`
      if (selectedRole !== 'all') url += `&role=${encodeURIComponent(selectedRole)}`
      return apiJson<{ attributions: AttributionRecord[]; partySummary: PartySummaryItem[] }>(url)
    },
  })

  // 3. Log Mutation
  const logMutation = useMutation({
    mutationFn: async (payload: {
      electionSlug: string
      partyId: string
      role: string
      agentName: string
      agentPhone: string
      agentPartyRole: string
      allegationDetails: string
      evidenceNotes: string
    }) => {
      return apiJson('/api/intelligence/parties/attribution', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['party-attributions'] })
      setShowLogModal(false)
      setAgentName('')
      setAgentPhone('')
      setAllegationDetails('')
      setEvidenceNotes('')
    },
  })

  const attributions: AttributionRecord[] = data?.attributions || []
  const partySummary: PartySummaryItem[] = data?.partySummary || []

  const totalIncidents = attributions.length
  const accusedCount = attributions.filter((a) => a.role === 'accused').length
  const complainantCount = attributions.filter((a) => a.role === 'complainant').length

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40 shadow-inner text-2xl font-bold">
              ⚖
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Partisan Incident Attribution Intelligence
                <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs font-semibold text-indigo-300 border border-indigo-500/30">
                  Phase 3
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Multi-party security tracking, polling agent interdictions, and partisan culpability matrix
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all cursor-pointer"
          >
            <span>+</span>
            Log Partisan Incident
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800/80 pt-5">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <span>◈</span>
              Total Logged Attributions
            </span>
            <div className="mt-1 text-2xl font-bold text-white tracking-tight">{totalIncidents}</div>
          </div>
          <div className="rounded-xl border border-rose-900/30 bg-rose-950/20 p-3.5">
            <span className="text-xs font-medium text-rose-300 flex items-center gap-1.5">
              <span>⚠</span>
              Party Accused In Allegations
            </span>
            <div className="mt-1 text-2xl font-bold text-rose-200 tracking-tight">{accusedCount}</div>
          </div>
          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/20 p-3.5">
            <span className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <span>👥</span>
              Complainant Reports
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-200 tracking-tight">{complainantCount}</div>
          </div>
          <div className="rounded-xl border border-amber-900/30 bg-amber-950/20 p-3.5">
            <span className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <span>⚑</span>
              Tracked Political Parties
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-200 tracking-tight">{partySummary.length}</div>
          </div>
        </div>
      </div>

      {/* Partisan Spectrum Matrix */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-4">
          <span>🏛</span>
          Partisan Distribution & Threat Correlation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partySummary.map((item) => {
            const total = item.total || 1
            const accusedPct = Math.round((item.accused / total) * 100)
            const complainantPct = Math.round((item.complainant / total) * 100)

            return (
              <div
                key={item.partyAbbr}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8">
                      <PartyLogo abbreviation={item.partyAbbr} partyName={item.partyName} />
                    </div>
                    <div>
                      <div className="font-bold text-white text-base">{item.partyAbbr}</div>
                      <div className="text-xs text-slate-400 line-clamp-1">{item.partyName}</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-white">
                    {item.total} events
                  </span>
                </div>

                <div className="space-y-2 mt-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-rose-400 font-medium">Accused / Offender ({item.accused})</span>
                      <span className="text-slate-400 font-bold">{accusedPct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full"
                        style={{ width: `${accusedPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-emerald-400 font-medium">Complainant / Target ({item.complainant})</span>
                      <span className="text-slate-400 font-bold">{complainantPct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${complainantPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {partySummary.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-slate-500">
              No partisan attributions recorded for this operational window.
            </div>
          )}
        </div>
      </div>

      {/* Filter Controls & Live Attribution Records */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <span>📋</span>
            Field Incident Attribution Dossier
          </h3>

          <div className="flex items-center gap-3">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              aria-label="Filter attributions by role"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Roles</option>
              <option value="accused">Role: Accused / Disruptor</option>
              <option value="complainant">Role: Complainant</option>
              <option value="victim">Role: Victim</option>
              <option value="witness">Role: Witness</option>
            </select>

            <select
              value={selectedParty}
              onChange={(e) => setSelectedParty(e.target.value)}
              aria-label="Filter attributions by political party"
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Political Parties</option>
              {partiesData?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.abbreviation} - {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List of Attributions */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading partisan dossier records...</div>
        ) : attributions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No incident attributions match the current filter selection.
          </div>
        ) : (
          <div className="space-y-3">
            {attributions.map((record) => {
              const isAccused = record.role === 'accused'
              const isComplainant = record.role === 'complainant'

              return (
                <div
                  key={record.id}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 transition-all hover:border-slate-700 hover:bg-slate-950/70"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6">
                        <PartyLogo abbreviation={record.party_abbreviation} partyName={record.party_name} />
                      </div>
                      <span className="font-bold text-white text-sm">
                        {record.party_abbreviation}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          isAccused
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : isComplainant
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        }`}
                      >
                        {record.role}
                      </span>
                      {record.agent_name && (
                        <span className="text-xs text-slate-400">
                          Agent: <strong className="text-slate-200">{record.agent_name}</strong> ({record.agent_party_role || 'Agent'})
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(record.created_at).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm text-slate-200 mt-1">{record.allegation_details}</p>

                  {record.evidence_notes && (
                    <div className="mt-2 rounded-lg bg-slate-900/90 border border-slate-800 p-2 text-xs text-slate-400">
                      <strong className="text-slate-300">Evidence Notes:</strong> {record.evidence_notes}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400 border-t border-slate-900 pt-2">
                    {record.pu_name && (
                      <span>
                        Polling Unit: <strong className="text-slate-300">{record.pu_name}</strong> ({record.pu_code})
                      </span>
                    )}
                    {record.lga_name && (
                      <span>
                        LGA: <strong className="text-slate-300">{record.lga_name}</strong>, {record.state_name}
                      </span>
                    )}
                    {record.agent_phone && (
                      <span>
                        Contact: <strong className="text-slate-300">{record.agent_phone}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Log Partisan Incident Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>⚖</span>
              Record Party Incident Attribution
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Attribute field events or formal complaints to registered political parties and agents.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!partyId || !allegationDetails) return
                logMutation.mutate({
                  electionSlug,
                  partyId,
                  role,
                  agentName,
                  agentPhone,
                  agentPartyRole,
                  allegationDetails,
                  evidenceNotes,
                })
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Political Party *</label>
                  <select
                    value={partyId}
                    onChange={(e) => setPartyId(e.target.value)}
                    required
                    aria-label="Select Political Party"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Party</option>
                    {partiesData?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.abbreviation} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Attribution Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    required
                    aria-label="Select Attribution Role"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="accused">Accused / Disruptor</option>
                    <option value="complainant">Complainant / Petitioner</option>
                    <option value="victim">Victim / Target</option>
                    <option value="witness">Witness</option>
                    <option value="mediator">Mediator</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Garba Usman"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Agent Phone</label>
                  <input
                    type="text"
                    value={agentPhone}
                    onChange={(e) => setAgentPhone(e.target.value)}
                    placeholder="0803..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Party Role</label>
                  <input
                    type="text"
                    value={agentPartyRole}
                    onChange={(e) => setAgentPartyRole(e.target.value)}
                    placeholder="Polling Agent"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Allegation / Incident Details *</label>
                <textarea
                  value={allegationDetails}
                  onChange={(e) => setAllegationDetails(e.target.value)}
                  required
                  rows={3}
                  placeholder="Describe the specific conduct, disruption, voter influence, or complaint..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Evidence Notes / Exhibits</label>
                <input
                  type="text"
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  placeholder="e.g. CCTV tape logged, ballot paper serial ranges, audio clip"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={logMutation.isPending}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all cursor-pointer disabled:opacity-50"
                >
                  {logMutation.isPending ? 'Recording...' : 'Save Attribution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
