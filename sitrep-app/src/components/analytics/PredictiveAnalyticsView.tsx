import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

interface RiskArea {
  lgaId: number
  lgaName: string
  stateName: string
  score: number
  band: 'low' | 'medium' | 'high' | 'critical'
  incidents: number
  criticalIncidents: number
  unresolved: number
  recent8h: number
  previous8h: number
  trend: 'rising' | 'stable' | 'falling'
}

interface RiskMapResponse {
  windowHours: number
  scope: string
  areas: RiskArea[]
}

interface Hotspot {
  wardId: number | null
  wardName: string
  lgaName: string
  stateName: string
  recentCount: number
  baselineCount: number
  acceleration: number
  topType: { code: string; count: number } | null
  centroid: { lat: number; lng: number } | null
}

interface HotspotsResponse {
  recentHours: number
  baselineHours: number
  hotspots: Hotspot[]
}

interface ForecastResponse {
  windowHours: number
  history: { hourOffset: number; count: number }[]
  forecast: { hourOffset: number; predictedIncidents: number }[]
  staffing: { hourOffset: number; predictedIncidents: number; officers: number }[]
  riskBand: string
  topTypes: { code: string; count: number }[]
  scope: string
}

interface TrendsResponse {
  windowHours: number
  byType: { code: string; label: string; count: number; previousCount: number; trend: string }[]
  bySeverity: { severity: string; count: number }[]
  byState: { state: string; count: number; avgWeight: number }[]
  escalationMix: { escalation_level: string; count: number }[]
  sla: {
    total: number
    acknowledged: number
    resolved: number
    withinSla: number
    slaCompliancePct: number | null
    avgAckMinutes: number | null
    avgResolveMinutes: number | null
  }
}

interface SafetyResponse {
  checkin: { officersReporting: number; compliant: number; compliancePct: number | null; overdue: number }
  battery: { reporting: number; bands: { critical: number; low: number; moderate: number; healthy: number }; lowest: number | null }
  sos: { total: number; active: number; avgResponseMinutes: number | null; byState: { state: string; count: number }[] }
}

const bandColor: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/40',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/40',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
  low: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40',
}

const trendIcon: Record<string, string> = { rising: '▲', stable: '—', falling: '▼' }
const trendColor: Record<string, string> = { rising: 'text-red-400', stable: 'text-slate-400', falling: 'text-emerald-400' }

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle ? <span className="text-xs text-slate-400">{subtitle}</span> : null}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {hint ? <div className="text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  )
}

function MiniBars({ values, max }: { values: number[]; max: number }) {
  const cap = Math.max(1, max)
  return (
    <div className="flex h-16 items-end gap-[3px]">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-full min-w-[3px] rounded-t bg-cyan-500/70"
          style={{ height: `${Math.max(2, (v / cap) * 100)}%` }}
          title={String(v)}
        />
      ))}
    </div>
  )
}

export const PredictiveAnalyticsView: React.FC = () => {
  const riskQ = useQuery({
    queryKey: ['analytics', 'risk-map'],
    queryFn: () => apiJson<RiskMapResponse>('/api/analytics/risk-map?hours=72'),
    refetchInterval: 60_000,
  })
  const hotQ = useQuery({
    queryKey: ['analytics', 'hotspots'],
    queryFn: () => apiJson<HotspotsResponse>('/api/analytics/hotspots?recentHours=6&baselineHours=24'),
    refetchInterval: 60_000,
  })
  const fcQ = useQuery({
    queryKey: ['analytics', 'forecast'],
    queryFn: () => apiJson<ForecastResponse>('/api/analytics/forecast?hours=24&predict=6'),
    refetchInterval: 60_000,
  })
  const trendQ = useQuery({
    queryKey: ['analytics', 'trends'],
    queryFn: () => apiJson<TrendsResponse>('/api/analytics/incident-trends?hours=48'),
    refetchInterval: 60_000,
  })
  const safetyQ = useQuery({
    queryKey: ['analytics', 'safety'],
    queryFn: () => apiJson<SafetyResponse>('/api/analytics/officer-safety?hours=24'),
    refetchInterval: 60_000,
  })

  const loading = riskQ.isLoading || fcQ.isLoading
  const error = riskQ.error || fcQ.error || trendQ.error

  if (loading) {
    return <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 text-slate-300">Loading predictive analytics…</div>
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-300">
        Could not load predictive analytics. Ensure the API is reachable.
      </div>
    )
  }

  const risk = riskQ.data
  const hot = hotQ.data
  const fc = fcQ.data
  const trends = trendQ.data
  const safety = safetyQ.data
  const topAreas = (risk?.areas ?? []).slice(0, 12)
  const historyCounts = fc?.history.map((h) => h.count) ?? []
  const forecastValues = fc?.forecast.map((f) => f.predictedIncidents) ?? []
  const chartMax = Math.max(1, ...historyCounts, ...forecastValues)
  const nextHour = fc?.staffing?.[0]

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Predictive Crime Analytics</h2>
          <p className="text-xs text-slate-400">
            Risk scoring, hotspot detection, incident forecasting, and SLA analytics — jurisdiction-scoped
            (current scope: {risk?.scope ?? fc?.scope ?? '—'}).
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Highest risk LGA"
          value={topAreas[0] ? topAreas[0].lgaName : '—'}
          hint={topAreas[0] ? `${topAreas[0].score}/100 · ${topAreas[0].band} · ${topAreas[0].stateName}` : 'no incidents in window'}
        />
        <Stat label="Emerging hotspots" value={hot?.hotspots.length ?? 0} hint={`last ${hot?.recentHours ?? 6}h vs baseline`} />
        <Stat
          label="Forecast next hour"
          value={nextHour ? nextHour.predictedIncidents : '—'}
          hint={nextHour ? `recommend ${nextHour.officers} officers on standby` : ''}
        />
        <Stat
          label="SLA compliance"
          value={trends?.sla.slaCompliancePct != null ? `${trends.sla.slaCompliancePct}%` : '—'}
          hint={`avg ack ${trends?.sla.avgAckMinutes ?? '—'}m · resolve ${trends?.sla.avgResolveMinutes ?? '—'}m`}
        />
      </div>

      {/* Risk table + hotspot list */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="LGA risk map" subtitle={`last ${risk?.windowHours ?? 72}h · severity × recency weighted`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2 pr-2 font-medium">LGA</th>
                  <th className="pb-2 pr-2 font-medium">Score</th>
                  <th className="pb-2 pr-2 font-medium">Band</th>
                  <th className="pb-2 pr-2 font-medium">Incid.</th>
                  <th className="pb-2 pr-2 font-medium">Open</th>
                  <th className="pb-2 font-medium">8h trend</th>
                </tr>
              </thead>
              <tbody>
                {topAreas.map((a) => (
                  <tr key={a.lgaId} className="border-t border-slate-800">
                    <td className="py-1.5 pr-2 text-white">
                      {a.lgaName}
                      <span className="block text-[10px] text-slate-500">{a.stateName}</span>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-white">{a.score}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${bandColor[a.band]}`}>{a.band}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-slate-300">{a.incidents}</td>
                    <td className="py-1.5 pr-2 text-slate-300">{a.unresolved}</td>
                    <td className={`py-1.5 font-semibold ${trendColor[a.trend]}`}>
                      {trendIcon[a.trend]} {a.recent8h}/{a.previous8h}
                    </td>
                  </tr>
                ))}
                {topAreas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      No incidents recorded in the analysis window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Emerging hotspots" subtitle={`≥3 incidents & ≥1.5× baseline rate`}>
          <div className="space-y-2">
            {(hot?.hotspots ?? []).map((h, idx) => (
              <div key={`${h.wardId ?? 'lga'}-${idx}`} className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white">{h.wardName}</div>
                  <span className="text-[10px] font-bold text-red-400">{h.acceleration}× baseline</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  {h.lgaName}, {h.stateName} · {h.recentCount} recent vs {h.baselineCount} baseline
                  {h.topType ? ` · mostly ${h.topType.code.replace(/_/g, ' ')} (${h.topType.count})` : ''}
                </div>
              </div>
            ))}
            {(hot?.hotspots.length ?? 0) === 0 && (
              <div className="py-4 text-center text-xs text-slate-500">No emerging hotspots detected — incident rate is within baseline.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Forecast */}
      <Card title="Incident forecast & staffing" subtitle={`24h history → 6h WMA forecast · band: ${fc?.riskBand ?? '—'}`}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MiniBars values={[...historyCounts, ...forecastValues.map((v) => -v)].map((v) => Math.abs(v))} max={chartMax} />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>−24h</span>
              <span className="text-cyan-400">▲ history</span>
              <span className="text-amber-400">forecast +6h</span>
              <span>now</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Top types:{' '}
              {(fc?.topTypes ?? []).map((t) => `${t.code.replace(/_/g, ' ')} (${t.count})`).join(' · ') || '—'}
            </div>
          </div>
          <div className="space-y-1.5">
            {(fc?.staffing ?? []).map((s) => (
              <div key={s.hourOffset} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs">
                <span className="text-slate-300">+{s.hourOffset}h</span>
                <span className="text-white">{s.predictedIncidents} predicted</span>
                <span className="font-semibold text-cyan-300">{s.officers} officers</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Trends + safety */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Incident trends" subtitle={`last ${trends?.windowHours ?? 48}h`}>
          <div className="space-y-1">
            {(trends?.byType ?? []).slice(0, 8).map((t) => (
              <div key={t.code} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-1.5 text-xs">
                <span className="text-slate-200">{t.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-white">{t.count}</span>
                  <span className="text-[10px] text-slate-500">vs {t.previousCount}</span>
                  <span className={`font-semibold ${trendColor[t.trend] ?? ''}`}>{trendIcon[t.trend] ?? '—'}</span>
                </span>
              </div>
            ))}
            {(trends?.byType.length ?? 0) === 0 && <div className="py-4 text-center text-xs text-slate-500">No incidents in window.</div>}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-slate-800/60 px-2 py-1.5">
              <div className="text-slate-400">Total</div>
              <div className="text-sm font-bold text-white">{trends?.sla.total ?? 0}</div>
            </div>
            <div className="rounded-lg bg-slate-800/60 px-2 py-1.5">
              <div className="text-slate-400">Resolved</div>
              <div className="text-sm font-bold text-emerald-300">{trends?.sla.resolved ?? 0}</div>
            </div>
            <div className="rounded-lg bg-slate-800/60 px-2 py-1.5">
              <div className="text-slate-400">Within SLA</div>
              <div className="text-sm font-bold text-cyan-300">{trends?.sla.withinSla ?? 0}</div>
            </div>
          </div>
        </Card>

        <Card title="Officer safety analytics" subtitle="check-ins · battery · SOS">
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-slate-800/60 px-2 py-2">
              <div className="text-slate-400">Check-in</div>
              <div className="text-sm font-bold text-white">{safety?.checkin.compliancePct ?? '—'}%</div>
              <div className="text-[10px] text-slate-500">{safety?.checkin.compliant ?? 0}/{safety?.checkin.officersReporting ?? 0} on time</div>
            </div>
            <div className="rounded-lg bg-slate-800/60 px-2 py-2">
              <div className="text-slate-400">Battery &lt;20%</div>
              <div className="text-sm font-bold text-red-400">{safety?.battery.bands.critical ?? 0}</div>
              <div className="text-[10px] text-slate-500">lowest {safety?.battery.lowest ?? '—'}%</div>
            </div>
            <div className="rounded-lg bg-slate-800/60 px-2 py-2">
              <div className="text-slate-400">SOS active</div>
              <div className="text-sm font-bold text-red-400">{safety?.sos.active ?? 0}</div>
              <div className="text-[10px] text-slate-500">resp {safety?.sos.avgResponseMinutes ?? '—'}m</div>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {(safety?.sos.byState ?? []).slice(0, 5).map((s) => (
              <div key={s.state} className="flex justify-between rounded-lg border border-slate-800 px-3 py-1.5 text-xs">
                <span className="text-slate-300">{s.state}</span>
                <span className="font-semibold text-white">{s.count} SOS</span>
              </div>
            ))}
            {(safety?.sos.byState.length ?? 0) === 0 && (
              <div className="py-3 text-center text-xs text-slate-500">No SOS alerts in the last 24h.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
