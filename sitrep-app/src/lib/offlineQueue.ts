/**
 * Offline-first queue stub for Field Portal (§1.3, §9.1).
 * Production: IndexedDB + Background Sync API; sync on reconnect.
 */

export type QueuedPayload = {
  id: string
  type: 'sitrep' | 'incident' | 'vote_tally' | 'violence'
  createdAt: string
  payload: Record<string, unknown>
  synced: boolean
}

const memoryQueue: QueuedPayload[] = []

export function listQueue(): readonly QueuedPayload[] {
  return [...memoryQueue]
}

export function getQueueDepth(): number {
  return memoryQueue.filter((q) => !q.synced).length
}

export async function enqueueOffline(item: Omit<QueuedPayload, 'id' | 'synced'>): Promise<string> {
  const id = crypto.randomUUID()
  memoryQueue.push({ ...item, id, synced: false })
  return id
}

export async function flushQueueIfOnline(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0
  let n = 0
  for (const q of memoryQueue) {
    if (!q.synced) {
      q.synced = true
      n++
    }
  }
  return n
}
