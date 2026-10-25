import { apiFetch, ApiError } from './api'
import { enqueueRequest, countQueuedRequests } from './offline-queue'
import NetInfo from '@react-native-community/netinfo'

/**
 * Try a live API request first. If the network is down or the request fails
 * due to connectivity, queue it locally for auto-flush when back online.
 *
 * Returns 'delivered' when the server accepted it, or 'queued' when it was
 * stored locally. Throws only for non-connectivity errors (e.g. validation)
 * so the caller can show a real error to the officer.
 */
export async function submitWithOffline<T = unknown>(
  token: string,
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  body: unknown,
  label: string,
): Promise<{ outcome: 'delivered' | 'queued'; data?: T }> {
  const net = await NetInfo.fetch()
  if (!net.isConnected) {
    await enqueueRequest(method, path, body, label)
    return { outcome: 'queued' }
  }
  try {
    const data = await apiFetch<T>(path, { method, token, body: body ? JSON.stringify(body) : undefined })
    return { outcome: 'delivered', data }
  } catch (e) {
    // Connectivity-related failures → queue. Validation/business errors → throw.
    if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 408)) {
      await enqueueRequest(method, path, body, label)
      return { outcome: 'queued' }
    }
    throw e
  }
}

export async function getQueuedCount(): Promise<number> {
  return countQueuedRequests()
}
