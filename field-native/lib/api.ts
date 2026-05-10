import { getApiBaseUrl } from './config'
import type { CandidateParty, FieldContext, UserPayload } from './types'

async function parseJson(res: Response) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { _parseError: true, raw: text }
  }
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const base = getApiBaseUrl()
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(opts.headers)
  if (!headers.has('Content-Type') && opts.body && typeof opts.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`)

  const { token, ...rest } = opts
  const res = await fetch(url, { ...rest, headers })
  const data = await parseJson(res)
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${res.status})`
    throw new ApiError(msg, res.status, data)
  }
  return data as T
}

export function loginRequest(identifier: string, password: string) {
  return apiFetch<{ token: string; user: UserPayload }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: identifier, password }),
  })
}

export function meRequest(token: string) {
  return apiFetch<{ user: UserPayload }>('/api/auth/me', { token })
}

export function fieldContextRequest(token: string) {
  return apiFetch<FieldContext>('/api/field/context', { token })
}

export function candidatePartiesRequest(token: string, slug: string) {
  const s = encodeURIComponent(slug)
  return apiFetch<{ parties: CandidateParty[] }>(`/api/field/elections/${s}/candidate-parties`, { token })
}

export function submitVotesRequest(token: string, slug: string, votes: { partyId: string; votes: number }[]) {
  const s = encodeURIComponent(slug)
  return apiFetch<{ ok?: boolean }>(`/api/field/elections/${s}/votes`, {
    method: 'POST',
    token,
    body: JSON.stringify({ votes }),
  })
}

export function onboardingRequest(
  token: string,
  body: {
    fullName: string
    serviceNumber: string
    phone: string
    pictureDataUrl: string
    livenessVerified: boolean
    livenessCheckedAt: string
    newPassword?: string
    confirmPassword?: string
  },
) {
  return apiFetch<{ user: UserPayload }>('/api/me/onboarding', {
    method: 'PUT',
    token,
    body: JSON.stringify(body),
  })
}

export function syncFieldBatch(
  token: string,
  items: Array<{
    clientId: string
    kind: string
    payload: Record<string, unknown>
    createdAt: string
  }>,
) {
  return apiFetch<{ ok: boolean; results: Array<{ clientId: string; ok: boolean; error?: string }> }>(
    '/api/field/sync',
    {
      method: 'POST',
      token,
      body: JSON.stringify({ items }),
    },
  )
}
