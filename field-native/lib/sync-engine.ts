import { apiJson } from './api'
import { getToken } from './token-storage'
import { listQueue, removeByIds, type QueueRecord } from './offline-queue'

type SyncResponse = {
  ok: boolean
  results: { clientId: string; ok: boolean; error?: string; duplicate?: boolean }[]
}

function toSyncBody(rows: QueueRecord[]) {
  return {
    items: rows.map((r) => ({
      clientId: r.id,
      kind: r.kind,
      payload: r.payload,
      createdAt: r.createdAt,
    })),
  }
}

/** Upload pending queue items; marks successful rows synced then removes them from storage to save space. */
export async function flushOfflineQueue(): Promise<{ uploaded: number; errors: string[] }> {
  const token = await getToken()
  if (!token) return { uploaded: 0, errors: ['Not signed in'] }

  const rows = await listQueue()
  const pending = rows.filter((r) => !r.synced)
  if (!pending.length) return { uploaded: 0, errors: [] }

  try {
    const data = await apiJson<SyncResponse>('/api/field/sync', {
      method: 'POST',
      body: JSON.stringify(toSyncBody(pending)),
    })
    const okIds = new Set<string>()
    const errors: string[] = []
    for (const r of data.results || []) {
      if (r.ok) okIds.add(r.clientId)
      else if (r.clientId) errors.push(`${r.clientId}: ${r.error || 'failed'}`)
    }
    if (okIds.size) await removeByIds(okIds)
    return { uploaded: okIds.size, errors }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed'
    return { uploaded: 0, errors: [msg] }
  }
}
