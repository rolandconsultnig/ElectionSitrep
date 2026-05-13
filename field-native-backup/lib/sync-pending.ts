import { syncFieldBatch } from './api'
import { dequeueClientIds, listPending, type PendingVoteItem } from './pending-queue'

export async function flushPendingVoteSync(token: string): Promise<{ flushed: number; errors: string[] }> {
  const pending = await listPending()
  const voteItems = pending.filter((p): p is PendingVoteItem => p.kind === 'vote_tally')
  if (!voteItems.length) return { flushed: 0, errors: [] }

  const errors: string[] = []
  try {
    const res = await syncFieldBatch(
      token,
      voteItems.map((v) => ({
        clientId: v.clientId,
        kind: 'vote_tally',
        payload: {
          electionSlug: v.payload.electionSlug,
          votes: v.payload.votes,
        },
        createdAt: v.createdAt,
      })),
    )
    const okIds = new Set<string>()
    for (const r of res.results || []) {
      if (r.ok) okIds.add(r.clientId)
      else if (r.error) errors.push(`${r.clientId}: ${r.error}`)
    }
    await dequeueClientIds(okIds)
    return { flushed: okIds.size, errors }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Sync failed')
    return { flushed: 0, errors }
  }
}
