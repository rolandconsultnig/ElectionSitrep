import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'

const KEY = '@field_pending_vote_items'

export type PendingVoteItem = {
  clientId: string
  kind: 'vote_tally'
  payload: { electionSlug: string; votes: { partyId: string; votes: number }[] }
  createdAt: string
}

async function readAll(): Promise<PendingVoteItem[]> {
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

export async function enqueueVoteTally(slug: string, votes: { partyId: string; votes: number }[]) {
  const items = await readAll()
  const clientId = Crypto.randomUUID()
  items.push({
    clientId,
    kind: 'vote_tally',
    payload: { electionSlug: slug, votes },
    createdAt: new Date().toISOString(),
  })
  await writeAll(items)
  return clientId
}

export async function dequeueClientIds(ids: Set<string>) {
  const items = await readAll()
  const next = items.filter((x) => !ids.has(x.clientId))
  await writeAll(next)
}

export async function listPending(): Promise<PendingVoteItem[]> {
  return readAll()
}
