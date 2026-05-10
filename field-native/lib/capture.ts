import * as Crypto from 'expo-crypto'
import { enqueue } from './offline-queue'
import type { QueueKind } from './offline-queue'
import { flushOfflineQueue } from './sync-engine'

/** Persist locally then attempt immediate sync when online. */
export async function captureOffline(kind: QueueKind, payload: Record<string, unknown>): Promise<string> {
  const id = Crypto.randomUUID()
  await enqueue({
    id,
    kind,
    createdAt: new Date().toISOString(),
    payload,
    synced: false,
  })
  await flushOfflineQueue()
  return id
}
