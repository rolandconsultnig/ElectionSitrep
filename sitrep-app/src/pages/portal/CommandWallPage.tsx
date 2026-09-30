import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { apiJson } from '../../lib/api'
import { formatCountdown, playAlarm, postJson, type Severity } from '../../lib/incidents'
import { useSocket } from '../../contexts/SocketContext'
import { useAuth } from '../../contexts/AuthContext'
import { firstNavPath } from '../../lib/navigation'

type Brief = {
  id: string
  type: string
  severity: Severity
  isFlash: boolean
  status?: string
  level: string
  levelLabel: string
  location: string
  createdAt: string
  slaDueAt: string | null
}

type WallFocus = { stateId: number | null; stateName: string | null; setBy: string | null; setAt: string | null }

type WallData = {
  serverTime: string
  scope: string
  focus: WallFocus
  states: { id: number; name: string; lat: number; lng: number }[]
  counters: {
    open: number
    acknowledged: number
    activeFlash: number
    overdue: number
    critical: number
    high: number
    last24h: number
    prev24h: number
    resolved24h: number
    activeSos: number
    missedCheckins: number
    officersTracked: number
    officersLive: number
  }
  takeover: {
    flash: Brief[]
    sos: {
      id: string
      kind: string
      officer: string
      serviceNumber: string | null
      location: string
      lat: number | null
      lng: number | null
      lastFixAt: string | null
      startedAt: string
    }[]
  }
  ticker: Brief[]
  escalations: { byLevel: Record<string, { open: number; overdue: number }>; items: Brief[] }
  map: {
    incidents: { id: string; severity: Severity; isFlash: boolean; type: string; lga: string | null; lat: number; lng: number }[]
    officers: { lat: number; lng: number; status: 'sos' | 'missed' | 'stale' | 'ok' }[]
    states: { stateId: number; name: string; lat: number; lng: number; openWeight: number }[]
  }
  heat: { stateId: number; state: string; h6: number; h12: number; h24: number; trend: 'up' | 'down' | 'flat' }[]
  hotspots: { lga: string; state: string; weight: number; count: number; critical: number }[]
  mix: { label: string; n: number }[]
  safety: {
    devicesAtRisk: { officer: string; location: string; batteryPct: number | null; network: string | null; telemetryAt: string }[]
  }
  response: {
    medianAckSeconds: number | null
    medianResolveSeconds: number | null
    byState: { state: string; count: number; ackSeconds: number | null; resolveSeconds: number | null }[]
  }
}

const SEV_COLOR: Record<Severity, string> = { critical: '#dc2626', high: '#f97316', medium: '#facc15', low: '#94a3b8' }
const OFFICER_COLOR = { sos: '#dc2626', missed: '#f97316', stale: '#64748b', ok: '#22c55e' }
const LEVELS = [
  ['dpo', 'DPO'],
  ['area', 'Area Command'],
  ['state', 'State Command'],
  ['fhq', 'Force HQ'],
] as const
const PANELS = ['Escalations', 'Threat heat', 'Hotspot LGAs', 'Incident mix', 'Officer safety', 'Response times'] as const
const ROTATE_MS = 20_000
const STALE_MS = 45_000
const NIGERIA: [number, number] = [9.08, 8.68]

function ago(iso: string, now: number) {
  const sec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ago`
}

function dur(s: number | null) {
  if (s === null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function stateRiskColor(w: number) {
  if (w >= 16) return '#dc2626'
  if (w >= 6) return '#f59e0b'
  return '#22c55e'
}

function MapFocus({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])
  return null
}

function Tile({ label, value, alert, sub }: { label: string; value: number | string; alert?: boolean; sub?: string }) {
  return (
    <div
      className={`flex flex-col justify-center rounded-lg border px-4 py-2 ${
        alert ? 'animate-pulse border-red-500 bg-red-600/30' : 'border-slate-700 bg-slate-900/80'
      }`}
    >
      <div className="text-[clamp(10px,0.8vw,15px)] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-[clamp(22px,2.4vw,48px)] font-black leading-tight tabular-nums ${alert ? 'text-red-200' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-[clamp(10px,0.75vw,14px)] text-slate-400">{sub}</div>}
    </div>
  )
}

function SevDot({ s }: { s: Severity }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: SEV_COLOR[s] }} />
}

function Panel({ index, data, now }: { index: number; data: WallData; now: number }) {
  const row = 'flex items-center gap-3 border-b border-slate-800 py-2 text-[clamp(13px,1vw,20px)]'
  const empty = <div className="py-10 text-center text-[clamp(14px,1.1vw,22px)] text-slate-500">Nothing to report</div>
  switch (PANELS[index]) {
    case 'Escalations':
      return (
        <div>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {LEVELS.map(([k, label]) => {
              const b = data.escalations.byLevel[k]
              return (
                <div key={k} className={`rounded border p-2 text-center ${b?.overdue ? 'border-red-500 bg-red-900/40' : 'border-slate-700'}`}>
                  <div className="text-[clamp(10px,0.75vw,14px)] uppercase text-slate-400">{label}</div>
                  <div className="text-[clamp(20px,1.8vw,36px)] font-black tabular-nums">{b?.open ?? 0}</div>
                  <div className="text-[clamp(10px,0.75vw,14px)] text-red-300">{b?.overdue ?? 0} overdue</div>
                </div>
              )
            })}
          </div>
          {data.escalations.items.length === 0
            ? empty
            : data.escalations.items.map((i) => {
                const left = formatCountdown(i.slaDueAt, now)
                const overdue = !i.slaDueAt || left.startsWith('-')
                return (
                  <div key={i.id} className={row}>
                    <SevDot s={i.severity} />
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {i.isFlash && <span className="mr-2 rounded bg-red-600 px-1.5 text-white">FLASH</span>}
                      {i.type} — {i.location}
                    </span>
                    <span className="text-slate-400">{i.levelLabel}</span>
                    <span className={`w-24 text-right font-mono font-bold ${overdue ? 'text-red-400' : 'text-amber-300'}`}>
                      {i.slaDueAt ? left : 'BREACH'}
                    </span>
                  </div>
                )
              })}
        </div>
      )
    case 'Threat heat': {
      const max = Math.max(1, ...data.heat.map((h) => h.h24))
      return data.heat.length === 0 ? (
        empty
      ) : (
        <div>
          <div className={`${row} text-slate-400`}>
            <span className="flex-1">State</span>
            <span className="w-14 text-right">6h</span>
            <span className="w-14 text-right">12h</span>
            <span className="w-14 text-right">24h</span>
            <span className="w-10" />
          </div>
          {data.heat.slice(0, 14).map((h) => (
            <div key={h.stateId} className={row}>
              <span className="relative flex-1 font-semibold">
                <span className="absolute inset-y-0 left-0 rounded bg-red-600/25" style={{ width: `${(h.h24 / max) * 100}%` }} />
                <span className="relative pl-2">{h.state}</span>
              </span>
              <span className="w-14 text-right tabular-nums">{h.h6}</span>
              <span className="w-14 text-right tabular-nums">{h.h12}</span>
              <span className="w-14 text-right font-bold tabular-nums">{h.h24}</span>
              <span className={`w-10 text-center text-xl ${h.trend === 'up' ? 'text-red-400' : h.trend === 'down' ? 'text-green-400' : 'text-slate-500'}`}>
                {h.trend === 'up' ? '▲' : h.trend === 'down' ? '▼' : '▬'}
              </span>
            </div>
          ))}
        </div>
      )
    }
    case 'Hotspot LGAs':
      return data.hotspots.length === 0 ? (
        empty
      ) : (
        <div>
          <div className="mb-2 text-[clamp(11px,0.8vw,15px)] text-slate-400">Severity-weighted, last 2 hours</div>
          {data.hotspots.map((h, i) => (
            <div key={`${h.lga}${h.state}`} className={row}>
              <span className="w-8 text-right text-[clamp(16px,1.3vw,26px)] font-black text-slate-500">{i + 1}</span>
              <span className="flex-1 font-semibold">
                {h.lga}, <span className="text-slate-400">{h.state}</span>
              </span>
              <span className="tabular-nums">{h.count} incidents</span>
              {h.critical > 0 && <span className="rounded bg-red-600 px-2 font-bold">{h.critical} critical</span>}
              <span className="w-16 text-right font-mono text-amber-300">{h.weight}</span>
            </div>
          ))}
        </div>
      )
    case 'Incident mix': {
      const max = Math.max(1, ...data.mix.map((m) => m.n))
      return data.mix.length === 0 ? (
        empty
      ) : (
        <div>
          <div className="mb-2 text-[clamp(11px,0.8vw,15px)] text-slate-400">Today (WAT)</div>
          {data.mix.map((m) => (
            <div key={m.label} className="flex items-center gap-3 py-1.5 text-[clamp(13px,1vw,20px)]">
              <span className="w-[40%] truncate">{m.label}</span>
              <span className="h-6 flex-1 rounded bg-slate-800">
                <span className="block h-full rounded bg-sky-500" style={{ width: `${(m.n / max) * 100}%` }} />
              </span>
              <span className="w-12 text-right font-bold tabular-nums">{m.n}</span>
            </div>
          ))}
        </div>
      )
    }
    case 'Officer safety':
      return (
        <div>
          <div className="mb-1 font-bold uppercase text-red-300">Active SOS / duress</div>
          {data.takeover.sos.length === 0 && <div className="py-2 text-slate-500">None</div>}
          {data.takeover.sos.map((s) => (
            <div key={s.id} className={row}>
              <span className="rounded bg-red-600 px-2 font-bold uppercase">{s.kind === 'duress' ? 'DURESS' : 'SOS'}</span>
              <span className="flex-1 font-semibold">
                {s.officer}
                {s.serviceNumber ? ` · ${s.serviceNumber}` : ''}
              </span>
              <span className="text-slate-400">{s.location}</span>
              <span className="w-40 text-right font-mono text-slate-300">
                {s.lat !== null && s.lng !== null ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : 'no GPS fix'}
              </span>
            </div>
          ))}
          <div className="mb-1 mt-4 font-bold uppercase text-amber-300">Devices about to go dark</div>
          {data.safety.devicesAtRisk.length === 0 && <div className="py-2 text-slate-500">None</div>}
          {data.safety.devicesAtRisk.map((d, i) => (
            <div key={i} className={row}>
              <span className="flex-1 font-semibold">{d.officer}</span>
              <span className="text-slate-400">{d.location}</span>
              <span className={`w-16 text-right font-bold ${d.batteryPct !== null && d.batteryPct < 20 ? 'text-red-400' : ''}`}>
                {d.batteryPct === null ? '—' : `${d.batteryPct}%`}
              </span>
              <span className="w-20 text-right text-slate-300">{d.network ?? '—'}</span>
              <span className="w-28 text-right text-slate-400">{ago(d.telemetryAt, now)}</span>
            </div>
          ))}
        </div>
      )
    case 'Response times':
      return (
        <div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Tile label="Median time to acknowledge (24h)" value={dur(data.response.medianAckSeconds)} />
            <Tile label="Median time to resolve (24h)" value={dur(data.response.medianResolveSeconds)} />
          </div>
          {data.response.byState.length === 0 ? (
            empty
          ) : (
            <>
              <div className={`${row} text-slate-400`}>
                <span className="flex-1">State</span>
                <span className="w-20 text-right">Incidents</span>
                <span className="w-28 text-right">Ack</span>
                <span className="w-28 text-right">Resolve</span>
              </div>
              {data.response.byState.map((s) => (
                <div key={s.state} className={row}>
                  <span className="flex-1 font-semibold">{s.state}</span>
                  <span className="w-20 text-right tabular-nums">{s.count}</span>
                  <span className="w-28 text-right tabular-nums">{dur(s.ackSeconds)}</span>
                  <span className="w-28 text-right tabular-nums">{dur(s.resolveSeconds)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )
  }
}

export function CommandWallPage() {
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const qc = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const [panel, setPanel] = useState(0)
  const [paused, setPaused] = useState(false)
  const [sound, setSound] = useState(false)

  const q = useQuery({
    queryKey: ['wall'],
    queryFn: () => apiJson<WallData>('/api/wall'),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    retry: true,
  })
  const data = q.data

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setPanel((p) => (p + 1) % PANELS.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [paused])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (e.key === 'ArrowRight') setPanel((p) => (p + 1) % PANELS.length)
      else if (e.key === 'ArrowLeft') setPanel((p) => (p + PANELS.length - 1) % PANELS.length)
      else if (e.key === 'f') void document.documentElement.requestFullscreen?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ['wall'] }), [qc])

  useEffect(() => {
    if (!socket) return
    const onIncident = (p: { isFlash?: boolean; severity?: Severity }) => {
      if (sound && (p?.isFlash || p?.severity === 'critical')) playAlarm(p.isFlash ? 'flash' : 'alert')
      refresh()
    }
    const onSos = () => {
      if (sound) playAlarm('sos')
      refresh()
    }
    const events = ['incident_updated', 'sos_resolved', 'sos_location', 'checkin_missed', 'wall_focus']
    socket.on('incident_alert', onIncident)
    socket.on('sos_alert', onSos)
    events.forEach((e) => socket.on(e, refresh))
    return () => {
      socket.off('incident_alert', onIncident)
      socket.off('sos_alert', onSos)
      events.forEach((e) => socket.off(e, refresh))
    }
  }, [socket, sound, refresh])

  const focusState = data?.focus.stateId ? data.states.find((s) => s.id === data.focus.stateId) : undefined
  const mapCenter = useMemo<[number, number]>(
    () => (focusState ? [focusState.lat, focusState.lng] : NIGERIA),
    [focusState],
  )

  const setFocus = async (stateId: string) => {
    try {
      await postJson('/api/wall/focus', { stateId: stateId ? Number(stateId) : null }, 'PUT')
      refresh()
    } catch {
      /* server enforces who may set focus */
    }
  }

  const stale = !data || q.isError || now - q.dataUpdatedAt > STALE_MS
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now)
  const c = data?.counters
  const change = c ? c.last24h - c.prev24h : 0
  const takeover = data ? [...data.takeover.sos.map((s) => ({ kind: 'sos' as const, s })), ...data.takeover.flash.map((f) => ({ kind: 'flash' as const, f }))] : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col gap-2 overflow-hidden bg-[#050b16] p-3 text-slate-100">
      <style>{`
        .wall-tiles { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9); }
        @keyframes wall-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .wall-ticker { animation: wall-ticker 60s linear infinite; }
      `}</style>

      <header className="flex items-center gap-4">
        <img src="/police.png" alt="NPF" className="h-[clamp(36px,3.5vw,72px)] w-auto" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[clamp(16px,1.6vw,32px)] font-black tracking-wide">NIGERIA POLICE FORCE — IGP SITUATION ROOM</div>
          <div className="text-[clamp(11px,0.9vw,18px)] text-slate-400">
            {data?.focus.stateId ? (
              <span className="rounded bg-sky-600 px-2 font-bold text-white">FOCUS: {data.focus.stateName}</span>
            ) : (
              'National picture'
            )}{' '}
            · Election incident, SOS and officer-safety feed
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[clamp(18px,1.8vw,36px)] font-bold tabular-nums">{clock}</div>
          <div className="text-[clamp(10px,0.8vw,15px)] text-slate-400">
            WAT · <span className={connected ? 'text-green-400' : 'text-red-400'}>{connected ? 'LIVE' : 'RECONNECTING'}</span>
            {q.dataUpdatedAt ? ` · updated ${ago(new Date(q.dataUpdatedAt).toISOString(), now)}` : ''}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex gap-1">
            <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" onClick={() => setSound((s) => !s)}>
              {sound ? 'Sound on' : 'Enable sound'}
            </button>
            <button className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800" onClick={() => void document.documentElement.requestFullscreen?.()}>
              Full screen
            </button>
            <Link to={user ? firstNavPath(user.portalId) : '/'} className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">
              Exit
            </Link>
          </div>
          {data?.scope === 'national' || data?.focus.stateId ? (
            <select
              className="rounded border border-slate-600 bg-slate-900 px-2 py-1"
              value={data?.focus.stateId ?? ''}
              onChange={(e) => void setFocus(e.target.value)}
              aria-label="Wall focus"
            >
              <option value="">Focus: National</option>
              {data?.states.map((s) => (
                <option key={s.id} value={s.id}>
                  Focus: {s.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      {stale && (
        <div className="rounded bg-amber-500 px-3 py-1 text-center text-[clamp(12px,1vw,20px)] font-bold text-black">
          {data ? `DATA FEED STALLED — last good update ${ago(new Date(q.dataUpdatedAt).toISOString(), now)}. Retrying…` : 'Connecting to situation feed…'}
        </div>
      )}

      {c && (
        <div className="grid grid-cols-8 gap-2">
          <Tile label="Open incidents" value={c.open} sub={`${c.acknowledged} acknowledged`} />
          <Tile label="Active FLASH" value={c.activeFlash} alert={c.activeFlash > 0} />
          <Tile label="Overdue (SLA)" value={c.overdue} alert={c.overdue > 0} />
          <Tile label="Critical / high" value={`${c.critical} / ${c.high}`} alert={c.critical > 0} />
          <Tile label="Officer SOS" value={c.activeSos} alert={c.activeSos > 0} />
          <Tile label="Missed check-ins" value={c.missedCheckins} alert={c.missedCheckins > 0} />
          <Tile label="Officers live" value={`${c.officersLive} / ${c.officersTracked}`} sub="telemetry < 30 min" />
          <Tile
            label="Incidents 24h"
            value={c.last24h}
            sub={`${change > 0 ? '▲' : change < 0 ? '▼' : '▬'} ${Math.abs(change)} vs prior 24h · ${c.resolved24h} resolved`}
          />
        </div>
      )}

      {takeover.length > 0 && (
        <div className="animate-pulse rounded-lg border-2 border-red-400 bg-red-700 px-4 py-2">
          {takeover.slice(0, 3).map((t) =>
            t.kind === 'sos' ? (
              <div key={`s${t.s.id}`} className="flex items-center gap-4 text-[clamp(14px,1.4vw,28px)] font-black">
                <span className="rounded bg-white px-2 text-red-700">{t.s.kind === 'duress' ? 'DURESS' : 'OFFICER SOS'}</span>
                <span className="flex-1 truncate">
                  {t.s.officer} — {t.s.location}
                </span>
                <span className="font-mono">{ago(t.s.startedAt, now)}</span>
              </div>
            ) : (
              <div key={`f${t.f.id}`} className="flex items-center gap-4 text-[clamp(14px,1.4vw,28px)] font-black">
                <span className="rounded bg-white px-2 text-red-700">FLASH</span>
                <span className="flex-1 truncate">
                  {t.f.type} — {t.f.location}
                </span>
                <span>{t.f.levelLabel}</span>
                <span className="font-mono">{ago(t.f.createdAt, now)} · awaiting acknowledgement</span>
              </div>
            ),
          )}
          {takeover.length > 3 && <div className="text-sm font-bold">+{takeover.length - 3} more active alerts</div>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
        <div className="relative overflow-hidden rounded-lg border border-slate-700">
          <MapContainer center={NIGERIA} zoom={6} zoomControl={false} attributionControl={false} className="h-full w-full bg-[#0b1220]">
            <MapFocus center={mapCenter} zoom={focusState ? 8 : 6} />
            <TileLayer className="wall-tiles" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {data?.map.states.map((s) => (
              <CircleMarker
                key={`st${s.stateId}`}
                center={[s.lat, s.lng]}
                radius={28}
                pathOptions={{ color: stateRiskColor(s.openWeight), weight: 2, fillOpacity: 0.12 }}
              >
                <Tooltip permanent direction="center" className="!border-0 !bg-transparent !text-xs !font-bold !text-white !shadow-none">
                  {s.name}
                </Tooltip>
              </CircleMarker>
            ))}
            {data?.map.officers.map((o, i) => (
              <CircleMarker key={`o${i}`} center={[o.lat, o.lng]} radius={4} pathOptions={{ color: OFFICER_COLOR[o.status], fillOpacity: 0.9, weight: 1 }} />
            ))}
            {data?.map.incidents.map((m) => (
              <CircleMarker
                key={`i${m.id}`}
                center={[m.lat, m.lng]}
                radius={m.isFlash ? 12 : m.severity === 'critical' ? 10 : 7}
                className={m.isFlash || m.severity === 'critical' ? 'animate-pulse' : undefined}
                pathOptions={{ color: SEV_COLOR[m.severity], fillOpacity: 0.75, weight: m.isFlash ? 4 : 2 }}
              >
                <Tooltip>
                  {m.type}
                  {m.lga ? ` — ${m.lga}` : ''}
                </Tooltip>
              </CircleMarker>
            ))}
            {data?.takeover.sos
              .filter((s) => s.lat !== null && s.lng !== null)
              .map((s) => (
                <CircleMarker key={`sos${s.id}`} center={[s.lat as number, s.lng as number]} radius={14} className="animate-pulse" pathOptions={{ color: '#ffffff', fillColor: '#dc2626', fillOpacity: 1, weight: 3 }}>
                  <Tooltip permanent>SOS · {s.officer}</Tooltip>
                </CircleMarker>
              ))}
          </MapContainer>
          <div className="absolute bottom-2 left-2 z-[1000] rounded bg-black/70 px-3 py-2 text-[clamp(10px,0.8vw,15px)]">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(SEV_COLOR) as Severity[]).map((s) => (
                <span key={s} className="flex items-center gap-1 capitalize">
                  <SevDot s={s} /> {s}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> officer OK
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> missed check-in
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> device dark
              </span>
            </div>
            <div className="mt-1 text-slate-400">Rings: state risk (open incidents, severity-weighted) · last 24h</div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border border-slate-700 bg-slate-950/70 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex-1 text-[clamp(16px,1.4vw,28px)] font-black uppercase tracking-wide">{PANELS[panel]}</div>
            <div className="flex gap-1">
              {PANELS.map((p, i) => (
                <button
                  key={p}
                  title={p}
                  onClick={() => setPanel(i)}
                  className={`h-2.5 w-6 rounded ${i === panel ? 'bg-sky-400' : 'bg-slate-700'}`}
                />
              ))}
            </div>
            <button className="rounded border border-slate-600 px-2 text-xs" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{data && <Panel index={panel} data={data} now={now} />}</div>
        </div>
      </div>

      <div className="flex h-[clamp(32px,2.6vw,52px)] items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
        <div className="z-10 flex h-full items-center bg-red-700 px-4 text-[clamp(12px,1vw,20px)] font-black">LIVE</div>
        <div className="min-w-0 flex-1 overflow-hidden">
          {data && data.ticker.length > 0 ? (
            <div className="wall-ticker flex w-max whitespace-nowrap">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex">
                  {data.ticker.map((t) => (
                    <span key={`${dup}-${t.id}`} className="mx-6 flex items-center gap-2 text-[clamp(13px,1.1vw,22px)]">
                      <SevDot s={t.severity} />
                      {t.isFlash && <b className="text-red-400">FLASH</b>}
                      <b>{t.type}</b> — {t.location} · {ago(t.createdAt, now)} · {t.levelLabel}
                      {t.status === 'open' && t.slaDueAt && <span className="font-mono text-amber-300"> · {formatCountdown(t.slaDueAt, now)}</span>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 text-slate-500">No critical or high incidents open</div>
          )}
        </div>
      </div>
    </div>
  )
}
