import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import NetInfo from '@react-native-community/netinfo'

/**
 * Generic offline request queue for any HTTP API call.
 * Stores requests as { method, path, body } and replays them in order when
 * the network returns. Used by report screens that don't go through the
 * field-batch sync channel (sitrep/incident/violence already do).
 */

const KEY = '@field_offline_requests'

export type QueuedRequest = {
  id: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: string
  label: string
  createdAt: string
}

async function readAll(): Promise<QueuedRequest[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(items: QueuedRequest[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items))
}

export async function enqueueRequest(
  method: QueuedRequest['method'],
  path: string,
  body: unknown,
  label: string,
): Promise<{ queued: true; id: string }> {
  const id = Crypto.randomUUID()
  const items = await readAll()
  items.push({
    id,
    method,
    path,
    body: body ? JSON.stringify(body) : undefined,
    label,
    createdAt: new Date().toISOString(),
  })
  await writeAll(items)
  return { queued: true, id }
}

export async function listQueuedRequests(): Promise<QueuedRequest[]> {
  return readAll()
}

export async function countQueuedRequests(): Promise<number> {
  return (await readAll()).length
}

async function removeIds(ids: Set<string>) {
  if (!ids.size) return
  const items = await readAll()
  await writeAll(items.filter((x) => !ids.has(x.id)))
}

/**
 * Attempt to flush all queued requests against the live API.
 * Returns the count successfully delivered and any errors.
 */
export async function flushQueuedRequests(
  token: string,
  apiFetch: <T>(path: string, opts: { method?: string; token?: string; body?: string }) => Promise<T>,
): Promise<{ flushed: number; errors: string[]; remaining: number }> {
  const items = await readAll()
  if (!items.length) return { flushed: 0, errors: [], remaining: 0 }

  const errors: string[] = []
  const okIds = new Set<string>()
  for (const item of items) {
    try {
      await apiFetch(item.path, {
        method: item.method,
        token,
        body: item.body,
      })
      okIds.add(item.id)
    } catch (e) {
      errors.push(`${item.label}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }
  await removeIds(okIds)
  const remaining = (await readAll()).length
  return { flushed: okIds.size, errors, remaining }
}

/**
 * Subscribe to network restoration and auto-flush when online.
 * Returns an unsubscribe function.
 */
export function autoFlushOnReconnect(
  token: () => string | null,
  apiFetch: <T>(path: string, opts: { method?: string; token?: string; body?: string }) => Promise<T>,
  onFlushed?: (result: { flushed: number; errors: string[]; remaining: number }) => void,
) {
  let running = false
  const unsub = NetInfo.addEventListener(async (state) => {
    if (!state.isConnected || running) return
    const t = token()
    if (!t) return
    running = true
    try {
      const result = await flushQueuedRequests(t, apiFetch)
      if (result.flushed > 0 || result.remaining > 0) onFlushed?.(result)
    } catch {
      // ignore — will retry on next connectivity change
    } finally {
      running = false
    }
  })
  return unsub
}
