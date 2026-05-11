import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, apiJson } from '../lib/api'
import type { ContestCode } from './election-setup-types'

type ApiParty = {
  id: string
  name: string
  abbreviation: string
}

type FullTree = {
  states: { id: number; code: string; name: string }[]
  lgas: { id: number; stateId: number; code: string; name: string }[]
  wards: { id: number; lgaId: number; code: string; name: string }[]
  pollingUnits: { id: number; wardId: number; code: string; name: string; lat: number; lng: number }[]
}

const ALL_CONTEST_CODES: ContestCode[] = [
  'presidential',
  'governorship',
  'senatorial',
  'house_of_reps',
  'state_assembly',
  'lg_chairmanship',
  'councillorship',
  'other',
]

const CONTEST_LABEL: Record<ContestCode, string> = {
  presidential: 'Presidential',
  governorship: 'Governorship',
  senatorial: 'Senatorial',
  house_of_reps: 'Federal House of Representatives',
  state_assembly: 'State House of Assembly',
  lg_chairmanship: 'Local government chairmanship',
  councillorship: 'Councillorship',
  other: 'Other',
}

function needsStateScopedContest(types: ContestCode[]) {
  return types.some((t) => t === 'governorship' || t === 'lg_chairmanship' || t === 'councillorship')
}

type GovStateSelection = number | '' | 'all'

/** Full automatic geography: presidential nationwide, all-state governorship/LG, or one full state. */
function scopeUsesServerPreset(types: ContestCode[], govStateId: GovStateSelection) {
  if (types.includes('presidential')) return true
  if (!needsStateScopedContest(types)) return false
  return (
    govStateId === 'all' ||
    (typeof govStateId === 'number' && Number.isFinite(govStateId) && govStateId >= 1)
  )
}

function nextDefaultContest(existing: ContestCode[]): ContestCode {
  const used = new Set(existing)
  for (const c of ALL_CONTEST_CODES) {
    if (!used.has(c)) return c
  }
  return 'other'
}

function parseContestTypesFromApi(e: { contestTypes?: string[]; electionCategory?: string }): ContestCode[] {
  const raw = e.contestTypes
  if (Array.isArray(raw) && raw.length) {
    const out: ContestCode[] = []
    for (const x of raw) {
      const c = String(x).trim().toLowerCase() as ContestCode
      if (ALL_CONTEST_CODES.includes(c) && !out.includes(c)) out.push(c)
    }
    if (out.length) return out
  }
  const leg = String(e.electionCategory || 'other')
    .trim()
    .toLowerCase() as ContestCode
  if (ALL_CONTEST_CODES.includes(leg)) return [leg]
  return ['other']
}

type SetupElection = {
  slug: string
  name: string
  electionDate: string | null
  status: string
  electionCategory: string
  contestTypes?: ContestCode[]
  isRerun: boolean
  governorshipStateId: number | null
  governorshipAllStates?: boolean
}

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  editSlug?: string | null
  onClose: () => void
  onSaved: () => void
}

function scopeKey(level: string, id: number) {
  return `${level}:${id}`
}

function newGeoId() {
  return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type GeoLgaRow = {
  id: string
  lgaId: number | ''
  /** Ward id → checked reveals polling units below */
  wardOpen: Record<string, boolean>
  /** Ward id → PU id → selected */
  puPick: Record<string, Record<string, boolean>>
}

type GeoStateBlock = {
  id: string
  stateId: number | ''
  lgas: GeoLgaRow[]
}

function emptyLgaRow(): GeoLgaRow {
  return { id: newGeoId(), lgaId: '', wardOpen: {}, puPick: {} }
}

function emptyStateBlock(): GeoStateBlock {
  return { id: newGeoId(), stateId: '', lgas: [emptyLgaRow()] }
}

function geoBlocksToScopeItems(blocks: GeoStateBlock[]): { level: string; refId: number; included: boolean }[] {
  const seen = new Set<string>()
  const out: { level: string; refId: number; included: boolean }[] = []
  for (const b of blocks) {
    if (b.stateId === '') continue
    const sid = Number(b.stateId)
    for (const lg of b.lgas) {
      if (lg.lgaId === '') continue
      const lgaId = Number(lg.lgaId)
      for (const [wardStr, pus] of Object.entries(lg.puPick)) {
        if (!pus) continue
        const wardId = Number(wardStr)
        for (const [puStr, on] of Object.entries(pus)) {
          if (!on) continue
          const puId = Number(puStr)
          const tuples: [string, number][] = [
            ['state', sid],
            ['lga', lgaId],
            ['ward', wardId],
            ['pu', puId],
          ]
          for (const [level, refId] of tuples) {
            const k = scopeKey(level, refId)
            if (seen.has(k)) continue
            seen.add(k)
            out.push({ level, refId, included: true })
          }
        }
      }
    }
  }
  return out
}

function hydrateGeoBlocksFromSetup(
  data: {
    states: { id: number; included: boolean }[]
    lgas: { id: number; stateId: number; included: boolean }[]
    wards: { id: number; lgaId: number; included: boolean }[]
    pollingUnits: { id: number; wardId: number; included: boolean }[]
  },
  tree: FullTree,
): GeoStateBlock[] {
  const includedPus = data.pollingUnits.filter((p) => p.included)
  if (includedPus.length > 0) {
    const byState = new Map<number, Map<number, { wardId: number; puId: number }[]>>()
    for (const row of includedPus) {
      const pu = tree.pollingUnits.find((x) => x.id === row.id)
      if (!pu) continue
      const ward = tree.wards.find((w) => w.id === pu.wardId)
      if (!ward) continue
      const lga = tree.lgas.find((l) => l.id === ward.lgaId)
      if (!lga) continue
      const sid = lga.stateId
      if (!byState.has(sid)) byState.set(sid, new Map())
      const inner = byState.get(sid)!
      if (!inner.has(lga.id)) inner.set(lga.id, [])
      inner.get(lga.id)!.push({ wardId: ward.id, puId: row.id })
    }
    const blocks: GeoStateBlock[] = []
    for (const [sid, lgaMap] of byState) {
      const lgas: GeoLgaRow[] = []
      for (const [lgaId, lines] of lgaMap) {
        const wardOpen: Record<string, boolean> = {}
        const puPick: Record<string, Record<string, boolean>> = {}
        for (const line of lines) {
          const ws = String(line.wardId)
          wardOpen[ws] = true
          if (!puPick[ws]) puPick[ws] = {}
          puPick[ws][String(line.puId)] = true
        }
        lgas.push({ id: newGeoId(), lgaId, wardOpen, puPick })
      }
      blocks.push({ id: newGeoId(), stateId: sid, lgas })
    }
    return blocks.length ? blocks : [emptyStateBlock()]
  }
  const stIds = data.states.filter((s) => s.included).map((s) => s.id)
  if (stIds.length === 0) return [emptyStateBlock()]
  return stIds.map((sid) => ({
    id: newGeoId(),
    stateId: sid,
    lgas: [emptyLgaRow()],
  }))
}

async function parseOk(res: Response) {
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data && typeof (data as { error: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

export function ElectionSetupWizard({ open, mode, editSlug, onClose, onSaved }: Props) {
  const partiesQuery = useQuery({
    queryKey: ['parties'],
    queryFn: async () => {
      const res = await apiFetch('/api/parties')
      const data = (await parseOk(res)) as { parties: ApiParty[] } | null
      return data?.parties ?? []
    },
    enabled: open,
  })

  const treeQuery = useQuery({
    queryKey: ['geography-full-tree'],
    queryFn: () => apiJson<FullTree>('/api/geography/full-tree'),
    enabled: open,
  })

  const setupQuery = useQuery({
    queryKey: ['election-setup', editSlug],
    queryFn: () =>
      apiJson<{
        election: SetupElection
        parties: { partyId: string; partyName: string; abbreviation: string; candidateName: string }[]
        states: { id: number; code: string; name: string; included: boolean }[]
        lgas: { id: number; stateId: number; code: string; name: string; included: boolean }[]
        wards: { id: number; lgaId: number; code: string; name: string; included: boolean }[]
        pollingUnits: { id: number; wardId: number; code: string; name: string; lat: number; lng: number; included: boolean }[]
      }>(`/api/admin/elections/${encodeURIComponent(editSlug ?? '')}/setup`),
    enabled: open && mode === 'edit' && Boolean(editSlug),
  })

  const [name, setName] = useState('')
  const [electionDate, setElectionDate] = useState('')
  const [status, setStatus] = useState<'draft' | 'active' | 'closed'>('draft')
  const [electionKind, setElectionKind] = useState<'fresh' | 'rerun'>('fresh')
  const [contestTypes, setContestTypes] = useState<ContestCode[]>(['presidential'])
  const [govStateId, setGovStateId] = useState<GovStateSelection>('')
  const [candidateByParty, setCandidateByParty] = useState<Record<string, string>>({})
  const [geoBlocks, setGeoBlocks] = useState<GeoStateBlock[]>(() => [emptyStateBlock()])
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const tree = treeQuery.data

  const lockedStateId =
    needsStateScopedContest(contestTypes) && typeof govStateId === 'number'
      ? govStateId
      : null

  useEffect(() => {
    if (!open || mode !== 'edit' || !setupQuery.data || !tree) return
    const e = setupQuery.data.election
    setName(e.name)
    setElectionDate(e.electionDate ?? '')
    setStatus(e.status as 'draft' | 'active' | 'closed')
    setElectionKind(e.isRerun ? 'rerun' : 'fresh')
    setContestTypes(parseContestTypesFromApi(e))
    setGovStateId(e.governorshipAllStates ? 'all' : e.governorshipStateId != null ? e.governorshipStateId : '')
    const cand: Record<string, string> = {}
    for (const p of setupQuery.data.parties) cand[p.partyId] = p.candidateName
    setCandidateByParty(cand)
    setGeoBlocks(hydrateGeoBlocksFromSetup(setupQuery.data, tree))
  }, [open, mode, setupQuery.data, tree])

  useEffect(() => {
    if (lockedStateId === null) return
    setGeoBlocks((prev) => prev.map((b) => ({ ...b, stateId: lockedStateId })))
  }, [lockedStateId])

  useEffect(() => {
    if (!open || mode !== 'create') return
    setName('')
    setElectionDate('')
    setStatus('draft')
    setElectionKind('fresh')
    setContestTypes(['presidential'])
    setGovStateId('')
    setCandidateByParty({})
    setGeoBlocks([emptyStateBlock()])
    setSubmitErr(null)
  }, [open, mode])

  const scopeItemsPayload = useMemo(() => geoBlocksToScopeItems(geoBlocks), [geoBlocks])

  const isRerunElection = electionKind === 'rerun'

  const presetScope = scopeUsesServerPreset(contestTypes, govStateId)
  const governorStateLabel =
    govStateId === 'all'
      ? 'All states'
      : govStateId !== ''
        ? tree?.states.find((s) => s.id === Number(govStateId))?.name ?? ''
        : ''

  function setBlockState(idx: number, stateId: number | '') {
    setGeoBlocks((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], stateId, lgas: [emptyLgaRow()] }
      return next
    })
  }

  function setLgaId(blockIdx: number, lgaIdx: number, lgaId: number | '') {
    setGeoBlocks((prev) => {
      const blocks = [...prev]
      const lgas = [...blocks[blockIdx].lgas]
      lgas[lgaIdx] = {
        ...lgas[lgaIdx],
        lgaId,
        wardOpen: {},
        puPick: {},
      }
      blocks[blockIdx] = { ...blocks[blockIdx], lgas }
      return blocks
    })
  }

  function toggleWard(blockIdx: number, lgaIdx: number, wardId: number, checked: boolean) {
    const wk = String(wardId)
    setGeoBlocks((prev) => {
      const blocks = [...prev]
      const lgas = [...blocks[blockIdx].lgas]
      const row = { ...lgas[lgaIdx] }
      row.wardOpen = { ...row.wardOpen, [wk]: checked }
      if (!checked) {
        const nextPick = { ...row.puPick }
        delete nextPick[wk]
        row.puPick = nextPick
      }
      lgas[lgaIdx] = row
      blocks[blockIdx] = { ...blocks[blockIdx], lgas }
      return blocks
    })
  }

  function togglePu(blockIdx: number, lgaIdx: number, wardId: number, puId: number, checked: boolean) {
    const wk = String(wardId)
    const pk = String(puId)
    setGeoBlocks((prev) => {
      const blocks = [...prev]
      const lgas = [...blocks[blockIdx].lgas]
      const row = { ...lgas[lgaIdx] }
      const byWard = { ...(row.puPick[wk] || {}) }
      if (checked) byWard[pk] = true
      else delete byWard[pk]
      row.puPick = { ...row.puPick, [wk]: byWard }
      lgas[lgaIdx] = row
      blocks[blockIdx] = { ...blocks[blockIdx], lgas }
      return blocks
    })
  }

  function addStateBlock() {
    const blank = emptyStateBlock()
    if (lockedStateId !== null) blank.stateId = lockedStateId
    setGeoBlocks((prev) => [...prev, blank])
  }

  function removeStateBlock(idx: number) {
    setGeoBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  function addLgaRow(blockIdx: number) {
    setGeoBlocks((prev) => {
      const next = [...prev]
      next[blockIdx] = { ...next[blockIdx], lgas: [...next[blockIdx].lgas, emptyLgaRow()] }
      return next
    })
  }

  function removeLgaRow(blockIdx: number, lgaIdx: number) {
    setGeoBlocks((prev) => {
      const next = [...prev]
      const lgas = next[blockIdx].lgas.filter((_, i) => i !== lgaIdx)
      next[blockIdx] = { ...next[blockIdx], lgas: lgas.length ? lgas : [emptyLgaRow()] }
      return next
    })
  }

  function updateContestAt(idx: number, value: ContestCode) {
    setContestTypes((prev) => {
      const next = [...prev]
      if (prev.some((c, i) => c === value && i !== idx)) return prev
      next[idx] = value
      return next
    })
  }

  async function handleSubmit() {
    setSubmitErr(null)
    if (!name.trim()) {
      setSubmitErr('Election name is required.')
      return
    }
    if (contestTypes.length === 0) {
      setSubmitErr('Add at least one election type.')
      return
    }
    if (needsStateScopedContest(contestTypes) && govStateId === '') {
      setSubmitErr(
        'Select a state or choose All states (nationwide) for governorship, chairmanship, or councillorship contests.',
      )
      return
    }
    if (!presetScope && isRerunElection) {
      setSubmitErr(
        'Re-run elections use automatic full geography only: add Presidential (nationwide) or Governorship / LG chairmanship / Councillorship with one state or all states. Ward and polling unit lists cannot be chosen manually.',
      )
      return
    }
    if (!presetScope && geoBlocksToScopeItems(geoBlocks).length === 0) {
      setSubmitErr(
        'Add geographic scope: choose state and LGA, tick wards to open polling units, then tick at least one polling unit (+ Add state / + LGA as needed).',
      )
      return
    }
    const candidates = (partiesQuery.data ?? []).map((p) => ({
      partyId: p.id,
      candidateName: candidateByParty[p.id] ?? '',
    }))

    const payloadBase = {
      electionKind,
      contestTypes,
      isRerun: isRerunElection,
      governorshipAllStates: needsStateScopedContest(contestTypes) && govStateId === 'all',
      governorshipStateId:
        needsStateScopedContest(contestTypes) && typeof govStateId === 'number' ? govStateId : null,
      candidates,
      applyPreset: Boolean(presetScope),
      scopeItems: presetScope ? [] : scopeItemsPayload,
    }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const res = await apiFetch('/api/admin/elections', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            electionDate: electionDate.trim() || null,
            status,
            ...payloadBase,
          }),
        })
        await parseOk(res)
      } else if (editSlug) {
        const res = await apiFetch(`/api/admin/elections/${encodeURIComponent(editSlug)}/setup`, {
          method: 'PUT',
          body: JSON.stringify(payloadBase),
        })
        await parseOk(res)
        const patchRes = await apiFetch(`/api/admin/elections/${encodeURIComponent(editSlug)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: name.trim(),
            electionDate: electionDate.trim() || null,
            status,
          }),
        })
        await parseOk(patchRes)
      }
      onSaved()
      onClose()
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const loading = partiesQuery.isLoading || treeQuery.isLoading || (mode === 'edit' && setupQuery.isLoading)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="sr-card relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border-[#0dccb0]/25 shadow-2xl"
        role="dialog"
        aria-modal
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--portal-border)] px-6 py-4">
          <div>
            <h2 className="font-(--font-syne) text-lg font-bold text-[var(--portal-fg)]">
              {mode === 'create' ? 'New election' : 'Configure election'}
            </h2>
            <p className="mt-1 text-sm text-[var(--portal-muted)]">
              Choose fresh election or re-run, name the event, then add one or more simultaneous contests (e.g. presidential + senatorial
              + federal representatives). Presidential elections include every ward and polling unit nationwide automatically. For governorship,
              you can pick one state, or <span className="font-semibold text-[var(--portal-fg)]">All states (nationwide)</span> to include every
              state; other LG contests still use one state or all states the same way. Re-run uses the same automatic scope — ward and PU
              checklists are not used. Other contest types still use manual ward / PU selection below.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 font-(--font-mono) text-xs text-[var(--portal-muted)] hover:bg-[var(--portal-table-row-hover)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-[var(--portal-muted)]">Loading…</p>
          ) : (
            <div className="space-y-8">
              <section className="grid gap-4 md:grid-cols-2">
                <label className="block text-[13px] md:col-span-2">
                  <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Election run type</span>
                  <select
                    value={electionKind}
                    onChange={(e) => setElectionKind(e.target.value as 'fresh' | 'rerun')}
                    className="mt-1 w-full max-w-md rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
                  >
                    <option value="fresh">Fresh election</option>
                    <option value="rerun">Re-run</option>
                  </select>
                </label>
                <label className="block text-[13px]">
                  <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
                  />
                </label>
                <label className="block text-[13px]">
                  <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Election date</span>
                  <input
                    type="date"
                    value={electionDate}
                    onChange={(e) => setElectionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
                  />
                </label>

                <div className="md:col-span-2">
                  <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Contests on this election</span>
                  <p className="mt-1 text-xs text-[var(--portal-muted)]">
                    Add every ballot type held on the same day (duplicates not allowed). Use &quot;Add election type&quot; for combined polls.
                  </p>
                  <div className="mt-3 space-y-2">
                    {contestTypes.map((ct, idx) => (
                      <div key={`row-${idx}`} className="flex flex-wrap items-center gap-2">
                        <select
                          value={ct}
                          onChange={(e) => updateContestAt(idx, e.target.value as ContestCode)}
                          className="min-w-[min(100%,280px)] flex-1 rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[13px] text-[var(--portal-fg)]"
                          aria-label={`Election type ${idx + 1}`}
                        >
                          {ALL_CONTEST_CODES.map((c) => (
                            <option key={c} value={c} disabled={contestTypes.some((x, i) => x === c && i !== idx)}>
                              {CONTEST_LABEL[c]}
                            </option>
                          ))}
                        </select>
                        {contestTypes.length > 1 ? (
                          <button
                            type="button"
                            className="rounded-lg border border-[color:var(--portal-border)] px-3 py-1.5 text-[12px] text-[var(--portal-muted)] hover:bg-[var(--portal-table-row-hover)]"
                            onClick={() => setContestTypes((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={contestTypes.length >= ALL_CONTEST_CODES.length}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#0dccb0]/40 bg-[#0dccb0]/10 px-3 py-2 text-[12px] font-semibold text-[#0dccb0] disabled:opacity-40"
                      onClick={() => setContestTypes((prev) => [...prev, nextDefaultContest(prev)])}
                    >
                      + Add election type
                    </button>
                  </div>
                </div>

                <label className="block text-[13px]">
                  <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">Status</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as typeof status)}
                    className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
                  >
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="closed">closed</option>
                  </select>
                </label>

                {needsStateScopedContest(contestTypes) ? (
                  <label className="block text-[13px] md:col-span-2">
                    <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">
                      State (governorship / LG chairmanship / councillorship)
                    </span>
                    <select
                      value={govStateId === '' ? '' : govStateId === 'all' ? 'all' : String(govStateId)}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '') setGovStateId('')
                        else if (v === 'all') setGovStateId('all')
                        else setGovStateId(Number(v))
                      }}
                      className="mt-1 w-full max-w-xl rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
                    >
                      <option value="">Select state…</option>
                      {contestTypes.includes('governorship') ? (
                        <option value="all">All states (nationwide)</option>
                      ) : null}
                      {(tree?.states ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </section>

              <section>
                <h3 className="font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Parties &amp; candidates</h3>
                <p className="mt-1 text-xs text-[var(--portal-muted)]">Registered parties — enter ballot name per party for this election.</p>
                <div className="mt-3 max-h-[min(40vh,320px)] overflow-auto rounded-xl border border-[color:var(--portal-border)]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[color:var(--portal-table-row-hover)]">
                      <tr>
                        <th className="px-3 py-2 text-left font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Party</th>
                        <th className="px-3 py-2 text-left font-(--font-mono) text-[10px] uppercase text-[var(--portal-dim)]">Candidate name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(partiesQuery.data ?? []).map((p) => (
                        <tr key={p.id} className="border-t border-[color:var(--portal-border)]">
                          <td className="px-3 py-2 font-medium text-[var(--portal-fg)]">
                            {p.name}{' '}
                            <span className="font-(--font-mono) text-[11px] text-[#0dccb0]">({p.abbreviation})</span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={candidateByParty[p.id] ?? ''}
                              onChange={(e) =>
                                setCandidateByParty((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-2 py-1 text-[13px]"
                              placeholder="Candidate as on ballot"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="font-(--font-syne) text-sm font-semibold text-[var(--portal-fg)]">Geographic scope</h3>

                {presetScope ? (
                  <div className="rounded-xl border border-[#0dccb0]/35 bg-[#0dccb0]/10 px-4 py-3 text-sm text-[var(--portal-fg)]">
                    <p className="font-semibold">
                      {contestTypes.includes('presidential')
                        ? 'Nationwide (Presidential)'
                        : govStateId === 'all'
                          ? 'Nationwide (all states — governorship / LG scope)'
                          : `Full state (${governorStateLabel || 'selected state'})`}
                    </p>
                    <p className="mt-2 text-xs text-[var(--portal-muted)]">
                      {contestTypes.includes('presidential') || govStateId === 'all'
                        ? 'Every state, LGA, ward, and polling unit in the database is included — nothing is excluded.'
                        : 'Every LGA, ward, and polling unit within the selected state is included.'}{' '}
                      {isRerunElection
                        ? ' Re-run: ward and polling unit selection is disabled; this full scope applies.'
                        : ' Fresh election: same automatic full scope.'}
                    </p>
                  </div>
                ) : !tree ? (
                  <p className="text-sm text-[var(--portal-muted)]">Loading geography…</p>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-[var(--portal-muted)]">
                      Select state and LGA, then tick one or more <span className="font-semibold text-[var(--portal-fg)]">wards</span>. For
                      each ticked ward, tick the <span className="font-semibold text-[var(--portal-fg)]">polling units</span> to include.
                      Use <span className="font-semibold text-[var(--portal-fg)]">+ Add state</span> or{' '}
                      <span className="font-semibold text-[var(--portal-fg)]">+ LGA</span> for multiple states or LGAs.
                      {lockedStateId !== null
                        ? ' Governorship / chairmanship / councillorship contests use the state you selected above.'
                        : null}
                    </p>
                  <div className="space-y-6">
                    {geoBlocks.map((block, bi) => {
                      const stateOptions =
                        lockedStateId !== null ? tree.states.filter((s) => s.id === lockedStateId) : tree.states
                      const sid = block.stateId === '' ? null : Number(block.stateId)
                      const lgasForState = sid === null ? [] : tree.lgas.filter((l) => l.stateId === sid)

                      return (
                        <div
                          key={block.id}
                          className="rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)]/30 p-4"
                        >
                          <div className="mb-3 flex flex-wrap items-end gap-2">
                            <label className="block min-w-[200px] flex-1 text-[13px]">
                              <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">State</span>
                              <select
                                value={block.stateId === '' ? '' : String(block.stateId)}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setBlockState(bi, v ? Number(v) : '')
                                }}
                                disabled={lockedStateId !== null}
                                className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-80"
                              >
                                <option value="">Select state…</option>
                                {stateOptions.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.code})
                                  </option>
                                ))}
                              </select>
                            </label>
                            {geoBlocks.length > 1 ? (
                              <button
                                type="button"
                                className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-[12px] text-[var(--portal-muted)] hover:bg-[var(--portal-table-row-hover)]"
                                onClick={() => removeStateBlock(bi)}
                              >
                                Remove state
                              </button>
                            ) : null}
                          </div>

                          <div className="ml-0 space-y-4 border-l-2 border-[color:var(--portal-border)] pl-4 md:ml-2">
                            {block.lgas.map((lg, li) => {
                              const wardsForLga =
                                lg.lgaId === '' ? [] : tree.wards.filter((w) => w.lgaId === Number(lg.lgaId))

                              return (
                                <div key={lg.id} className="space-y-2 rounded-lg border border-[color:var(--portal-border)]/80 p-3">
                                  <div className="flex flex-wrap items-end gap-2">
                                    <button
                                      type="button"
                                      className="mb-1 shrink-0 rounded-md border border-[#0dccb0]/40 px-2 py-1 font-(--font-mono) text-[11px] font-bold text-[#0dccb0] hover:bg-[#0dccb0]/10"
                                      onClick={() => addLgaRow(bi)}
                                      title="Add another LGA under this state"
                                    >
                                      + LGA
                                    </button>
                                    <label className="block min-w-[180px] flex-1 text-[13px]">
                                      <span className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">
                                        Local government area
                                      </span>
                                      <select
                                        value={lg.lgaId === '' ? '' : String(lg.lgaId)}
                                        onChange={(e) => {
                                          const v = e.target.value
                                          setLgaId(bi, li, v ? Number(v) : '')
                                        }}
                                        disabled={sid === null}
                                        className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)] disabled:opacity-50"
                                      >
                                        <option value="">{sid === null ? 'Select state first…' : 'Select LGA…'}</option>
                                        {lgasForState.map((l) => (
                                          <option key={l.id} value={l.id}>
                                            {l.name} ({l.code})
                                          </option>
                                        ))}
                                      </select>
                                      {sid !== null && lgasForState.length > 0 ? (
                                        <p className="mt-1 font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                                          {lgasForState.length} LGA{lgasForState.length === 1 ? '' : 's'} available for this state in the
                                          database (full national INEC list requires importing complete geography data).
                                        </p>
                                      ) : null}
                                    </label>
                                    {block.lgas.length > 1 ? (
                                      <button
                                        type="button"
                                        className="mb-1 rounded-lg border border-[color:var(--portal-border)] px-2 py-1 text-[11px] text-[var(--portal-muted)]"
                                        onClick={() => removeLgaRow(bi, li)}
                                      >
                                        Remove LGA row
                                      </button>
                                    ) : null}
                                  </div>

                                  {lg.lgaId !== '' ? (
                                    <div className="mt-3 space-y-2">
                                      <div className="font-(--font-mono) text-[10px] font-semibold uppercase text-[var(--portal-dim)]">
                                        Wards (tick to show polling units)
                                      </div>
                                      {wardsForLga.length === 0 ? (
                                        <p className="text-[12px] text-[var(--portal-muted)]">No wards in catalog for this LGA.</p>
                                      ) : (
                                        <ul className="space-y-2">
                                          {wardsForLga.map((w) => {
                                            const pusInWard = tree.pollingUnits.filter((p) => p.wardId === w.id)
                                            const open = lg.wardOpen[String(w.id)] ?? false
                                            return (
                                              <li
                                                key={w.id}
                                                className="overflow-hidden rounded-lg border border-[color:var(--portal-border)]/70 bg-[var(--portal-input-bg)]/50"
                                              >
                                                <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                                                    <input
                                                      type="checkbox"
                                                      className="mt-0.5"
                                                      checked={open}
                                                      disabled={isRerunElection}
                                                      onChange={(e) => toggleWard(bi, li, w.id, e.target.checked)}
                                                    />
                                                  <span className="text-[13px] leading-snug text-[var(--portal-fg)]">
                                                    <span className="font-(--font-mono) text-[11px] text-[#0dccb0]">{w.code}</span> — {w.name}
                                                  </span>
                                                </label>
                                                {open ? (
                                                  <div className="border-t border-[color:var(--portal-border)]/60 bg-[var(--portal-input-bg)]/80 px-3 py-2 pl-10">
                                                    <div className="mb-2 font-(--font-mono) text-[10px] font-semibold uppercase text-[var(--portal-dim)]">
                                                      Polling units
                                                    </div>
                                                    {pusInWard.length === 0 ? (
                                                      <p className="text-[12px] text-[var(--portal-muted)]">No polling units for this ward.</p>
                                                    ) : (
                                                      <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                                                        {pusInWard.map((p) => (
                                                          <li key={p.id}>
                                                            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[var(--portal-muted)]">
                                                              <input
                                                                type="checkbox"
                                                                checked={lg.puPick[String(w.id)]?.[String(p.id)] ?? false}
                                                                disabled={isRerunElection}
                                                                onChange={(e) => togglePu(bi, li, w.id, p.id, e.target.checked)}
                                                              />
                                                              <span>
                                                                <span className="font-(--font-mono) text-[11px] text-[var(--portal-fg)]">
                                                                  {p.code}
                                                                </span>{' '}
                                                                — {p.name}
                                                              </span>
                                                            </label>
                                                          </li>
                                                        ))}
                                                      </ul>
                                                    )}
                                                  </div>
                                                ) : null}
                                              </li>
                                            )
                                          })}
                                        </ul>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      className="rounded-lg border border-[#0dccb0]/50 px-4 py-2.5 text-[13px] font-semibold text-[#0dccb0] hover:bg-[#0dccb0]/10"
                      onClick={addStateBlock}
                    >
                      + Add state
                    </button>
                  </div>
                  </div>
                )}
              </section>

              {submitErr ? (
                <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
                  {submitErr}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[color:var(--portal-border)] px-6 py-4">
          <button type="button" className="sr-btn-ghost px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || loading}
            className="rounded-lg bg-[#00C896] px-5 py-2 text-sm font-semibold text-[#0A1628] disabled:opacity-50"
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Saving…' : mode === 'create' ? 'Create election' : 'Save configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}
