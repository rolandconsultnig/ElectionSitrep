import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch, apiJson } from '../../lib/api'

type FieldOfficer = {
  userId: string
  username: string
  displayName: string
  serviceNumber: string | null
  lat: number
  lng: number
  live: boolean
  locationSource: 'gps' | 'assigned_pu' | 'estimate'
  lastLocationAt: string | null
  batteryPct: number | null
  network: string | null
  assignedPu: { id: string; code: string | null; name: string | null; lat: number | null; lng: number | null } | null
}

type FeedItem = {
  id: string
  kind: string
  severity: string
  title: string
  createdAt: string
  author: string
  puCode: string | null
  hasPhoto: boolean
  photoGeo: { lat: number; lng: number; accuracy: number | null; capturedAt: string | null } | null
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

function officerColor(o: FieldOfficer): string {
  if (o.live && o.locationSource === 'gps') return C.green
  if (o.locationSource === 'gps') return C.cyan
  if (o.locationSource === 'assigned_pu') return C.amber
  return C.slate
}

function officerIcon(o: FieldOfficer) {
  const color = officerColor(o)
  const name = (o.displayName || o.username).split(' ').slice(0, 2).join(' ')
  return L.divIcon({
    className: 'sr3-officer-icon',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);">
        <span style="position:relative;display:flex;height:14px;width:14px;">
          ${o.live ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${color};opacity:.35;animation:sr3ping 1.6s ease-out infinite;"></span>` : ''}
          <span style="display:block;height:14px;width:14px;border-radius:9999px;background:${color};border:2px solid #0f172a;box-shadow:0 0 8px ${color};"></span>
        </span>
        <span style="margin-top:3px;white-space:nowrap;font:600 10px/1.2 ui-monospace,monospace;color:#e2e8f0;background:rgba(3,9,6,.82);border:1px solid ${color}55;border-radius:4px;padding:1px 5px;">
          ${name.replace(/</g, '&lt;')}
        </span>
      </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -18],
  })
}

function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 13, { duration: 1.2 })
  }, [map, target])
  return null
}

function FeedPhotoThumb({ item }: { item: FeedItem }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let obj: string | null = null
    let cancelled = false
    const raw = item.id.replace(/^fc-/, '')
    void apiFetch(`/api/sitreps/field/${raw}/photo`).then(async (r) => {
      if (!r.ok || cancelled) return
      obj = URL.createObjectURL(await r.blob())
      setUrl(obj)
    })
    return () => {
      cancelled = true
      if (obj) URL.revokeObjectURL(obj)
    }
  }, [item.id])
  return url ? (
    <img src={url} alt={item.title} className="h-20 w-full rounded object-cover" />
  ) : (
    <div className="flex h-20 w-full items-center justify-center rounded bg-slate-800/60 text-[10px] text-slate-500">loading…</div>
  )
}

export function SituationRoomLive() {
  const [time, setTime] = useState(new Date())
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const mapKeyRef = useRef(0)

  const officersQuery = useQuery({
    queryKey: ['sr3-field-officers'],
    refetchInterval: 10_000,
    queryFn: async () => {
      try {
        return await apiJson<{ active: FieldOfficer[]; inactive: FieldOfficer[] }>('/api/admin/field-operations-map')
      } catch {
        return await apiJson<{ active: FieldOfficer[]; inactive: FieldOfficer[] }>('/api/igp/field-operations-map')
      }
    },
  })

  const photoFeedQuery = useQuery({
    queryKey: ['sr3-photo-feed'],
    refetchInterval: 20_000,
    queryFn: async () => {
      const d = await apiJson<{ sitreps: FeedItem[] }>('/api/sitreps?limit=100')
      return (d.sitreps ?? []).filter((s) => s.hasPhoto).slice(0, 12)
    },
    retry: false,
  })

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const officers = useMemo(() => officersQuery.data?.active ?? [], [officersQuery.data])
  const liveCount = officers.filter((o) => o.live).length
  const gpsCount = officers.filter((o) => o.locationSource === 'gps').length
  const geotaggedPhotos = (photoFeedQuery.data ?? []).filter((f) => f.photoGeo)

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#030906] font-(--font-syne) text-slate-300">
      <style>{`@keyframes sr3ping{0%{transform:scale(.6);opacity:.5}80%,100%{transform:scale(2.2);opacity:0}}`}</style>
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
        <div className="relative flex-1">
          <MapContainer
            key={mapKeyRef.current}
            center={[9.082, 8.675]}
            zoom={6}
            style={{ height: '100%', width: '100%', background: '#030906' }}
            scrollWheelZoom
            preferCanvas
          >
            <TileLayer
              attribution="&copy; OpenStreetMap &copy; CARTO"
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <FlyTo target={focus} />
            {officers.map((o) => (
              <Marker key={o.userId} position={[o.lat, o.lng]} icon={officerIcon(o)}>
                <Popup>
                  <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, lineHeight: 1.5 }}>
                    <strong>{o.displayName}</strong>
                    {o.serviceNumber ? ` (${o.serviceNumber})` : ''}<br />
                    @{o.username} · {o.live ? 'LIVE' : 'offline'}<br />
                    📍 {o.lat.toFixed(5)}, {o.lng.toFixed(5)}<br />
                    Fix: {o.locationSource === 'gps' ? 'device GPS' : o.locationSource === 'assigned_pu' ? 'assigned PU' : 'estimate'} · {ago(o.lastLocationAt)}<br />
                    {o.assignedPu ? `Post: ${o.assignedPu.code ?? o.assignedPu.name ?? '—'}` : 'Post: unassigned'}
                    {o.batteryPct != null ? `<br />Battery: ${o.batteryPct}%` : ''}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          {officersQuery.isError && (
            <div className="absolute inset-x-0 top-3 z-[1000] mx-auto w-fit rounded border border-red-500/40 bg-red-950/80 px-4 py-2 font-(--font-mono) text-xs text-red-300">
              Sign in to a command portal to stream live officer positions
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
            {officers.length === 0 && !officersQuery.isLoading && (
              <p className="p-4 text-xs text-slate-500">No deployed field officers.</p>
            )}
            {officers.map((o) => (
              <button
                key={o.userId}
                type="button"
                onClick={() => setFocus({ lat: o.lat, lng: o.lng })}
                className="block w-full border-b border-slate-800/60 px-4 py-3 text-left transition hover:bg-cyan-500/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-100">{o.displayName}</span>
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-(--font-mono) text-[9px] font-bold uppercase"
                    style={{
                      background: `${officerColor(o)}22`,
                      color: officerColor(o),
                      border: `1px solid ${officerColor(o)}55`,
                    }}
                  >
                    {o.live ? 'live' : o.locationSource === 'gps' ? 'last fix' : o.locationSource === 'assigned_pu' ? 'at post' : 'no fix'}
                  </span>
                </div>
                <div className="mt-1 font-(--font-mono) text-[10px] text-slate-400">
                  📍 {o.lat.toFixed(5)}, {o.lng.toFixed(5)} · {ago(o.lastLocationAt)}
                </div>
                <div className="mt-0.5 flex justify-between font-(--font-mono) text-[10px] text-slate-600">
                  <span>{o.serviceNumber ? `S/N ${o.serviceNumber} · ` : ''}{o.assignedPu?.code ?? o.assignedPu?.name ?? 'unassigned'}</span>
                  <span>{o.batteryPct != null ? `🔋${o.batteryPct}%` : ''}</span>
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
              {photoFeedQuery.isError ? 'Sign in to a command portal to view field evidence' : 'No geotagged photos yet'}
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
                <div className="truncate text-slate-500">{f.puCode ?? f.title}</div>
              </div>
            </div>
          ))}
        </div>
      </footer>
    </div>
  )
}
