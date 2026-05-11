import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'
import { PORTALS } from '../../lib/navigation'
import type { PortalId } from '../../lib/navigation'

type IssuedRow = {
  username: string
  password: string | null
}

type BatchFromApi = {
  id: string
  batchId: string
  portalId: PortalId
  rankLabel: string
  roleLabel: string
  createdAt: string
  credentials: IssuedRow[]
}

type CreateBatchResponse = {
  batch: {
    id: string
    batchId: string
    portalId: PortalId
    rankLabel: string
    roleLabel: string
    createdAt: string
  }
  credentials: { username: string; password: string }[]
}

export function AdminCredentialBatches() {
  const qc = useQueryClient()
  const [portalId, setPortalId] = useState<PortalId>('field')
  const [rankLabel, setRankLabel] = useState('ASP')
  const [roleLabel, setRoleLabel] = useState('Field SitRep officer')
  const [count, setCount] = useState(5)
  /** Plaintext passwords returned once per batch generation (not stored in browser after refresh). */
  const [revealedByBatchKey, setRevealedByBatchKey] = useState<
    Record<string, { username: string; password: string }[]>
  >({})

  const batchesQuery = useQuery({
    queryKey: ['credential-batches'],
    queryFn: async () => {
      const j = await apiJson<{ batches: BatchFromApi[] }>('/api/admin/credential-batches')
      return j.batches
    },
  })

  const createMutation = useMutation({
    mutationFn: (body: { portalId: PortalId; rankLabel: string; roleLabel: string; count: number }) =>
      apiJson<CreateBatchResponse>('/api/admin/credential-batches', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setRevealedByBatchKey((prev) => ({ ...prev, [data.batch.id]: data.credentials }))
      void qc.invalidateQueries({ queryKey: ['credential-batches'] })
    },
  })

  function generateBatch() {
    const n = Math.min(50, Math.max(1, Math.floor(count)))
    createMutation.mutate({
      portalId,
      rankLabel: rankLabel.trim() || '—',
      roleLabel: roleLabel.trim() || '—',
      count: n,
    })
  }

  function passwordFor(b: BatchFromApi, username: string): string | null {
    const revealed = revealedByBatchKey[b.id]
    return revealed?.find((r) => r.username === username)?.password ?? null
  }

  function copyRow(b: BatchFromApi, username: string) {
    const pwd = passwordFor(b, username)
    if (!pwd) return
    void navigator.clipboard.writeText(`${username}\t${pwd}`)
  }

  function exportBatch(b: BatchFromApi) {
    const lines = ['username\tpassword']
    for (const c of b.credentials) {
      const pwd = passwordFor(b, c.username)
      if (pwd) lines.push(`${c.username}\t${pwd}`)
    }
    if (lines.length === 1) {
      void navigator.clipboard.writeText(
        'No plaintext passwords in this session for this batch. Generate a new batch to capture passwords once.',
      )
      return
    }
    void navigator.clipboard.writeText(lines.join('\n'))
  }

  const batches = batchesQuery.data ?? []

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Credential batches</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Pick portal access (role tier), rank label, and batch size. Usernames and passwords are generated server-side and
          stored in PostgreSQL. Plaintext passwords are shown only once when you create a batch (copy before leaving this page).
        </p>
      </header>

      <section className="sr-card max-w-2xl space-y-4">
        <h2 className="font-(--font-display) text-lg font-bold text-[var(--portal-fg)]">Generate batch</h2>
        {createMutation.isError ? (
          <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
            {(createMutation.error as Error).message}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="sr-label" htmlFor="portal">
              Portal / access tier
            </label>
            <select
              id="portal"
              value={portalId}
              onChange={(e) => setPortalId(e.target.value as PortalId)}
              className="sr-input"
              disabled={createMutation.isPending}
            >
              {(Object.keys(PORTALS) as PortalId[]).map((id) => (
                <option key={id} value={id}>
                  {PORTALS[id].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="sr-label" htmlFor="rank">
              Rank (label)
            </label>
            <input
              id="rank"
              value={rankLabel}
              onChange={(e) => setRankLabel(e.target.value)}
              className="sr-input"
              placeholder="e.g. ASP, CSP"
              disabled={createMutation.isPending}
            />
          </div>
          <div>
            <label className="sr-label" htmlFor="role">
              Role (label)
            </label>
            <input
              id="role"
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              className="sr-input"
              placeholder="Shown on export for ops desk"
              disabled={createMutation.isPending}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="sr-label" htmlFor="count">
              Accounts in batch
            </label>
            <input
              id="count"
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="sr-input max-w-[200px]"
              disabled={createMutation.isPending}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={generateBatch}
          disabled={createMutation.isPending}
          className="sr-btn-primary px-6 disabled:opacity-60"
        >
          {createMutation.isPending ? 'Creating…' : 'Generate batch (database)'}
        </button>
      </section>

      <section className="space-y-6">
        <h2 className="font-(--font-display) text-lg font-bold text-[var(--portal-fg)]">Issued batches</h2>
        {batchesQuery.isError ? (
          <p className="text-sm text-[#fca5a5]" role="alert">
            {(batchesQuery.error as Error).message}
          </p>
        ) : null}
        {batchesQuery.isLoading ? (
          <p className="text-sm text-[var(--portal-muted)]">Loading batches…</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-[var(--portal-muted)]">No batches yet — generate one above.</p>
        ) : (
          batches.map((b) => (
            <article key={b.id} className="sr-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">{b.id}</p>
                  <p className="mt-1 font-(--font-display) font-bold text-[var(--portal-fg)]">{PORTALS[b.portalId].label}</p>
                  <p className="mt-1 text-sm text-[var(--portal-muted)]">
                    Rank: {b.rankLabel} · Role: {b.roleLabel}
                  </p>
                  <p className="mt-1 font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                    {new Date(b.createdAt).toLocaleString('en-NG')}
                  </p>
                </div>
                <button type="button" onClick={() => exportBatch(b)} className="sr-btn-ghost shrink-0 text-xs">
                  Copy TSV (rows with passwords this session)
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)]">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
                      <th className="px-3 py-2">Username</th>
                      <th className="px-3 py-2">Password</th>
                      <th className="w-28 px-3 py-2"> </th>
                    </tr>
                  </thead>
                  <tbody className="font-(--font-mono) text-[12px] text-[var(--portal-muted)]">
                    {b.credentials.map((c) => {
                      const pwd = passwordFor(b, c.username)
                      return (
                        <tr key={c.username} className="border-b border-[color:var(--portal-border)] last:border-0">
                          <td className="px-3 py-2 text-[#0dccb0]">{c.username}</td>
                          <td className="px-3 py-2">
                            {pwd ?? (
                              <span className="text-[var(--portal-dim)]">Not shown (create batch to capture once)</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="sr-btn-ghost text-[10px] disabled:opacity-40"
                              disabled={!pwd}
                              onClick={() => copyRow(b, c.username)}
                            >
                              Copy row
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  )
}
