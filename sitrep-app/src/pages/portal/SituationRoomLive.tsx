import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { apiJson } from '../../lib/api'
import { SosAlertBanner, type WallSos } from '../../components/SosAlertBanner'

type FieldOfficer = {
  userId: string
  displayName: string
  lat: number
  lng: number
  live: boolean
  locationSource: 'gps' | 'assigned_pu' | 'estimate'
  lastLocationAt: string | null
  batteryPct: number | null
  puCode: string | null
  puName: string | null
  clockedInAt: string | null
  clockInVerified: boolean | null
  clockInDistanceM: number | null
}

type WallPhoto = {
  id: string
  kind: string
  createdAt: string
  author: string
  puCode: string | null
  photoGeo: { lat: number; lng: number; accuracy: number | null; capturedAt: string | null } | null
}

type LiveWall = { officers: FieldOfficer[]; photos: WallPhoto[]; sos: WallSos[] }

type OfficerReport = {
  id: string
  kind: string
  severity: string
  title: string
  body: string
  createdAt: string
  lat: number | null
  lng: number | null
  hasPhoto: boolean
  photoGeo: { lat: number; lng: number; accuracy: number | null; capturedAt: string | null } | null
}

type OfficerDetail = {
  officer: {
    userId: string
    displayName: string
    serviceNumber: string | null
    puCode: string | null
    puName: string | null
    live: boolean
    lat: number | null
    lng: number | null
    lastLocationAt: string | null
    batteryPct: number | null
    network: string | null
    clockIn: {
      at: string
      clockedInAt: string
      lat: number | null
      lng: number | null
      accuracy: number | null
      puCode: string | null
      distanceM: number | null
      gpsVerified: boolean
    } | null
  }
  reports: OfficerReport[]
}

const C = {
  cyan: '#06b6d4',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#f43f5e',
  slate: '#64748b',
}

function ago(iso: string | null): string {
  if (!iso) return 'never'
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function officerColor(o: FieldOfficer, sos = false): string {
  if (sos) return C.red
  if (o.live && o.locationSource === 'gps') return C.green
  if (o.locationSource === 'gps') return C.cyan
  if (o.locationSource === 'assigned_pu') return C.amber
  return C.slate
}

function officerIcon(o: FieldOfficer, sos = false) {
  const color = officerColor(o, sos)
  const name = o.displayName.split(' ').slice(0, 2).join(' ')
  return L.divIcon({
    className: 'sr3-officer-icon',
    // Real iconSize/anchor — with [0,0] Leaflet gives the marker no clickable box.
    iconSize: [110, 42],
    iconAnchor: [55, 21],
    popupAnchor: [0, -18],
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
        <span style="position:relative;display:flex;height:14px;width:14px;">
          <span style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:.35;animation:sr3ping ${sos ? '0.8s' : '1.6s'} ease-out infinite;"></span>
          <span style="display:block;height:14px;width:14px;border-radius:9999px;background:${color};border:2px solid ${sos ? '#fff' : '#0f172a'};box-shadow:0 0 8px ${color};"></span>
        </span>
        <span style="margin-top:3px;white-space:nowrap;font:600 10px/1.2 ui-monospace,monospace;color:${sos ? '#fecaca' : '#e2e8f0'};background:${sos ? 'rgba(69,10,10,.9)' : 'rgba(3,9,6,.82)'};border:1px solid ${color}55;border-radius:4px;padding:1px 5px;">
          ${sos ? '🆘 ' : ''}${name.replace(/</g, '&lt;')}
        </span>
      </div>`,
  })
}

function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 13, { duration: 1.2 })
  }, [map, target])
  return null
}

const SEV_COLORS: Record<string, string> = {
  critical: '#f43f5e',
  high: '#fb923c',
  medium: '#f59e0b',
  low: '#64748b',
}

function OfficerModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['sr3-officer', userId],
    queryFn: () => apiJson<OfficerDetail>(`/api/public/situation-room/officer/${userId}`),
    refetchInterval: 10_000,
  })
  const o = q.data?.officer
  const reports = q.data?.reports ?? []

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-cyan-500/30 bg-[#04110c] shadow-2xl shadow-cyan-500/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-cyan-500/20 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{o?.displayName ?? 'Loading…'}</h3>
            {o && (
              <div className="mt-1 space-y-0.5 font-(--font-mono) text-[11px] text-slate-400">
                <div>
                  <span className={o.live ? 'text-emerald-400' : 'text-slate-500'}>●</span>{' '}
                  {o.live ? 'LIVE' : 'offline'}
                  {o.serviceNumber ? ` · S/N ${o.serviceNumber}` : ''}
                  {o.puCode || o.puName ? ` · ${o.puCode ?? o.puName}` : ' · unassigned'}
                </div>
                {o.lat != null && o.lng != null && (
                  <div className="text-cyan-300">📍 {o.lat.toFixed(5)}, {o.lng.toFixed(5)} · {ago(o.lastLocationAt)}</div>
                )}
                <div className="text-slate-500">
                  {o.batteryPct != null ? `🔋 ${o.batteryPct}%` : ''}{o.network ? ` · ${o.network}` : ''}
                </div>
                {o.clockIn && (
                  <div className={o.clockIn.gpsVerified ? 'text-emerald-400' : 'text-amber-400'}>
                    🕐 Clocked in {new Date(o.clockIn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {o.clockIn.distanceM != null
                      ? ` · ${o.clockIn.distanceM} m ${o.clockIn.gpsVerified ? 'at post ✓' : 'from post — flagged'}`
                      : ' · no GPS fix — unverified'}
                    {o.clockIn.lat != null && o.clockIn.lng != null
                      ? ` · ${o.clockIn.lat.toFixed(5)}, ${o.clockIn.lng.toFixed(5)}`
                      : ''}
                  </div>
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800">
            Close ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          <h4 className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
            Reports by this officer ({reports.length})
          </h4>
          {q.isLoading && <p className="py-4 text-xs text-slate-500">Loading reports…</p>}
          {q.isError && <p className="py-4 text-xs text-red-400">Could not load reports.</p>}
          {!q.isLoading && reports.length === 0 && (
            <p className="py-4 text-xs text-slate-500">No reports filed by this officer yet.</p>
          )}
          <div className="space-y-2 pb-3">
            {reports.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-700/60 bg-slate-900/50 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 font-(--font-mono) text-[9px] font-bold uppercase"
                    style={{ background: `${SEV_COLORS[r.severity] ?? '#64748b'}22`, color: SEV_COLORS[r.severity] ?? '#94a3b8', border: `1px solid ${SEV_COLORS[r.severity] ?? '#64748b'}55` }}
                  >
                    {r.severity}
                  </span>
                  <span className="font-(--font-mono) text-[9px] uppercase tracking-widest text-slate-500">{r.kind}</span>
                  <span className="ml-auto font-(--font-mono) text-[9px] text-slate-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-200">{r.title}</div>
                {r.body ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{r.body}</p> : null}
                <div className="mt-1.5 space-y-0.5 font-(--font-mono) text-[10px]">
                  {r.lat != null && r.lng != null && (
                    <div className="text-slate-400">⌖ {r.lat.toFixed(5)}, {r.lng.toFixed(5)}</div>
                  )}
                  {r.photoGeo && (
                    <div className="text-emerald-400">
                      📍 photo: {r.photoGeo.lat.toFixed(5)}, {r.photoGeo.lng.toFixed(5)}
                      {r.photoGeo.accuracy != null ? ` ±${Math.round(r.photoGeo.accuracy)}m` : ''}
                    </div>
                  )}
                  {r.hasPhoto && r.id.startsWith('fc-') && (
                    <img
                      src={`/api/public/sitreps/field/${r.id.replace(/^fc-/, '')}/photo`}
                      alt="Field evidence"
                      className="mt-1 max-h-36 rounded border border-slate-700"
                      loading="lazy"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedPhotoThumb({ item }: { item: WallPhoto }) {
  const raw = item.id.replace(/^fc-/, '')
  return (
    <img
      src={`/api/public/sitreps/field/${raw}/photo`}
      alt={item.kind}
      className="h-20 w-full rounded object-cover"
      loading="lazy"
    />
  )
}

export function SituationRoomLive() {
  const [time, setTime] = useState(new Date())
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const mapKeyRef = useRef(0)

  const wallQuery = useQuery({
    queryKey: ['sr3-live-wall'],
    refetchInterval: 10_000,
    queryFn: () => apiJson<LiveWall>('/api/public/situation-room/live'),
  })

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const officers = useMemo(() => wallQuery.data?.officers ?? [], [wallQuery.data])
  const sosAlerts = wallQuery.data?.sos ?? []
  const sosUserIds = useMemo(() => new Set(sosAlerts.map((a) => a.userId)), [sosAlerts])
  const liveCount = officers.filter((o) => o.live).length
  const gpsCount = officers.filter((o) => o.locationSource === 'gps').length
  const geotaggedPhotos = (wallQuery.data?.photos ?? []).filter((f) => f.photoGeo)

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#030906] font-(--font-syne) text-slate-300">
      <style>{`@keyframes sr3ping{0%{transform:scale(.6);opacity:.5}80%,100%{transform:scale(2.2);opacity:0}}`}</style>
      <SosAlertBanner
        alerts={sosAlerts}
        onSelect={(a) => {
          if (a.lastFix) setFocus({ lat: a.lastFix.lat, lng: a.lastFix.lng })
          setSelectedUserId(a.userId)
        }}
      />
      {selectedUserId && <OfficerModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
      {/* Header */}
      <header className="flex items-center justify-between border-b border-cyan-500/20 bg-[#04110c]/90 px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 font-(--font-mono) text-[10px] font-bold tracking-[0.25em] text-cyan-300">
            NPF · SITREP
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-widest text-slate-100">SITUATION ROOM 3 — LIVE FIELD TRACKING</h1>
            <p className="font-(--font-mono) text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Real-time officer positions · geotagged evidence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 font-(--font-mono)">
          <div className="text-center">
            <div className="text-xl font-bold text-emerald-400">{liveCount}</div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">live now</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-cyan-300">{gpsCount}</div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">gps fix</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-slate-200">{officers.length}</div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">deployed</div>
          </div>
          <div className="text-right text-sm text-slate-400">
            <div>{time.toLocaleTimeString()}</div>
            <div className="text-[10px] text-slate-600">{time.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Map */}
        <div className="relative flex-1" style={{ filter: 'brightness(0.88) contrast(1.02)' }}>
          <MapContainer
            key={mapKeyRef.current}
            center={[9.082, 8.675]}
            zoom={6}
            style={{ height: '100%', width: '100%', background: '#030906' }}
            scrollWheelZoom
            preferCanvas
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FlyTo target={focus} />
            {officers.map((o) => (
              <Marker
                key={o.userId}
                position={[o.lat, o.lng]}
                icon={officerIcon(o, sosUserIds.has(o.userId))}
                eventHandlers={{ click: () => setSelectedUserId(o.userId) }}
              />
            ))}
          </MapContainer>
          {wallQuery.isError && (
            <div className="absolute inset-x-0 top-3 z-[1000] mx-auto w-fit rounded border border-red-500/40 bg-red-950/80 px-4 py-2 font-(--font-mono) text-xs text-red-300">
              Live feed unavailable — retrying…
            </div>
          )}
          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] rounded-lg border border-slate-700/60 bg-[#04110c]/90 px-3 py-2 font-(--font-mono) text-[10px] text-slate-400">
            <div className="mb-1 tracking-widest text-slate-500">OFFICER FIX</div>
            <div><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: C.green }} />live GPS</div>
            <div><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: C.cyan }} />last known GPS</div>
            <div><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: C.amber }} />assigned post</div>
            <div><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: C.slate }} />no fix</div>
          </div>
        </div>

        {/* Roster */}
        <aside className="flex w-[340px] flex-col border-l border-cyan-500/15 bg-[#04110c]/70">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="font-(--font-mono) text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Deployed officers
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {officers.length === 0 && !wallQuery.isLoading && (
              <p className="p-4 text-xs text-slate-500">No deployed field officers.</p>
            )}
            {officers.map((o) => (
              <button
                key={o.userId}
                type="button"
                onClick={() => {
                  setFocus({ lat: o.lat, lng: o.lng })
                  setSelectedUserId(o.userId)
                }}
                className={`block w-full border-b px-4 py-3 text-left transition hover:bg-cyan-500/5 ${
                  sosUserIds.has(o.userId) ? 'border-red-500/60 bg-red-950/40' : 'border-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-100">{o.displayName}</span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-(--font-mono) text-[9px] font-bold uppercase"
                    style={{
                      background: `${officerColor(o, sosUserIds.has(o.userId))}22`,
                      color: officerColor(o, sosUserIds.has(o.userId)),
                      border: `1px solid ${officerColor(o, sosUserIds.has(o.userId))}55`,
                    }}
                  >
                    {sosUserIds.has(o.userId) ? '🆘 sos' : o.live ? 'live' : o.locationSource === 'gps' ? 'last fix' : o.locationSource === 'assigned_pu' ? 'at post' : 'no fix'}
                  </span>
                </div>
                <div className="mt-1 font-(--font-mono) text-[10px] text-slate-400">
                  📍 {o.lat.toFixed(5)}, {o.lng.toFixed(5)} · {ago(o.lastLocationAt)}
                </div>
                <div className="mt-0.5 flex justify-between font-(--font-mono) text-[10px] text-slate-600">
                  <span>{o.puCode ?? o.puName ?? 'unassigned'}</span>
                  <span>
                    {o.clockedInAt ? (
                      <span className={o.clockInVerified ? 'text-emerald-400' : 'text-amber-400'}>
                        🕐 {new Date(o.clockedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {o.clockInDistanceM != null ? ` ${o.clockInDistanceM}m` : ''}
                      </span>
                    ) : null}
                    {o.batteryPct != null ? ` 🔋${o.batteryPct}%` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Geotagged evidence strip */}
      <footer className="border-t border-cyan-500/15 bg-[#04110c]/80 px-4 py-3">
        <h2 className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">
          Geotagged field photos — latest
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {geotaggedPhotos.length === 0 && (
            <p className="py-2 font-(--font-mono) text-[10px] text-slate-600">
              {wallQuery.isError ? 'Live feed unavailable — retrying…' : 'No geotagged photos yet'}
            </p>
          )}
          {geotaggedPhotos.map((f) => (
            <div key={f.id} className="w-44 shrink-0 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900/60">
              <FeedPhotoThumb item={f} />
              <div className="px-2 py-1.5 font-(--font-mono) text-[9px] leading-tight">
                <div className="truncate text-slate-300">{f.author}</div>
                <div className="text-emerald-400">
                  📍 {f.photoGeo!.lat.toFixed(4)}, {f.photoGeo!.lng.toFixed(4)}
                  {f.photoGeo!.accuracy != null ? ` ±${Math.round(f.photoGeo!.accuracy)}m` : ''}
                </div>
                <div className="truncate text-slate-500">{f.puCode ?? f.kind}</div>
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  )
}
