import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { apiJson } from '../../lib/api'
import {
  fetchPhotoObjectUrl,
  formatCountdown,
  postJson,
  SEVERITY_STYLE,
  type Incident,
  type IncidentEvent,
  type SafetyOfficer,
  type SosAlert,
} from '../../lib/incidents'
import { useSocket } from '../../contexts/SocketContext'

type Summary = {
  activeBySeverity: Partial<Record<string, number>>
  open: number
  slaBreached: number
  activeFlash: number
  medianAckSeconds: number | null
}

const SAFETY_COLOR: Record<SafetyOfficer['status'], string> = {
  sos: '#dc2626',
  missed: '#f59e0b',
  due: '#eab308',
  ok: '#10b981',
  not_started: '#64748b',
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return now
}

function IncidentDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['incident', id],
    queryFn: () => apiJson<{ incident: Incident; events: IncidentEvent[] }>(`/api/incidents/${id}`),
  })
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const inc = q.data?.incident

  useEffect(() => {
    if (!inc?.hasPhoto) return
    let url: string | null = null
    void fetchPhotoObjectUrl(`/api/incidents/${id}/photo`).then((u) => {
      url = u
      setPhoto(u)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, inc?.hasPhoto])

  async function act(action: 'acknowledge' | 'escalate' | 'resolve' | 'note') {
    setErr(null)
    try {
      await postJson(`/api/incidents/${id}/${action}`, { note: note.trim() || undefined })
      setNote('')
      void qc.invalidateQueries({ queryKey: ['incident', id] })
      void qc.invalidateQueries({ queryKey: ['incidents'] })
      void qc.invalidateQueries({ queryKey: ['incidents-summary'] })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (!inc) return <div className="sr-card p-5 text-sm text-[var(--portal-muted)]">Loading…</div>
  const loc = [inc.location.puCode, inc.location.wardName, inc.location.lgaName, inc.location.stateName].filter(Boolean).join(' · ')
  return (
    <div className="sr-card space-y-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {inc.isFlash && <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">FLASH</span>}
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLE[inc.severity]}`}>{inc.severity}</span>
            <span className="text-xs text-[var(--portal-muted)]">#{inc.id}</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-[var(--portal-fg)]">{inc.typeLabel}</h2>
          <p className="text-xs text-[var(--portal-muted)]">{loc || 'Location unknown'}</p>
        </div>
        <button type="button" className="sr-btn-ghost px-2 py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>
      {inc.description && <p className="whitespace-pre-wrap text-sm text-[var(--portal-fg)]">{inc.description}</p>}
      <dl className="grid grid-cols-2 gap-2 text-xs text-[var(--portal-muted)]">
        <div>Reporter: {inc.reporter.name || inc.reporter.username} {inc.reporter.serviceNumber ? `(${inc.reporter.serviceNumber})` : ''}</div>
        <div>Reported: {new Date(inc.createdAt).toLocaleString()}</div>
        <div>Level: {inc.escalationLabel}</div>
        <div>Status: {inc.status}</div>
        {inc.location.lat != null && (
          <div className="col-span-2">
            GPS: {inc.location.lat.toFixed(5)}, {inc.location.lng?.toFixed(5)}
          </div>
        )}
      </dl>
      {photo && (
        <div>
          <img src={photo} alt="Evidence" className="max-h-64 rounded-md" />
          <p className="mt-1 break-all font-(--font-mono) text-[10px] text-[var(--portal-dim)]">SHA-256 {inc.photoSha256}</p>
        </div>
      )}
      {inc.status !== 'resolved' && (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note / tasking (optional)"
            className="w-full rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-sm text-[var(--portal-fg)]"
          />
          <div className="flex flex-wrap gap-2">
            {inc.status === 'open' && (
              <button type="button" onClick={() => void act('acknowledge')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                Acknowledge
              </button>
            )}
            {inc.escalationLevel !== 'fhq' && (
              <button type="button" onClick={() => void act('escalate')} className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">
                Escalate
              </button>
            )}
            <button type="button" onClick={() => void act('resolve')} className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white">
              Resolve
            </button>
            <button type="button" disabled={!note.trim()} onClick={() => void act('note')} className="sr-btn-ghost px-3 py-1.5 text-xs disabled:opacity-50">
              Add note
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
      <ol className="space-y-1 border-t border-[color:var(--portal-border)] pt-3 text-xs">
        {(q.data?.events ?? []).map((e, i) => (
          <li key={i} className="text-[var(--portal-muted)]">
            <span className="font-(--font-mono)">{new Date(e.at).toLocaleTimeString()}</span> · <b>{e.action.replace(/_/g, ' ')}</b>
            {e.by ? ` by ${e.by}` : ''}
            {e.note ? ` — ${e.note}` : ''}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function IncidentCommandPage() {
  const qc = useQueryClient()
  const { socket } = useSocket()
  const now = useNow()
  const [tab, setTab] = useState<'incidents' | 'sos' | 'safety'>('incidents')
  const [statusFilter, setStatusFilter] = useState('active')
  const [selected, setSelected] = useState<number | null>(null)

  const incQ = useQuery({
    queryKey: ['incidents', statusFilter],
    queryFn: () => apiJson<{ incidents: Incident[] }>(`/api/incidents?status=${statusFilter}&limit=300`),
    refetchInterval: 30_000,
  })
  const sumQ = useQuery({
    queryKey: ['incidents-summary'],
    queryFn: () => apiJson<Summary>('/api/incidents/summary'),
    refetchInterval: 30_000,
  })
  const sosQ = useQuery({ queryKey: ['sos'], queryFn: () => apiJson<{ alerts: SosAlert[] }>('/api/sos'), refetchInterval: 30_000 })
  const safetyQ = useQuery({
    queryKey: ['safety-overview'],
    queryFn: () => apiJson<{ intervalMinutes: number; officers: SafetyOfficer[] }>('/api/safety/overview'),
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (!socket) return
    const refreshInc = () => {
      void qc.invalidateQueries({ queryKey: ['incidents'] })
      void qc.invalidateQueries({ queryKey: ['incidents-summary'] })
    }
    const refreshSos = () => {
      void qc.invalidateQueries({ queryKey: ['sos'] })
      void qc.invalidateQueries({ queryKey: ['safety-overview'] })
    }
    socket.on('incident_updated', refreshInc)
    socket.on('incident_alert', refreshInc)
    socket.on('sos_alert', refreshSos)
    socket.on('sos_location', refreshSos)
    socket.on('sos_resolved', refreshSos)
    socket.on('checkin_missed', refreshSos)
    return () => {
      socket.off('incident_updated', refreshInc)
      socket.off('incident_alert', refreshInc)
      socket.off('sos_alert', refreshSos)
      socket.off('sos_location', refreshSos)
      socket.off('sos_resolved', refreshSos)
      socket.off('checkin_missed', refreshSos)
    }
  }, [socket, qc])

  const incidents = incQ.data?.incidents ?? []
  const alerts = (sosQ.data?.alerts ?? []).filter((a) => a.status === 'active')
  const officers = safetyQ.data?.officers ?? []
  const s = sumQ.data
  const mapCenter = ((): [number, number] => {
    const p = alerts.find((a) => a.trail.length)?.trail.at(-1) ?? officers.find((o) => o.lastLat != null)
    if (p && 'lat' in p) return [p.lat, p.lng]
    if (p && 'lastLat' in p && p.lastLat != null && p.lastLng != null) return [p.lastLat, p.lastLng]
    return [9.08, 8.68]
  })()

  async function resolveSos(id: number) {
    const note = window.prompt('Resolution note (e.g. officer located safe)') ?? ''
    await postJson(`/api/sos/${id}/resolve`, { note })
    void qc.invalidateQueries({ queryKey: ['sos'] })
  }

  const kpis: [string, number | string, string][] = [
    ['Open incidents', s?.open ?? '—', 'text-[var(--portal-fg)]'],
    ['Active FLASH', s?.activeFlash ?? '—', 'text-red-500'],
    ['SLA breached', s?.slaBreached ?? '—', 'text-orange-500'],
    ['Active SOS', alerts.length, 'text-red-500'],
    ['Missed check-ins', officers.filter((o) => o.status === 'missed').length, 'text-amber-500'],
    ['Median ack', s?.medianAckSeconds != null ? `${Math.round(s.medianAckSeconds / 60)} min` : '—', 'text-[var(--portal-fg)]'],
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="sr-page-title">Incident command</h1>
        <p className="sr-page-desc">Structured incidents with SLA escalation, FLASH reports, officer SOS and safety check-ins.</p>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map(([label, v, cls]) => (
          <div key={label} className="sr-card p-4">
            <div className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${cls}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {(['incidents', 'sos', 'safety'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? 'bg-[#0dccb0] text-black' : 'sr-btn-ghost'}`}
          >
            {t === 'incidents' ? 'Incidents' : t === 'sos' ? `SOS (${alerts.length})` : 'Officer safety'}
          </button>
        ))}
      </div>

      {tab === 'incidents' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="sr-card overflow-x-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-2 py-1 text-sm text-[var(--portal-fg)]"
              >
                <option value="active">Active</option>
                <option value="open">Unacknowledged</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="">All</option>
              </select>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="font-(--font-mono) text-[10px] uppercase text-[var(--portal-muted)]">
                <tr>
                  <th className="p-2">Severity</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Location</th>
                  <th className="p-2">Level</th>
                  <th className="p-2">SLA</th>
                  <th className="p-2">Reported</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => {
                  const overdue = i.status === 'open' && i.slaDueAt != null && new Date(i.slaDueAt).getTime() < now
                  return (
                    <tr
                      key={i.id}
                      onClick={() => setSelected(i.id)}
                      className={`cursor-pointer border-t border-[color:var(--portal-border)] hover:bg-white/5 ${
                        i.isFlash && i.status === 'open' ? 'bg-red-600/15' : ''
                      } ${selected === i.id ? 'bg-white/10' : ''}`}
                    >
                      <td className="p-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLE[i.severity]}`}>
                          {i.isFlash ? 'FLASH' : i.severity}
                        </span>
                      </td>
                      <td className="p-2 text-[var(--portal-fg)]">{i.typeLabel}</td>
                      <td className="p-2 text-xs text-[var(--portal-muted)]">
                        {[i.location.puCode, i.location.lgaName, i.location.stateName].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="p-2 text-xs text-[var(--portal-muted)]">{i.escalationLabel}</td>
                      <td className={`p-2 font-(--font-mono) text-xs ${overdue ? 'text-red-500' : 'text-[var(--portal-muted)]'}`}>
                        {i.status === 'open' ? formatCountdown(i.slaDueAt, now) : i.status}
                      </td>
                      <td className="p-2 text-xs text-[var(--portal-muted)]">{new Date(i.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  )
                })}
                {!incidents.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm text-[var(--portal-muted)]">
                      {incQ.isLoading ? 'Loading…' : 'No incidents in this view.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {selected != null ? (
            <IncidentDetail id={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="sr-card p-5 text-sm text-[var(--portal-muted)]">Select an incident to view details, evidence and actions.</div>
          )}
        </div>
      )}

      {(tab === 'sos' || tab === 'safety') && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="sr-card h-[480px] overflow-hidden p-0">
            <MapContainer center={mapCenter} zoom={alerts.length ? 14 : 6} className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {alerts.map((a) => (
                <Polyline key={`t${a.id}`} positions={a.trail.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#dc2626' }} />
              ))}
              {alerts.map((a) => {
                const last = a.trail.at(-1)
                return last ? (
                  <CircleMarker key={`s${a.id}`} center={[last.lat, last.lng]} radius={10} pathOptions={{ color: '#dc2626', fillOpacity: 0.8 }}>
                    <Popup>
                      {a.kind === 'duress' ? 'DURESS' : 'SOS'} — {a.officer.name || a.officer.username}
                    </Popup>
                  </CircleMarker>
                ) : null
              })}
              {tab === 'safety' &&
                officers
                  .filter((o) => o.lastLat != null && o.lastLng != null)
                  .map((o) => (
                    <CircleMarker
                      key={o.userId}
                      center={[o.lastLat as number, o.lastLng as number]}
                      radius={7}
                      pathOptions={{ color: SAFETY_COLOR[o.status], fillOpacity: 0.7 }}
                    >
                      <Popup>
                        {o.name || o.username} · {o.status} · 🔋 {o.batteryPct ?? '?'}% · {o.network ?? '?'}
                      </Popup>
                    </CircleMarker>
                  ))}
            </MapContainer>
          </div>
          {tab === 'sos' ? (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.id} className="sr-card border-red-600/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">{a.kind === 'duress' ? 'DURESS' : 'SOS'}</span>
                    <span className="font-(--font-mono) text-xs text-[var(--portal-muted)]">{new Date(a.startedAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-2 font-semibold text-[var(--portal-fg)]">
                    {a.officer.name || a.officer.username} {a.officer.serviceNumber ? `(${a.officer.serviceNumber})` : ''}
                  </p>
                  <p className="text-xs text-[var(--portal-muted)]">
                    {[a.location.puCode, a.location.lgaName, a.location.stateName].filter(Boolean).join(' · ') || 'No post assigned'}
                    {a.officer.phone ? ` · ☎ ${a.officer.phone}` : ''}
                  </p>
                  <p className="text-xs text-[var(--portal-muted)]">{a.trail.length} GPS points</p>
                  {a.kind === 'duress' && <p className="mt-1 text-xs text-amber-500">Account flagged compromised — do not trust its reports.</p>}
                  <button type="button" onClick={() => void resolveSos(a.id)} className="mt-3 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Resolve
                  </button>
                </div>
              ))}
              {!alerts.length && <div className="sr-card p-5 text-sm text-[var(--portal-muted)]">No active SOS alerts.</div>}
            </div>
          ) : (
            <div className="sr-card max-h-[480px] overflow-y-auto p-4">
              <p className="mb-2 text-xs text-[var(--portal-muted)]">Check-in interval: {safetyQ.data?.intervalMinutes ?? '—'} min</p>
              <ul className="space-y-2 text-sm">
                {officers.map((o) => (
                  <li key={o.userId} className="flex items-center justify-between gap-2 border-b border-[color:var(--portal-border)] pb-2">
                    <div className="min-w-0">
                      <div className="truncate text-[var(--portal-fg)]">{o.name || o.username}</div>
                      <div className="truncate text-[11px] text-[var(--portal-muted)]">
                        {o.post || o.lgaName || '—'} · 🔋 {o.batteryPct ?? '?'}% · {o.network ?? '?'}
                      </div>
                    </div>
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: SAFETY_COLOR[o.status] }}>
                      {o.status.replace('_', ' ')}
                    </span>
                  </li>
                ))}
                {!officers.length && <li className="text-[var(--portal-muted)]">No field officers in scope.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
