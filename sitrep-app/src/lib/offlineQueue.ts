/**
 * Offline-first queue using IndexedDB for Field Portal (§1.3, §9.1).
 */

import { apiJson } from './api'

export type QueuedPayload = {
  id: string
  type: 'sitrep' | 'incident' | 'vote_tally' | 'violence'
  createdAt: string
  payload: Record<string, unknown>
  synced: boolean
}

const DB_NAME = 'election-sitrep-offline'
const STORE_NAME = 'queue'
const DB_VERSION = 1

function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

// Fallback in-memory queue for environments without IndexedDB (e.g. initial SSR if any, or strictly restricted iframe)
const memoryQueueFallback: QueuedPayload[] = []
let memoryMode = typeof indexedDB === 'undefined'

export async function listQueueAsync(): Promise<readonly QueuedPayload[]> {
  if (memoryMode) return [...memoryQueueFallback]
  try {
    const db = await getDb()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } catch (e) {
    console.error('Failed to list queue from IndexedDB', e)
    memoryMode = true
    return [...memoryQueueFallback]
  }
}

// Keeping sync versions for backwards compatibility with UI components that expect synchronous reads.
// In a real app we'd refactor the UI to handle async data loading for the queue.
// For now, we'll keep a cached copy of the DB state for synchronous access.
let cachedQueue: QueuedPayload[] = []

async function refreshCache() {
  cachedQueue = await listQueueAsync() as QueuedPayload[]
}

// Initial cache populate
void refreshCache()

export function listQueue(): readonly QueuedPayload[] {
  return [...cachedQueue]
}

export function getQueueDepth(): number {
  return cachedQueue.filter((q) => !q.synced).length
}

export async function enqueueOffline(item: Omit<QueuedPayload, 'id' | 'synced'>): Promise<string> {
  const id = crypto.randomUUID()
  const payload: QueuedPayload = { ...item, id, synced: false }
  
  if (memoryMode) {
    memoryQueueFallback.push(payload)
  } else {
    try {
      const db = await getDb()
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.add(payload)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (e) {
      console.error('Failed to enqueue to IndexedDB, falling back to memory', e)
      memoryMode = true
      memoryQueueFallback.push(payload)
    }
  }
  
  await refreshCache()
  return id
}

export async function flushQueueIfOnline(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0

  const items = (await listQueueAsync()).filter((q) => !q.synced)
  if (!items.length) return 0

  const syncItems = items.map((item) => ({
    clientId: item.id,
    kind: item.type,
    payload: item.payload,
    createdAt: item.createdAt,
  }))

  try {
    const response = await apiJson<{
      ok: boolean
      results: Array<{ clientId: string; ok: boolean; error?: string }>
    }>('/api/field/sync', {
      method: 'POST',
      body: JSON.stringify({ items: syncItems }),
    })

    const syncedIds = new Set(response.results.filter((result) => result.ok).map((result) => result.clientId))
    if (!syncedIds.size) return 0

    let updatedCount = 0
    for (const item of items) {
      if (!syncedIds.has(item.id)) continue
      item.synced = true
      updatedCount++

      if (memoryMode) {
        const idx = memoryQueueFallback.findIndex((i) => i.id === item.id)
        if (idx !== -1) memoryQueueFallback[idx] = item
      } else {
        try {
          const db = await getDb()
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite')
            const store = transaction.objectStore(STORE_NAME)
            const request = store.put(item)
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
          })
        } catch (e) {
          console.error('Failed to update synced status in IndexedDB', e)
        }
      }
    }

    if (updatedCount > 0) {
      await refreshCache()
    }
    return updatedCount
  } catch (e) {
    console.error('Offline queue sync failed', e)
    return 0
  }
}
