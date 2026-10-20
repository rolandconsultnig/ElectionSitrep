import NetInfo from '@react-native-community/netinfo'
import { enqueueFieldBatch, listPending, type FieldBatchKind } from './pending-queue'
import { flushPendingVoteSync } from './sync-pending'

export type SubmitOutcome = 'delivered' | 'queued'

/**
 * Enqueue a field batch item locally (offline-first), then attempt an immediate
 * flush when the network is up. Delivery is confirmed only if the server
 * accepted this specific clientId — otherwise it stays queued for background sync.
 */
export async function submitOrQueue(
  token: string,
  kind: FieldBatchKind,
  payload: Record<string, unknown>,
): Promise<SubmitOutcome> {
  const clientId = await enqueueFieldBatch(kind, payload)
  try {
    const net = await NetInfo.fetch()
    if (!net.isConnected) return 'queued'
    await flushPendingVoteSync(token)
    const remaining = await listPending()
    return remaining.some((x) => x.clientId === clientId) ? 'queued' : 'delivered'
  } catch {
    return 'queued'
  }
}
