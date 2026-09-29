import { apiFetch, apiJson } from './api'

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type EscalationLevel = 'dpo' | 'area' | 'state' | 'fhq'

export type IncidentType = { code: string; label: string; category: string; defaultSeverity: Severity }

export type Incident = {
  id: number
  typeCode: string
  typeLabel: string
  typeCategory: string
  severity: Severity
  isFlash: boolean
  title: string
  description: string
  details: Record<string, unknown>
  location: {
    stateId: number | null
    stateName: string | null
    lgaId: number | null
    lgaName: string | null
    wardId: number | null
    wardName: string | null
    puId: number | null
    puCode: string | null
    puName: string | null
    lat: number | null
    lng: number | null
  }
  status: 'open' | 'acknowledged' | 'resolved'
  escalationLevel: EscalationLevel
  escalationLabel: string
  slaDueAt: string | null
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  resolvedAt: string | null
  createdAt: string
  hasPhoto: boolean
  photoSha256: string | null
  reporter: { username: string; name: string | null; serviceNumber: string | null }
}

export type IncidentEvent = { action: string; note: string | null; at: string; by: string | null }

export type SosAlert = {
  id: number
  userId: string
  kind: 'panic' | 'duress'
  status: 'active' | 'resolved'
  note: string | null
  startedAt: string
  resolvedAt: string | null
  officer: { username: string; name: string | null; serviceNumber: string | null; phone: string | null }
  location: { stateName: string | null; lgaName: string | null; puCode: string | null; puName: string | null }
  trail: { lat: number; lng: number; accuracyM: number | null; at: string }[]
}

export type SafetyOfficer = {
  userId: string
  username: string
  name: string | null
  serviceNumber: string | null
  phone: string | null
  post: string | null
  lgaName: string | null
  stateName: string | null
  status: 'sos' | 'missed' | 'due' | 'ok' | 'not_started'
  lastOkAt: string | null
  nextDueAt: string | null
  lastLat: number | null
  lastLng: number | null
  batteryPct: number | null
  network: string | null
  telemetryAt: string | null
}

export type SafetyStatus = { intervalMinutes: number; lastOkAt: string | null; nextDueAt: string | null; missed: boolean }

export const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-400 text-black',
  low: 'bg-slate-500 text-white',
}

export function fetchIncidentTypes() {
  return apiJson<{ types: IncidentType[]; severities: Severity[]; slaMinutes: Record<Severity, number> }>(
    '/api/incident-types',
  )
}

export function postJson<T>(path: string, body: unknown, method = 'POST') {
  return apiJson<T>(path, { method, body: JSON.stringify(body) })
}

export async function fetchPhotoObjectUrl(path: string): Promise<string | null> {
  const res = await apiFetch(path)
  if (!res.ok) return null
  return URL.createObjectURL(await res.blob())
}

export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    ),
  )
}

export function formatCountdown(targetIso: string | null, now: number): string {
  if (!targetIso) return '—'
  const ms = new Date(targetIso).getTime() - now
  const neg = ms < 0
  const s = Math.floor(Math.abs(ms) / 1000)
  const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return neg ? `-${txt}` : txt
}

let audioCtx: AudioContext | null = null

/** Short two-tone alarm via WebAudio (no asset needed). */
export function playAlarm(kind: 'flash' | 'sos' | 'alert') {
  try {
    audioCtx = audioCtx ?? new AudioContext()
    const ctx = audioCtx
    const tones = kind === 'alert' ? [880] : [988, 740, 988, 740]
    tones.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = kind === 'sos' ? 'square' : 'sawtooth'
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.22
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.21)
    })
  } catch {
    /* audio blocked until user interaction */
  }
}
