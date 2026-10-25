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
  if (!base) {
    throw new ApiError(
      'API base URL is not configured. Set a valid server URL in Network settings or provide EXPO_PUBLIC_API_BASE_URL / app.json extra.apiBaseUrl.',
      0,
    )
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(opts.headers)
  if (!headers.has('Content-Type') && opts.body && typeof opts.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`)

  const { token, ...rest } = opts
  // AbortController + setTimeout — AbortSignal.timeout() is not implemented
  // in Hermes/RN and throws, which read as "Cannot reach server" on device.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  const callerSignal = rest.signal
  const onCallerAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', onCallerAbort)
  }
  let res: Response
  try {
    res = await fetch(url, { ...rest, headers, signal: controller.signal })
  } catch (err) {
    const hint = `Cannot reach ${base}. In Network settings (*2435*009# on login): set the server's public IP and the API port (PM2/node, usually 5530 — not nginx 5535 unless the API listens there). AWS: inbound TCP rule on that port. Turn off HTTPS unless the API uses TLS.`
    throw new ApiError(hint, 0, err)
  } finally {
    clearTimeout(timer)
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
  }
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
    firstName?: string
    lastName?: string
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

/* ------------------------------ incident types ------------------------------ */

export type IncidentType = { code: string; label: string; defaultSeverity: string }

export function incidentTypesRequest(token: string) {
  return apiFetch<{ types: IncidentType[] }>('/api/incident-types', { token })
}

export type MyIncident = {
  id: number
  typeCode: string
  typeLabel: string
  severity: string
  isFlash: boolean
  title: string
  status: string
  createdAt: string | null
  location: { puCode: string | null; puName: string | null; stateName: string | null; lgaName: string | null }
}

export function myIncidentsRequest(token: string) {
  return apiFetch<{ incidents: MyIncident[] }>('/api/incidents/mine', { token })
}

/* --------------------------------- parties --------------------------------- */

export type PartyRef = {
  id: number
  inecRegisterCode: string
  name: string
  abbreviation: string
  status: string
  logoDataUrl: string | null
}

export function partiesRequest(token: string) {
  return apiFetch<{ parties: PartyRef[] }>('/api/parties', { token })
}

/* ------------------------------ operations: timeline ------------------------------ */

export type PuMilestone = {
  id: number
  milestone: string
  timestamp: string
  notes: string | null
  officer_name: string | null
}

export function puTimelineRequest(token: string, puId: number | string, electionSlug?: string) {
  const q = electionSlug ? `?electionSlug=${encodeURIComponent(electionSlug)}` : ''
  return apiFetch<{ milestones: PuMilestone[] }>(`/api/operations/timeline/pu/${puId}${q}`, { token })
}

export function logMilestoneRequest(
  token: string,
  body: { electionSlug?: string; pollingUnitId: number | string; milestone: string; notes?: string },
) {
  return apiFetch<{ ok: boolean }>('/api/operations/timeline/milestone', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

/* -------------------------------- operations: EC8A -------------------------------- */

export function submitEc8aRequest(
  token: string,
  body: {
    electionSlug?: string
    pollingUnitId: number | string
    registeredVoters: number
    accreditedVoters: number
    ballotPapersIssued: number
    ballotPapersUsed: number
    ballotPapersSpoiled: number
    ballotPapersRejected: number
    validVotes: number
    totalVotesCast: number
    partyVotes: Record<string, number>
    photoUrl?: string
    photoHashSha256?: string
    photoSource?: string
    lat?: number | null
    lng?: number | null
  },
) {
  return apiFetch<{ ok?: boolean; evidence?: unknown }>('/api/operations/results/ec8a', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

/* ------------------------------ operations: materials ------------------------------ */

export type MaterialItem = {
  id: number
  material_type: string
  serial_or_barcode: string
  status: string
  carrier_name: string | null
  tamper_seal_intact: boolean | null
  last_scanned_at: string | null
  pu_id: number | null
  pu_code: string | null
  pu_name: string | null
  ward_name: string | null
  lga_name: string | null
  notes: string | null
}

export function materialsRequest(token: string, electionSlug?: string) {
  const q = electionSlug ? `?electionSlug=${encodeURIComponent(electionSlug)}` : ''
  return apiFetch<{ materials: MaterialItem[] }>(`/api/operations/materials${q}`, { token })
}

export function registerMaterialRequest(
  token: string,
  body: {
    electionSlug?: string
    materialType: string
    serialOrBarcode: string
    pollingUnitId?: number | string | null
    status?: string
    carrierName?: string
    carrierPhone?: string
    tamperSealIntact?: boolean
    notes?: string
  },
) {
  return apiFetch<{ ok?: boolean; material?: unknown }>('/api/operations/materials', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export function scanMaterialRequest(
  token: string,
  body: {
    serialOrBarcode?: string
    materialId?: number
    status?: string
    tamperSealIntact?: boolean
    lat?: number | null
    lng?: number | null
    notes?: string
  },
) {
  return apiFetch<{ ok?: boolean }>('/api/operations/materials/scan', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

/* -------------------------------- operations: shifts -------------------------------- */

export type ShiftHandover = {
  id: number
  shift_name: string
  running_situation_log: string
  materials_status: string | null
  crowd_assessment: string | null
  handover_signed_at: string
  incoming_acknowledged_at: string | null
  incoming_officer_name: string | null
  outgoing_name: string | null
  incoming_name: string | null
  pu_code: string | null
  notes: string | null
}

export function shiftsRequest(token: string, puId?: number | string) {
  const q = puId ? `?puId=${puId}` : ''
  return apiFetch<{ shifts: ShiftHandover[] }>(`/api/operations/shifts${q}`, { token })
}

export function handoverShiftRequest(
  token: string,
  body: {
    electionSlug?: string
    pollingUnitId?: number | string | null
    shiftName: string
    incomingOfficerName?: string
    runningSituationLog: string
    materialsStatus?: string
    crowdAssessment?: string
    notes?: string
  },
) {
  return apiFetch<{ ok: boolean }>('/api/operations/shifts/handover', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export function acknowledgeShiftRequest(token: string, id: number) {
  return apiFetch<{ ok: boolean }>(`/api/operations/shifts/${id}/acknowledge`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  })
}

/* ------------------------------ operations: logistics ------------------------------ */

export type LogisticsRequest = {
  id: number
  category: string
  priority: string
  quantity_description: string
  status: string
  created_at: string
  pu_code: string | null
  ward_name: string | null
  lga_name: string | null
}

export function logisticsListRequest(token: string) {
  return apiFetch<{ requests: LogisticsRequest[] }>('/api/operations/logistics', { token })
}

export function createLogisticsRequest(
  token: string,
  body: {
    electionSlug?: string
    category: string
    priority: string
    quantityDescription: string
    pollingUnitId?: number | string | null
    lat?: number | null
    lng?: number | null
  },
) {
  return apiFetch<{ ok: boolean }>('/api/operations/logistics', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

/* ------------------------------------ safety ------------------------------------ */

export type SafetyStatus = {
  intervalMinutes: number
  lastOkAt: string | null
  nextDueAt: string | null
  missed: boolean
}

export function safetyStatusRequest(token: string) {
  return apiFetch<SafetyStatus>('/api/safety/checkin', { token })
}

export function safetyCheckinRequest(
  token: string,
  body: { lat?: number | null; lng?: number | null; batteryPct?: number | null; network?: string },
) {
  return apiFetch<SafetyStatus>('/api/safety/checkin', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export function mySosRequest(token: string) {
  return apiFetch<{ activeId: number | null }>('/api/sos/mine', { token })
}

export function raiseSosRequest(
  token: string,
  body: { kind: 'panic'; lat?: number | null; lng?: number | null; accuracy?: number | null; note?: string },
) {
  return apiFetch<{ id: number }>('/api/sos', { method: 'POST', token, body: JSON.stringify(body) })
}

export function sosLocationRequest(
  token: string,
  id: number,
  body: { lat: number; lng: number; accuracy?: number | null },
) {
  return apiFetch<{ ok: boolean; active: boolean }>(`/api/sos/${id}/location`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export function duressPinStatusRequest(token: string) {
  return apiFetch<{ enabled: boolean }>('/api/me/duress-pin', { token })
}

export function setDuressPinRequest(token: string, pin: string) {
  return apiFetch<{ ok: boolean; enabled: boolean }>('/api/me/duress-pin', {
    method: 'PUT',
    token,
    body: JSON.stringify({ pin }),
  })
}
