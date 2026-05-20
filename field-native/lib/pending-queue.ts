import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'

const KEY = '@field_pending_items'

export type FieldBatchKind = 'vote_tally' | 'sitrep' | 'incident' | 'violence'

export type PendingFieldBatchItem = {
  clientId: string
  kind: FieldBatchKind
  payload: Record<string, unknown>
  createdAt: string
}

async function readAll(): Promise<PendingFieldBatchItem[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeAll(items: PendingVoteItem[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items))
}

export async function enqueueFieldBatch(kind: FieldBatchKind, payload: Record<string, unknown>) {
  const items = await readAll()
  const clientId = Crypto.randomUUID()
  items.push({
    clientId,
    kind,
    payload,
    createdAt: new Date().toISOString(),
  })
  await writeAll(items)
  return clientId
}

export async function enqueueVoteTally(slug: string, votes: { partyId: string; votes: number }[]) {
  return enqueueFieldBatch('vote_tally', { electionSlug: slug, votes })
}

export async function dequeueClientIds(ids: Set<string>) {
  const items = await readAll()
  const next = items.filter((x) => !ids.has(x.clientId))
  await writeAll(next)
}

export async function listPending(): Promise<PendingFieldBatchItem[]> {
  return readAll()
}
