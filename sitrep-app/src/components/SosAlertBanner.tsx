import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../lib/api'

export type WallSos = {
  id: number
  userId: string
  kind: string
  startedAt: string
  displayName: string
  lastFix: { lat: number; lng: number; accuracy_m: number | null; recorded_at: string } | null
}

/** Polls the public wall feed for active SOS alerts (works with or without a portal login). */
export function useActiveSos(refetchInterval = 10_000) {
  const q = useQuery({
    queryKey: ['public-wall-live'],
    queryFn: () => apiJson<{ sos: WallSos[] }>('/api/public/situation-room/live'),
    refetchInterval,
    retry: 1,
  })
  return q.data?.sos ?? []
}

function elapsed(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${ss}`
}

/**
 * Pulsing red banner shown when any field officer has an active SOS.
 * `onSelect` (optional) centres the parent map on the officer's last fix.
 */
export function SosAlertBanner({
  alerts,
  onSelect,
}: {
  alerts: WallSos[]
  onSelect?: (alert: WallSos) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!alerts.length) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [alerts.length])

  if (!alerts.length) return null

  return (
    <div className="w-full animate-pulse border-b-2 border-red-500 bg-red-950/95 px-4 py-2.5" role="alert">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1">
        <span className="rounded bg-red-600 px-2 py-0.5 font-(--font-mono) text-[11px] font-black tracking-[0.25em] text-white">
          🆘 SOS ACTIVE
        </span>
        {alerts.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect?.(a)}
            className="flex items-center gap-2 rounded border border-red-400/40 bg-red-900/60 px-2.5 py-1 font-(--font-mono) text-[11px] text-red-100 transition hover:bg-red-800"
          >
            <span className="font-bold">{a.displayName}</span>
            <span className="text-red-300">{a.kind === 'duress' ? 'DURESS PIN' : 'PANIC'}</span>
            <span className="tabular-nums text-red-200">{elapsed(a.startedAt, now)}</span>
            {a.lastFix ? (
              <span className="text-red-300">📍 {a.lastFix.lat.toFixed(4)}, {a.lastFix.lng.toFixed(4)}</span>
            ) : (
              <span className="text-red-400">no fix</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
