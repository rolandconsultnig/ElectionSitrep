import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'field_native_offline_queue_v1'

export type QueueKind = 'sitrep' | 'incident' | 'violence' | 'vote_tally'

export type QueueRecord = {
  id: string
  kind: QueueKind
  createdAt: string
  payload: Record<string, unknown>
  synced: boolean
}

async function readAll(): Promise<QueueRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueueRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(rows: QueueRecord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export async function listQueue(): Promise<QueueRecord[]> {
  return readAll()
}

export async function pendingCount(): Promise<number> {
  const rows = await readAll()
  return rows.filter((r) => !r.synced).length
}

export async function enqueue(item: Omit<QueueRecord, 'synced'> & { synced?: boolean }): Promise<string> {
  const rows = await readAll()
  const row: QueueRecord = {
    id: item.id,
    kind: item.kind,
    createdAt: item.createdAt,
    payload: item.payload,
    synced: item.synced ?? false,
  }
  rows.push(row)
  await writeAll(rows)
  return row.id
}

export async function removeByIds(ids: Set<string>): Promise<void> {
  const rows = await readAll()
  await writeAll(rows.filter((r) => !ids.has(r.id)))
}

export async function markSynced(ids: Set<string>): Promise<void> {
  const rows = await readAll()
  await writeAll(
    rows.map((r) => (ids.has(r.id) ? { ...r, synced: true } : r)),
  )
}
