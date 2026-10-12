import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleMarker,
  GeoJSON,
  LayerGroup,
  LayersControl,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import 'leaflet/dist/leaflet.css'
import './CommandOfficerMap.css'
import { useSocket } from '../contexts/SocketContext'
import { apiFetch, apiJson, getAuthToken } from '../lib/api'
import type { GeoFeatureCollection } from './operations-map-types'

type Position = { lat: number; lng: number; source: 'gps' | 'checkin' | 'assigned_pu'; at: string | null }
type Officer = {
  userId: string
  username: string
  name: string
  serviceNumber: string | null
  phone: string | null
  post: string | null
  puCode: string | null
  wardName: string | null
  lgaName: string | null
  stateName: string | null
  status: 'sos' | 'missed' | 'due' | 'ok' | 'not_started'
  onboardingComplete: boolean
  livenessVerified: boolean
  hasPhoto: boolean
  battery: number | null
  network: string | null
  lastSeenAt: string | null
  online: boolean
  position: Position | null
}
type MapData = { dataAsOf: string; officers: Officer[] }
type Incident = {
  id: number
  title: string
  typeLabel: string
  typeCode: string
  severity: string
  status: string
  createdAt: string
  location: { lat: number | null; lng: number | null; puCode: string | null; puName: string | null }
}
type HistoryRow = { id: string | number; sender_id: string; sender_username: string; room_id: string; content: string; created_at: string }
type Message = { id: string | number; senderId: string; senderUsername: string; roomId: string; content: string; createdAt: string }

const statusColor: Record<Officer['status'], string> = {
  sos: '#ef4444',
  missed: '#f97316',
  due: '#f59e0b',
  ok: '#22c55e',
  not_started: '#94a3b8',
}
const statusLabel: Record<Officer['status'], string> = {
  sos: 'SOS',
  missed: 'Missed',
  due: 'Due',
  ok: 'OK',
  not_started: 'Not started',
}
const incidentColor: Record<string, string> = { critical: '#dc2626', high: '#f97316', medium: '#eab308', low: '#38bdf8' }
const relativeTime = (value: string | null | undefined) => {
  if (!value) return 'Never'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
const positionLabel = (position: Position | null) => {
  if (!position) return 'No position'
  if (position.source === 'gps') return `Live GPS · ${relativeTime(position.at)}`
  if (position.source === 'checkin') return `Last check-in · ${relativeTime(position.at)}`
  return 'Assigned PU (not a live fix)'
}
const fmtDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Never'
function MapFocus({ officer }: { officer: Officer | null }) {
  const map = useMap()
  useEffect(() => {
    if (officer?.position) map.flyTo([officer.position.lat, officer.position.lng], Math.max(10, map.getZoom()), { duration: 0.7 })
  }, [map, officer])
  return null
}

function OfficerDetails({ officer }: { officer: Officer }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-[var(--portal-muted)]">Service no.</dt><dd>{officer.serviceNumber || '—'}</dd>
      <dt className="text-[var(--portal-muted)]">Phone</dt><dd>{officer.phone || '—'}</dd>
      <dt className="text-[var(--portal-muted)]">Post</dt><dd>{officer.post || 'Unassigned'}</dd>
      <dt className="text-[var(--portal-muted)]">Ward</dt><dd>{officer.wardName || '—'}</dd>
      <dt className="text-[var(--portal-muted)]">LGA / State</dt><dd>{[officer.lgaName, officer.stateName].filter(Boolean).join(' / ') || '—'}</dd>
      <dt className="text-[var(--portal-muted)]">Status</dt><dd style={{ color: statusColor[officer.status] }}>{statusLabel[officer.status]}</dd>
      <dt className="text-[var(--portal-muted)]">Last seen</dt><dd>{relativeTime(officer.lastSeenAt)}</dd>
      <dt className="text-[var(--portal-muted)]">Position</dt>
      <dd>{positionLabel(officer.position)}</dd>
      <dt className="text-[var(--portal-muted)]">Battery / network</dt><dd>{officer.battery == null ? '—' : `${officer.battery}%`} · {officer.network || '—'}</dd>
      <dt className="text-[var(--portal-muted)]">Connection</dt><dd>{officer.online ? 'Online' : 'Offline'}</dd>
      <dt className="text-[var(--portal-muted)]">Onboarding / liveness</dt><dd>{officer.onboardingComplete ? 'Complete' : 'Incomplete'} · {officer.livenessVerified ? 'Verified' : 'Unverified'}</dd>
    </dl>
  )
}

export function CommandOfficerMap() {
  const { socket, connected, messages, sendMessage, chatSendError, clearChatSendError, onlineOfficers, commandDataRevision } = useSocket()
  const [selected, setSelected] = useState<Officer | null>(null)
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [positions, setPositions] = useState<Record<string, Position>>({})
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const photoCache = useRef(new Map<string, string>())
  const [threadHistory, setThreadHistory] = useState<{ userId: string; messages: Message[] }>({ userId: '', messages: [] })
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  const mapQuery = useQuery({
    queryKey: ['command-officers-map', commandDataRevision],
    queryFn: () => apiJson<MapData>('/api/command/officers/map'),
    refetchInterval: 30_000,
  })
  const stateQuery = useQuery({
    queryKey: ['command-map-states'],
    queryFn: () => apiJson<GeoFeatureCollection>('/api/geo/layers/states'),
  })
  const lgaQuery = useQuery({
    queryKey: ['command-map-lgas'],
    queryFn: () => apiJson<GeoFeatureCollection>('/api/geo/layers/lgas'),
  })
  const incidentQuery = useQuery({
    queryKey: ['command-map-incidents', commandDataRevision],
    queryFn: async () => (await apiJson<{ incidents: Incident[] }>('/api/incidents?status=active&limit=500')).incidents,
    refetchInterval: 30_000,
  })
  const refetchMap = mapQuery.refetch
  const refetchIncidents = incidentQuery.refetch
  const officers = useMemo(() => (mapQuery.data?.officers ?? []).map((officer) => ({
    ...officer,
    online: Boolean(onlineOfficers[officer.userId]) || officer.online,
    position: positions[officer.userId] ?? officer.position,
  })), [mapQuery.data, onlineOfficers, positions])
  const stateNames = useMemo(() => [...new Set(officers.map((officer) => officer.stateName).filter(Boolean))].sort(), [officers])
  const filtered = useMemo(() => officers.filter((officer) => {
    const text = search.trim().toLowerCase()
    return (!stateFilter || officer.stateName === stateFilter)
      && (!statusFilter || officer.status === statusFilter)
      && (!onlineOnly || officer.online)
      && (!text || `${officer.name} ${officer.serviceNumber ?? ''} ${officer.puCode ?? ''} ${officer.post ?? ''}`.toLowerCase().includes(text))
  }), [officers, search, stateFilter, statusFilter, onlineOnly])
  const searchMatches = search.trim() ? filtered.slice(0, 8) : []
  const incidents = (incidentQuery.data ?? []).filter((incident) =>
    typeof incident.location?.lat === 'number' && Number.isFinite(incident.location.lat)
      && typeof incident.location?.lng === 'number' && Number.isFinite(incident.location.lng))
  const counts = useMemo(() => officers.reduce((sum, officer) => ({ ...sum, [officer.status]: sum[officer.status] + 1 }), {
    sos: 0, missed: 0, due: 0, ok: 0, not_started: 0,
  }), [officers])

  const fetchPhoto = useCallback(async (userId: string) => {
    if (photoCache.current.has(userId)) return
    const token = getAuthToken()
    if (!token) return
    try {
      const response = await apiFetch(`/api/command/officers/${encodeURIComponent(userId)}/photo`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) return
      const url = URL.createObjectURL(await response.blob())
      photoCache.current.set(userId, url)
      setPhotoUrls((current) => ({ ...current, [userId]: url }))
    } catch {
      // The details remain available when no photo can be loaded.
    }
  }, [])

  useEffect(() => () => photoCache.current.forEach((url) => URL.revokeObjectURL(url)), [])
  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearTimeout(initialUpdate)
      window.clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (!socket) return
    const onLocation = (event: { userId: string; coords?: { lat: number; lng: number }; timestamp?: string }) => {
      const coords = event.coords
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return
      setPositions((current) => ({
        ...current,
        [event.userId]: { lat: coords.lat, lng: coords.lng, source: 'gps', at: event.timestamp ?? new Date().toISOString() },
      }))
    }
    const refresh = () => {
      void refetchMap()
      void refetchIncidents()
    }
    socket.on('field_officer_location', onLocation)
    socket.on('field_officer_online', refresh)
    socket.on('field_officer_offline', refresh)
    return () => {
      socket.off('field_officer_location', onLocation)
      socket.off('field_officer_online', refresh)
      socket.off('field_officer_offline', refresh)
    }
  }, [socket, refetchMap, refetchIncidents])

  const selectedUserId = selected?.userId
  useEffect(() => {
    if (!selectedUserId) return
    let cancelled = false
    apiJson<{ messages: HistoryRow[] }>(`/api/chat/dm/${encodeURIComponent(selectedUserId)}?limit=100`)
      .then(({ messages: rows }) => {
        if (!cancelled) setThreadHistory({
          userId: selectedUserId,
          messages: rows.map((row) => ({
            id: row.id, senderId: String(row.sender_id), senderUsername: row.sender_username,
            roomId: row.room_id, content: row.content, createdAt: row.created_at,
          })),
        })
      })
      .catch((error) => { if (!cancelled) setSendError(error instanceof Error ? error.message : 'Could not load messages') })
    return () => { cancelled = true }
  }, [selectedUserId])

  const activeThread = useMemo(() => {
    if (!selected) return []
    const history = threadHistory.userId === selected.userId ? threadHistory.messages : []
    const selectedRoom = history[0]?.roomId
      ?? messages.find((message) => message.roomId.startsWith('dm_') && message.roomId.split('_').includes(selected.userId))?.roomId
    const live = messages.filter((message) => message.roomId === selectedRoom)
    const all = [...history, ...live]
    const seen = new Set<string>()
    return all.filter((message) => {
      const id = String(message.id)
      if (seen.has(id)) return false
      seen.add(id)
      return message.roomId === selectedRoom
    }).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [selected, threadHistory, messages])

  const submitMessage = async () => {
    const content = draft.trim()
    if (!selected || !content) return
    setSendError(null)
    clearChatSendError()
    if (connected && socket) {
      sendMessage(`user_${selected.userId}`, content)
      setDraft('')
      return
    }
    try {
      const result = await apiJson<{ message: Message }>(`/api/chat/dm/${encodeURIComponent(selected.userId)}`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      setThreadHistory((current) => ({
        userId: selected.userId,
        messages: [...(current.userId === selected.userId ? current.messages : []), result.message],
      }))
      setDraft('')
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send message')
    }
  }

  const selectOfficer = (officer: Officer) => {
    setSelected(officer)
    if (officer.hasPhoto) void fetchPhoto(officer.userId)
  }

  if (mapQuery.isLoading) return <div className="sr-card p-8 text-center text-sm text-[var(--portal-muted)]">Loading live officer positions…</div>
  if (mapQuery.isError) return <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{mapQuery.error.message}</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-3 text-xs">
        <input aria-label="Search officers" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, service no. or PU" className="min-w-56 rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2" />
        <select aria-label="Filter by state" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2">
          <option value="">All states</option>{stateNames.map((name) => <option key={name!}>{name}</option>)}
        </select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2">
          <option value="">All statuses</option>{Object.keys(statusLabel).map((status) => <option key={status} value={status}>{statusLabel[status as Officer['status']]}</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} />Online only</label>
        <button type="button" onClick={() => { void mapQuery.refetch(); void incidentQuery.refetch() }} className="ml-auto rounded-lg border border-[color:var(--portal-border)] px-3 py-2">Refresh</button>
        <span className="text-[var(--portal-muted)]">Data as of {mapQuery.data?.dataAsOf ? new Date(mapQuery.data.dataAsOf).toLocaleTimeString() : '—'}</span>
      </div>
      {searchMatches.length ? (
        <div className="flex flex-wrap gap-1 rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-2">
          {searchMatches.map((officer) => (
            <button key={officer.userId} type="button" onClick={() => selectOfficer(officer)} className="rounded px-2 py-1 text-left text-xs hover:bg-white/10">
              {officer.name} · {officer.serviceNumber || officer.puCode || officer.username}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(statusLabel) as Officer['status'][]).map((status) => (
              <button key={status} type="button" onClick={() => setStatusFilter(statusFilter === status ? '' : status)} className={`rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-2 text-left text-xs ${statusFilter === status ? 'ring-1 ring-[#00c46a]' : ''}`}>
                <span style={{ color: statusColor[status] }}>● {statusLabel[status]}</span><strong className="ml-2">{counts[status]}</strong>
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
            <MapContainer center={[9.082, 8.675]} zoom={6} style={{ height: 'min(68vh, 700px)', width: '100%', background: '#dbeafe' }} scrollWheelZoom>
              <MapFocus officer={selected} />
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="OpenStreetMap">
                  <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Carto Voyager">
                  <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Esri World Imagery">
                  <TileLayer attribution='Tiles &copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
                </LayersControl.BaseLayer>
                <LayersControl.Overlay checked name="State boundaries">
                  <GeoJSON data={(stateQuery.data ?? { type: 'FeatureCollection', features: [] }) as never} style={{ color: '#16a34a', weight: 2, fillOpacity: 0.02 }} />
                </LayersControl.Overlay>
                <LayersControl.Overlay name="LGA boundaries">
                  <GeoJSON data={(lgaQuery.data ?? { type: 'FeatureCollection', features: [] }) as never} style={{ color: '#eab308', weight: 1, fillOpacity: 0.02 }} />
                </LayersControl.Overlay>
                <LayersControl.Overlay checked name="Officers">
                  <LayerGroup>
                    {filtered.filter((officer) => officer.position).map((officer) => {
                      const position = officer.position!
                      const dashArray = position.source === 'assigned_pu' ? '4 4' : undefined
                      return (
                        <Fragment key={officer.userId}>
                          {officer.online ? <CircleMarker center={[position.lat, position.lng]} radius={13} pathOptions={{ color: '#0ea5e9', fillOpacity: 0, weight: 3, dashArray }} /> : null}
                          <CircleMarker
                            center={[position.lat, position.lng]}
                            radius={officer.status === 'sos' ? 10 : 8}
                            pathOptions={{ color: statusColor[officer.status], fillColor: statusColor[officer.status], fillOpacity: 0.9, weight: 2, dashArray, className: officer.status === 'sos' ? 'officer-sos-pulse' : undefined }}
                            eventHandlers={{
                              click: () => selectOfficer(officer),
                              mouseover: () => { if (officer.hasPhoto) void fetchPhoto(officer.userId) },
                            }}
                          >
                            <Tooltip direction="top" opacity={0.98}>
                              <div className="w-56 space-y-2 text-xs">
                                {photoUrls[officer.userId] ? <img src={photoUrls[officer.userId]} alt="" className="h-24 w-full rounded object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600 text-lg font-semibold text-white">{officer.name.charAt(0).toUpperCase()}</div>}
                                <strong>{officer.name}</strong>
                                <OfficerDetails officer={officer} />
                              </div>
                            </Tooltip>
                          </CircleMarker>
                        </Fragment>
                      )
                    })}
                  </LayerGroup>
                </LayersControl.Overlay>
                <LayersControl.Overlay checked name="Incidents">
                  <LayerGroup>
                    {incidents.map((incident) => (
                      <CircleMarker key={incident.id} center={[incident.location.lat!, incident.location.lng!]} radius={7} pathOptions={{ color: incidentColor[incident.severity] ?? '#ef4444', fillColor: incidentColor[incident.severity] ?? '#ef4444', fillOpacity: 0.85, weight: 2 }}>
                        <Tooltip direction="top">
                          <div className="text-xs"><strong>{incident.title}</strong><div>{incident.typeLabel} · {incident.severity.toUpperCase()}</div><div>{fmtDate(incident.createdAt)}</div><div>{incident.location.puCode ? `${incident.location.puCode} · ${incident.location.puName}` : 'No PU'}</div></div>
                        </Tooltip>
                      </CircleMarker>
                    ))}
                  </LayerGroup>
                </LayersControl.Overlay>
              </LayersControl>
            </MapContainer>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--portal-muted)]">
            {(Object.keys(statusLabel) as Officer['status'][]).map((status) => <span key={status} style={{ color: statusColor[status] }}>● {statusLabel[status]}</span>)}
            <span>○ Blue ring: online</span><span>┄ Dashed: assigned PU</span>
            {mapQuery.data?.officers.some((officer) => !officer.position) ? <span>{mapQuery.data.officers.filter((officer) => !officer.position).length} without position</span> : null}
          </div>
          <div className="max-h-36 overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-2">
            <div className="mb-1 text-xs font-semibold">No position</div>
            {mapQuery.data?.officers.filter((officer) => !officer.position).map((officer) => (
              <button key={officer.userId} onClick={() => selectOfficer(officer)} className="mr-2 rounded px-2 py-1 text-left text-xs hover:bg-white/10">{officer.name} · {officer.serviceNumber || officer.username}</button>
            ))}
            {!mapQuery.data?.officers.some((officer) => !officer.position) ? <span className="text-xs text-[var(--portal-muted)]">All officers have a position or assigned PU.</span> : null}
          </div>
        </div>

        <aside className="max-h-[calc(68vh+120px)] min-h-72 overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-4">
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="font-semibold">{selected.name}</h2><p className="text-xs text-[var(--portal-muted)]">{selected.username}</p></div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Close officer details">×</button>
              </div>
              {photoUrls[selected.userId] ? <img src={photoUrls[selected.userId]} alt={selected.name} className="h-36 w-full rounded-lg object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-600 text-3xl font-semibold text-white">{selected.name.charAt(0).toUpperCase()}</div>}
              <OfficerDetails officer={selected} />
              <div className="border-t border-[color:var(--portal-border)] pt-3">
                <h3 className="mb-2 text-sm font-semibold">Direct message</h3>
                <div className="mb-2 max-h-48 space-y-2 overflow-y-auto rounded-lg bg-black/10 p-2">
                  {activeThread.map((message) => <div key={message.id} className="text-xs"><span className="font-semibold">{message.senderUsername}</span><span className="ml-2 text-[var(--portal-muted)]">{new Date(message.createdAt).toLocaleTimeString()}</span><p className="whitespace-pre-wrap">{message.content}</p></div>)}
                  {!activeThread.length ? <p className="text-xs text-[var(--portal-muted)]">No messages yet.</p> : null}
                </div>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder="Write a direct message…" className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] p-2 text-sm" />
                <button type="button" onClick={() => void submitMessage()} disabled={!draft.trim()} className="mt-2 rounded-lg bg-[#00c46a] px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">Send message</button>
                {sendError || chatSendError ? <p role="alert" className="mt-2 text-xs text-red-400">{sendError || chatSendError}</p> : null}
              </div>
            </div>
          ) : <p className="text-sm text-[var(--portal-muted)]">Select an officer marker or a no-position officer to view details and message them.</p>}
        </aside>
      </div>
      <p className="text-[10px] text-[var(--portal-muted)]">Updated {relativeTime(mapQuery.data?.dataAsOf)} · local time {new Date(now).toLocaleTimeString()} · {connected ? 'Live socket connected' : 'Live socket disconnected'}</p>
    </div>
  )
}
