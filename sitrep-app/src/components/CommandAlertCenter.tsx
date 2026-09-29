import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../contexts/SocketContext'
import { playAlarm, type Incident } from '../lib/incidents'

type Toast = { key: string; tone: 'flash' | 'sos' | 'alert'; title: string; body: string }

/** Situation-room alerts: FLASH/critical incidents, SOS and missed check-ins, with an audible alarm. */
export function CommandAlertCenter({ basePath }: { basePath: string }) {
  const { socket } = useSocket()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    if (!socket) return
    const push = (t: Toast) => {
      playAlarm(t.tone)
      setToasts((prev) => [t, ...prev.filter((p) => p.key !== t.key)].slice(0, 5))
    }
    const onIncident = (i: Incident) =>
      push({
        key: `i${i.id}`,
        tone: i.isFlash ? 'flash' : 'alert',
        title: `${i.isFlash ? 'FLASH' : i.severity.toUpperCase()} · ${i.typeLabel}`,
        body: `${[i.location.puCode, i.location.lgaName, i.location.stateName].filter(Boolean).join(' · ') || 'Location pending'} → ${i.escalationLabel}`,
      })
    const onSos = (a: { id: number; kind: string; officer?: { name: string | null; username: string } }) =>
      push({
        key: `s${a.id}`,
        tone: 'sos',
        title: a.kind === 'duress' ? 'DURESS LOGIN' : 'OFFICER SOS',
        body: a.officer?.name || a.officer?.username || 'Field officer',
      })
    const onMissed = (m: { userId: string; name?: string | null; username?: string }) =>
      push({ key: `m${m.userId}`, tone: 'alert', title: 'Missed safety check-in', body: m.name || m.username || 'Field officer' })
    socket.on('incident_alert', onIncident)
    socket.on('sos_alert', onSos)
    socket.on('checkin_missed', onMissed)
    return () => {
      socket.off('incident_alert', onIncident)
      socket.off('sos_alert', onSos)
      socket.off('checkin_missed', onMissed)
    }
  }, [socket])

  if (!toasts.length) return null
  return (
    <div className="fixed right-4 bottom-4 z-[1000] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.key}
          className={`rounded-xl border p-3 shadow-2xl backdrop-blur ${
            t.tone === 'alert' ? 'border-amber-500/60 bg-amber-950/90' : 'animate-pulse border-red-500 bg-red-950/95'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => {
                navigate(`${basePath}/incident-command`)
                setToasts((prev) => prev.filter((p) => p.key !== t.key))
              }}
            >
              <div className="text-sm font-extrabold tracking-wide text-white">{t.title}</div>
              <div className="truncate text-xs text-white/80">{t.body}</div>
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-white/70"
              onClick={() => setToasts((prev) => prev.filter((p) => p.key !== t.key))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
