import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'
import { currentPosition, postJson, type SafetyStatus } from '../../lib/incidents'

const card = 'sr-card p-5'

type BatteryManagerLike = { level: number }
type NavigatorExtras = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>
  connection?: { effectiveType?: string }
}

async function deviceTelemetry(): Promise<{ batteryPct?: number; network?: string }> {
  const nav = navigator as NavigatorExtras
  const out: { batteryPct?: number; network?: string } = {}
  try {
    if (nav.getBattery) out.batteryPct = Math.round((await nav.getBattery()).level * 100)
  } catch {
    /* unsupported */
  }
  out.network = nav.onLine ? nav.connection?.effectiveType || 'online' : 'offline'
  return out
}

export function FieldSafetyPage() {
  const qc = useQueryClient()
  const statusQ = useQuery({
    queryKey: ['safety-checkin'],
    queryFn: () => apiJson<SafetyStatus>('/api/safety/checkin'),
    refetchInterval: 60_000,
  })
  const sosQ = useQuery({
    queryKey: ['sos-mine'],
    queryFn: () => apiJson<{ activeId: number | null }>('/api/sos/mine'),
  })
  const pinQ = useQuery({ queryKey: ['duress-pin'], queryFn: () => apiJson<{ enabled: boolean }>('/api/me/duress-pin') })
  const [msg, setMsg] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [holding, setHolding] = useState(0)
  const holdTimer = useRef<number | null>(null)
  const activeSosId = sosQ.data?.activeId ?? null

  useEffect(() => {
    if (!activeSosId || !navigator.geolocation) return
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        void postJson(`/api/sos/${activeSosId}/location`, {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }).catch(() => undefined)
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [activeSosId])

  async function checkIn() {
    const [pos, tel] = await Promise.all([currentPosition(), deviceTelemetry()])
    await postJson('/api/safety/checkin', { lat: pos?.lat, lng: pos?.lng, ...tel })
    setMsg('Check-in recorded. Stay safe.')
    void qc.invalidateQueries({ queryKey: ['safety-checkin'] })
  }

  async function sendSos() {
    const pos = await currentPosition()
    await postJson('/api/sos', { kind: 'panic', lat: pos?.lat, lng: pos?.lng, accuracy: pos?.accuracy })
    setMsg('SOS sent silently. Command can see your live location.')
    void qc.invalidateQueries({ queryKey: ['sos-mine'] })
  }

  function startHold() {
    const started = Date.now()
    holdTimer.current = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / 2000) * 100)
      setHolding(pct)
      if (pct >= 100) {
        stopHold()
        void sendSos().catch((e: Error) => setMsg(e.message))
      }
    }, 50)
  }
  function stopHold() {
    if (holdTimer.current) window.clearInterval(holdTimer.current)
    holdTimer.current = null
    setHolding(0)
  }

  async function savePin(clear: boolean) {
    try {
      await postJson('/api/me/duress-pin', { pin: clear ? null : pin }, 'PUT')
      setPin('')
      setMsg(clear ? 'Duress PIN removed.' : 'Duress PIN saved.')
      void qc.invalidateQueries({ queryKey: ['duress-pin'] })
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  const st = statusQ.data
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Officer safety</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Panic button, scheduled check-ins and duress PIN.</p>
      </header>
      {msg && <p className="rounded-lg border border-[color:var(--portal-border)] px-4 py-2 text-sm text-[var(--portal-fg)]">{msg}</p>}

      <div className={card}>
        <h2 className="font-semibold text-[var(--portal-fg)]">Panic / SOS</h2>
        <p className="mt-1 text-xs text-[var(--portal-muted)]">Press and hold for 2 seconds. Sends a silent alert with your live GPS.</p>
        {activeSosId ? (
          <p className="mt-4 text-sm font-semibold text-red-500">SOS active — sharing live location with command.</p>
        ) : (
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            className="relative mt-4 size-36 overflow-hidden rounded-full bg-red-700 text-xl font-extrabold text-white shadow-xl shadow-red-900/50 select-none"
          >
            <span className="absolute inset-x-0 bottom-0 bg-red-400/60" style={{ height: `${holding}%` }} />
            <span className="relative">SOS</span>
          </button>
        )}
      </div>

      <div className={card}>
        <h2 className="font-semibold text-[var(--portal-fg)]">Safety check-in</h2>
        <p className="mt-1 text-xs text-[var(--portal-muted)]">
          Every {st?.intervalMinutes ?? 60} min. Missed check-ins are flagged to command.
          {st?.nextDueAt ? ` Next due ${new Date(st.nextDueAt).toLocaleTimeString()}.` : ''}
        </p>
        {st?.missed && <p className="mt-2 text-sm font-semibold text-amber-500">You missed a check-in — confirm now.</p>}
        <button type="button" onClick={() => void checkIn().catch((e: Error) => setMsg(e.message))} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
          I'm OK — check in
        </button>
      </div>

      <div className={card}>
        <h2 className="font-semibold text-[var(--portal-fg)]">Duress PIN</h2>
        <p className="mt-1 text-xs text-[var(--portal-muted)]">
          If forced to sign in, use this PIN as your password. The app opens normally while command is silently alerted.
          Status: {pinQ.data?.enabled ? 'set' : 'not set'}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="At least 6 characters"
            className="rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          />
          <button type="button" disabled={pin.length < 6} onClick={() => void savePin(false)} className="sr-btn-ghost px-3 py-2 text-xs disabled:opacity-50">
            Save
          </button>
          {pinQ.data?.enabled && (
            <button type="button" onClick={() => void savePin(true)} className="sr-btn-ghost px-3 py-2 text-xs">
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
