import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, Doughnut } from 'react-chartjs-2'
import { chartTooltipTheme } from '../../charts/register'
import { NigeriaMap } from '../../components/NigeriaMap'
import type { GeoFeatureCollection } from '../../components/operations-map-types'
import {
  PORTAL_PALETTE,
  SitRepComposer,
  SitRepFeedList,
  TACTICAL_PALETTE,
  useSitRepFeed,
  useSitRepSummary,
} from '../../components/sitreps'
import type { SitRepItem, SitRepSeverity } from '../../components/sitreps'
import { useAuth } from '../../contexts/AuthContext'
import type { UserJurisdiction } from '../../contexts/auth-types'
import { apiJson } from '../../lib/api'
import { postLoginPath } from '../../lib/navigation'

/* -------------------------------------------------------------------------- */
/* Shared types & helpers                                                      */
/* -------------------------------------------------------------------------- */

type Coverage = {
  scope: string
  states?: number
  lgas?: number
  wards?: number
  pollingUnits?: number
}

type NamedRow = { id: number; code: string; name: string }

type LevelAccent = {
  bar: string
  text: string
  chip: string
  glow: string
  label: string
}

const ACCENTS: Record<UserJurisdiction['level'], LevelAccent> = {
  national: {
    bar: 'bg-cyan-500',
    text: 'text-cyan-400',
    chip: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    glow: 'shadow-[0_0_10px_rgba(6,182,212,0.8)]',
    label: 'National command',
  },
  state: {
    bar: 'bg-blue-500',
    text: 'text-blue-400',
    chip: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.8)]',
    label: 'State command',
  },
  area: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-400',
    chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    glow: 'shadow-[0_0_10px_rgba(16,185,129,0.8)]',
    label: 'Area command',
  },
}

const SEV_PIN: Record<SitRepSeverity, 'green' | 'amber' | 'red'> = {
  low: 'green',
  medium: 'amber',
  critical: 'red',
}

const SEV_ORDER: SitRepSeverity[] = ['critical', 'medium', 'low']
const SEV_COLOR: Record<SitRepSeverity, string> = {
  critical: '#f43f5e',
  medium: '#f59e0b',
  low: '#10b981',
}

const num = new Intl.NumberFormat('en-NG')

function featureName(f: Record<string, unknown>): string {
  const p = f.properties as { name?: string } | undefined
  return p?.name ?? ''
}

function filterFeatures(gc: GeoFeatureCollection | undefined, name: string | null | undefined): GeoFeatureCollection | undefined {
  if (!gc || !name) return undefined
  const needle = name.toLowerCase()
  const features = gc.features.filter((f) => featureName(f).toLowerCase() === needle)
  return features.length ? { type: 'FeatureCollection', features } : undefined
}

function pinsFromFeed(items: SitRepItem[]) {
  return items
    .filter((i) => typeof i.lat === 'number' && typeof i.lng === 'number')
    .map((i) => ({
      lat: i.lat as number,
      lng: i.lng as number,
      label: `${i.title} — ${[i.lga, i.state].filter(Boolean).join(', ') || 'National'}`,
      severity: SEV_PIN[i.severity] ?? 'green' as const,
    }))
}

/** Aggregate feed rows into per-territory severity buckets. */
function territoryHeat(items: SitRepItem[], keyOf: (i: SitRepItem) => string | null) {
  const map = new Map<string, Record<SitRepSeverity, number>>()
  for (const item of items) {
    const key = keyOf(item)
    if (!key) continue
    const row = map.get(key) ?? { critical: 0, medium: 0, low: 0 }
    row[item.severity] = (row[item.severity] ?? 0) + 1
    map.set(key, row)
  }
  return [...map.entries()]
    .map(([name, counts]) => ({
      name,
      ...counts,
      total: counts.critical + counts.medium + counts.low,
    }))
    .sort((a, b) => b.critical - a.critical || b.total - a.total)
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function CommandSituationRoom() {
  const { user } = useAuth()
  const jurisdiction = user?.jurisdiction ?? { level: 'national' as const, stateId: null, stateName: null, lgaId: null, lgaName: null }
  const level = jurisdiction.level
  const accent = ACCENTS[level]

  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  /* ----- data ----- */
  const summaryQuery = useSitRepSummary()
  const feedQuery = useSitRepFeed({ limit: 200 })
  const items = useMemo(() => feedQuery.data?.sitreps ?? [], [feedQuery.data])
  const pins = useMemo(() => pinsFromFeed(items), [items])

  const statesGeoQuery = useQuery({
    queryKey: ['geo-layers-states'],
    queryFn: async () => {
      const res = await fetch('/api/geo/layers/states')
      if (!res.ok) throw new Error('Failed to load state boundaries')
      return (await res.json()) as GeoFeatureCollection
    },
    staleTime: 10 * 60_000,
  })

  const lgaLayerQuery = useQuery({
    queryKey: ['geo-layers-lgas', jurisdiction.stateId],
    queryFn: () => apiJson<GeoFeatureCollection>(`/api/geo/layers/lgas?stateId=${jurisdiction.stateId}`),
    enabled: level === 'area' && typeof jurisdiction.stateId === 'number',
    staleTime: 10 * 60_000,
  })

  const coverageQuery = useQuery({
    queryKey: ['geo-coverage', level, jurisdiction.stateId, jurisdiction.lgaId],
    queryFn: () =>
      apiJson<Coverage>(
        level === 'area' && jurisdiction.lgaId
          ? `/api/geography/coverage?lgaId=${jurisdiction.lgaId}`
          : level === 'state' && jurisdiction.stateId
            ? `/api/geography/coverage?stateId=${jurisdiction.stateId}`
            : '/api/geography/coverage',
      ),
    staleTime: 5 * 60_000,
  })

  const lgasQuery = useQuery({
    queryKey: ['geo-lgas', jurisdiction.stateId],
    queryFn: () => apiJson<{ lgas: NamedRow[] }>(`/api/geography/lgas?stateId=${jurisdiction.stateId}`),
    enabled: level === 'state' && typeof jurisdiction.stateId === 'number',
    staleTime: 10 * 60_000,
  })

  const wardsQuery = useQuery({
    queryKey: ['geo-wards', jurisdiction.lgaId],
    queryFn: () => apiJson<{ wards: NamedRow[] }>(`/api/geography/wards?lgaId=${jurisdiction.lgaId}`),
    enabled: level === 'area' && typeof jurisdiction.lgaId === 'number',
    staleTime: 10 * 60_000,
  })

  /* ----- scoped map geometry ----- */
  const scopedGeo = useMemo(() => {
    if (level === 'state') return filterFeatures(statesGeoQuery.data, jurisdiction.stateName)
    if (level === 'area') return filterFeatures(lgaLayerQuery.data, jurisdiction.lgaName)
    return statesGeoQuery.data
  }, [level, statesGeoQuery.data, lgaLayerQuery.data, jurisdiction.stateName, jurisdiction.lgaName])

  const scopedSelection = useMemo(() => {
    if (level === 'state' && jurisdiction.stateName) return [jurisdiction.stateName]
    if (level === 'area' && jurisdiction.lgaName) return [jurisdiction.lgaName]
    return [] as string[]
  }, [level, jurisdiction.stateName, jurisdiction.lgaName])

  /* ----- aggregations ----- */
  const stateHeat = useMemo(() => (level === 'national' ? territoryHeat(items, (i) => i.state) : []), [level, items])
  const lgaHeat = useMemo(() => (level === 'state' ? territoryHeat(items, (i) => i.lga) : []), [level, items])

  const summary = summaryQuery.data
  const critCount = summary?.bySeverity?.critical ?? 0
  const newCount = summary?.byStatus?.new ?? 0
  const escCount = summary?.byStatus?.escalated ?? 0

  const roomTitle =
    level === 'state'
      ? `${(jurisdiction.stateName ?? 'STATE').toUpperCase()} STATE COMMAND`
      : level === 'area'
        ? `${(jurisdiction.lgaName ?? 'AREA').toUpperCase()} AREA COMMAND`
        : 'FORCE HEADQUARTERS'

  const scopeLabel =
    level === 'state'
      ? `Files under: ${jurisdiction.stateName} State Command`
      : level === 'area'
        ? `Files under: ${jurisdiction.lgaName} Area Command${jurisdiction.stateName ? `, ${jurisdiction.stateName}` : ''}`
        : 'Files under: Force HQ (national)'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030906] font-(--font-syne) text-slate-300">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
        aria-hidden
      />

      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800/70 pb-4">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-2 ${accent.bar} ${accent.glow}`} />
            <div>
              <h1 className="text-2xl font-bold tracking-[0.08em] text-white sm:text-3xl">
                {roomTitle}
                <span className={accent.text}> · SITUATION ROOM</span>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 font-(--font-mono) text-[10px] uppercase tracking-[0.2em] text-slate-500">
                <span className={`flex items-center gap-1.5 ${accent.text}`}>
                  <span className={`size-1.5 animate-pulse rounded-full ${accent.bar}`} /> LIVE · {accent.label}
                </span>
                <span>//</span>
                <span>
                  {user?.username}
                  {level === 'state' ? ` · ${jurisdiction.stateName} only` : level === 'area' ? ` · ${jurisdiction.lgaName} only` : ' · all states'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Link
              to={user ? postLoginPath(user) : '/'}
              className="rounded border border-slate-700/70 px-3 py-1.5 font-(--font-mono) text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300"
            >
              ← Portal
            </Link>
            <div className="text-right">
              <div className="font-(--font-mono) text-2xl font-light tracking-tight text-white sm:text-3xl">
                {time.toLocaleTimeString('en-NG', { hour12: false })} <span className={`text-xl font-bold ${accent.text}`}>WAT</span>
              </div>
              <div className="font-(--font-mono) text-[10px] uppercase tracking-[0.15em] text-slate-500">
                {time.toLocaleDateString('en-NG', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

        {feedQuery.error ? (
          <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
            {feedQuery.error.message}
          </p>
        ) : null}

        {level === 'national' ? (
          <HqLayout
            accent={accent}
            summary={summary}
            items={items}
            pins={pins}
            statesGeo={scopedGeo}
            stateHeat={stateHeat}
            coverage={coverageQuery.data}
            critCount={critCount}
            newCount={newCount}
            escCount={escCount}
            scopeLabel={scopeLabel}
          />
        ) : level === 'state' ? (
          <StateLayout
            accent={accent}
            jurisdiction={jurisdiction}
            items={items}
            pins={pins}
            statesGeo={scopedGeo}
            selection={scopedSelection}
            lgaHeat={lgaHeat}
            lgas={lgasQuery.data?.lgas ?? []}
            coverage={coverageQuery.data}
            critCount={critCount}
            newCount={newCount}
            escCount={escCount}
            scopeLabel={scopeLabel}
          />
        ) : (
          <AreaLayout
            accent={accent}
            jurisdiction={jurisdiction}
            items={items}
            pins={pins}
            statesGeo={scopedGeo}
            selection={scopedSelection}
            wards={wardsQuery.data?.wards ?? []}
            coverage={coverageQuery.data}
            critCount={critCount}
            newCount={newCount}
            escCount={escCount}
            scopeLabel={scopeLabel}
          />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: LevelAccent }) {
  return (
    <div className="rounded-lg border border-slate-800/70 bg-slate-900/50 p-4 backdrop-blur-xl">
      <div className="font-(--font-mono) text-[10px] uppercase tracking-[0.15em] text-slate-500">{label}</div>
      <div className={`mt-1.5 font-(--font-syne) text-3xl font-bold tracking-tight ${accent.text}`}>{value}</div>
      <div className="mt-1 font-(--font-mono) text-[9px] uppercase tracking-widest text-slate-600">{hint}</div>
    </div>
  )
}

function Panel({
  title,
  accent,
  children,
  className = '',
  pad = true,
}: {
  title: string
  accent: LevelAccent
  children: React.ReactNode
  className?: string
  pad?: boolean
}) {
  return (
    <section className={`rounded-xl border border-slate-800/70 bg-slate-900/40 shadow-2xl backdrop-blur-2xl ${pad ? 'p-4' : ''} ${className}`}>
      <div className={`flex items-center gap-2.5 ${pad ? 'mb-3 border-b border-slate-800/60 pb-2.5' : 'p-4 pb-0'}`}>
        <span className={`h-3 w-1 ${accent.bar}`} aria-hidden />
        <h2 className="font-(--font-mono) text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function SeverityDoughnut({ summary }: { summary: ReturnType<typeof useSitRepSummary>['data'] }) {
  const data = {
    labels: SEV_ORDER.map((s) => s.toUpperCase()),
    datasets: [
      {
        data: SEV_ORDER.map((s) => summary?.bySeverity?.[s] ?? 0),
        backgroundColor: SEV_ORDER.map((s) => `${SEV_COLOR[s]}cc`),
        borderColor: '#0f172a',
        borderWidth: 2,
      },
    ],
  }
  return (
    <div className="mx-auto h-[180px] max-w-[260px]">
      <Doughnut
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'monospace', size: 10 } } },
            tooltip: chartTooltipTheme(),
          },
          cutout: '72%',
        }}
      />
    </div>
  )
}

function KindBar({ summary }: { summary: ReturnType<typeof useSitRepSummary>['data'] }) {
  const kinds = ['sitrep', 'incident', 'violence']
  const data = {
    labels: kinds.map((k) => k.toUpperCase()),
    datasets: [
      {
        data: kinds.map((k) => summary?.byKind?.[k] ?? 0),
        backgroundColor: ['rgba(6,182,212,0.7)', 'rgba(245,158,11,0.7)', 'rgba(244,63,94,0.75)'],
        borderWidth: 0,
        borderRadius: 3,
      },
    ],
  }
  return (
    <div className="h-[160px]">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
          scales: {
            x: { ticks: { color: '#64748b', font: { family: 'monospace', size: 9 } }, grid: { display: false } },
            y: { ticks: { color: '#64748b', font: { family: 'monospace', size: 9 }, precision: 0 }, grid: { color: 'rgba(30,41,59,0.5)' } },
          },
        }}
      />
    </div>
  )
}

function HeatTable({
  rows,
  allNames,
  unitLabel,
}: {
  rows: Array<{ name: string; critical: number; medium: number; low: number; total: number }>
  allNames?: string[]
  unitLabel: string
}) {
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]))
  const merged = allNames?.length
    ? allNames.map((n) => byName.get(n.toLowerCase()) ?? { name: n, critical: 0, medium: 0, low: 0, total: 0 })
    : rows
  if (!merged.length) {
    return <p className="px-1 py-4 text-center text-xs text-slate-500">No reports yet — all quiet.</p>
  }
  return (
    <div className="max-h-[320px] overflow-y-auto pr-1">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="font-(--font-mono) text-[9px] uppercase tracking-widest text-slate-500">
            <th className="pb-2 pr-2">{unitLabel}</th>
            <th className="pb-2 pr-2 text-right text-rose-400">Crit</th>
            <th className="pb-2 pr-2 text-right text-amber-400">Med</th>
            <th className="pb-2 pr-2 text-right text-emerald-400">Low</th>
            <th className="pb-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {merged.map((r) => (
            <tr key={r.name} className="border-t border-slate-800/50">
              <td className="py-1.5 pr-2 font-medium text-slate-300">{r.name}</td>
              <td className={`py-1.5 pr-2 text-right font-(--font-mono) ${r.critical ? 'font-bold text-rose-400' : 'text-slate-600'}`}>{r.critical}</td>
              <td className={`py-1.5 pr-2 text-right font-(--font-mono) ${r.medium ? 'text-amber-400' : 'text-slate-600'}`}>{r.medium}</td>
              <td className={`py-1.5 pr-2 text-right font-(--font-mono) ${r.low ? 'text-emerald-400' : 'text-slate-600'}`}>{r.low}</td>
              <td className="py-1.5 text-right font-(--font-mono) text-slate-400">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* HQ layout — national theatre                                                */
/* -------------------------------------------------------------------------- */

function HqLayout({
  accent,
  summary,
  items,
  pins,
  statesGeo,
  stateHeat,
  coverage,
  critCount,
  newCount,
  escCount,
  scopeLabel,
}: {
  accent: LevelAccent
  summary: ReturnType<typeof useSitRepSummary>['data']
  items: SitRepItem[]
  pins: ReturnType<typeof pinsFromFeed>
  statesGeo: GeoFeatureCollection | undefined
  stateHeat: ReturnType<typeof territoryHeat>
  coverage: Coverage | undefined
  critCount: number
  newCount: number
  escCount: number
  scopeLabel: string
}) {
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Reports (all tiers)" value={num.format(summary?.total ?? 0)} hint="Command + field captures" accent={accent} />
        <Kpi label="Critical open" value={num.format(critCount)} hint="Require immediate action" accent={accent} />
        <Kpi label="Awaiting ack" value={num.format(newCount)} hint="New, unacknowledged" accent={accent} />
        <Kpi
          label="National footprint"
          value={coverage ? `${coverage.states ?? '—'} / ${num.format(coverage.pollingUnits ?? 0)}` : '—'}
          hint="States / polling units"
          accent={accent}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="flex flex-col gap-5 xl:col-span-3">
          <Panel title="Severity mix" accent={accent}>
            <SeverityDoughnut summary={summary} />
          </Panel>
          <Panel title="Report kinds" accent={accent}>
            <KindBar summary={summary} />
          </Panel>
          <Panel title="Escalated" accent={accent}>
            <p className="font-(--font-syne) text-4xl font-bold text-rose-400">{num.format(escCount)}</p>
            <p className="mt-1 font-(--font-mono) text-[9px] uppercase tracking-widest text-slate-600">
              Climbing the chain right now
            </p>
          </Panel>
        </div>

        <div className="xl:col-span-5">
          <Panel title="National theatre" accent={accent} pad={false} className="flex h-full flex-col overflow-hidden">
            <div className="min-h-[420px] flex-1 p-2 saturate-[0.75]">
              <NigeriaMap pins={pins} statesGeo={statesGeo} height="100%" hint="" />
            </div>
          </Panel>
        </div>

        <div className="xl:col-span-4">
          <Panel title="Live national feed" accent={accent} className="flex max-h-[560px] flex-col">
            <div className="flex-1 overflow-y-auto pr-1">
              <SitRepFeedList items={items} palette={TACTICAL_PALETTE} emptyHint="No reports nationwide yet." />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Panel title="State heat — all 36 states + FCT" accent={accent} className="xl:col-span-5">
          <HeatTable rows={stateHeat} unitLabel="State" />
        </Panel>
        <Panel title="File a national directive / SitRep" accent={accent} className="xl:col-span-7">
          <SitRepComposer palette={TACTICAL_PALETTE} scopeLabel={scopeLabel} />
        </Panel>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* State layout — one state only                                               */
/* -------------------------------------------------------------------------- */

function StateLayout({
  accent,
  jurisdiction,
  items,
  pins,
  statesGeo,
  selection,
  lgaHeat,
  lgas,
  coverage,
  critCount,
  newCount,
  escCount,
  scopeLabel,
}: {
  accent: LevelAccent
  jurisdiction: UserJurisdiction
  items: SitRepItem[]
  pins: ReturnType<typeof pinsFromFeed>
  statesGeo: GeoFeatureCollection | undefined
  selection: string[]
  lgaHeat: ReturnType<typeof territoryHeat>
  lgas: NamedRow[]
  coverage: Coverage | undefined
  critCount: number
  newCount: number
  escCount: number
  scopeLabel: string
}) {
  return (
    <>
      <div className={`mb-5 rounded-xl border ${accent.chip} px-4 py-3`}>
        <p className="font-(--font-mono) text-[10px] uppercase tracking-[0.2em]">
          Jurisdiction lock — this console reads and writes <strong>{jurisdiction.stateName} State</strong> data only
        </p>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Reports in state" value={num.format(items.length)} hint="Current window" accent={accent} />
        <Kpi label="Critical" value={num.format(critCount)} hint="In-state, open" accent={accent} />
        <Kpi label="Awaiting ack" value={num.format(newCount)} hint="Needs desk action" accent={accent} />
        <Kpi label="Escalated" value={num.format(escCount)} hint="Up to FHQ / zonal" accent={accent} />
        <Kpi
          label="Territory"
          value={coverage ? `${coverage.lgas ?? '—'} LGAs` : '—'}
          hint={coverage ? `${num.format(coverage.wards ?? 0)} wards · ${num.format(coverage.pollingUnits ?? 0)} PUs` : 'Loading…'}
          accent={accent}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Panel
            title={`${(jurisdiction.stateName ?? '').toUpperCase()} operations map`}
            accent={accent}
            pad={false}
            className="flex h-full flex-col overflow-hidden"
          >
            <div className="min-h-[440px] flex-1 p-2 saturate-[0.75]">
              <NigeriaMap pins={pins} statesGeo={statesGeo} selectedStates={selection} height="100%" hint="" />
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-5 xl:col-span-5">
          <Panel title="LGA watchlist" accent={accent}>
            <HeatTable rows={lgaHeat} allNames={lgas.map((l) => l.name)} unitLabel="LGA" />
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Panel title={`${jurisdiction.stateName} live feed`} accent={accent} className="flex max-h-[520px] flex-col xl:col-span-7">
          <div className="flex-1 overflow-y-auto pr-1">
            <SitRepFeedList
              items={items}
              palette={TACTICAL_PALETTE}
              emptyHint={`No reports from ${jurisdiction.stateName} yet.`}
            />
          </div>
        </Panel>
        <Panel title="File a state command report" accent={accent} className="xl:col-span-5">
          <SitRepComposer palette={TACTICAL_PALETTE} scopeLabel={scopeLabel} />
        </Panel>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Area layout — one LGA only                                                  */
/* -------------------------------------------------------------------------- */

function AreaLayout({
  accent,
  jurisdiction,
  items,
  pins,
  statesGeo,
  selection,
  wards,
  coverage,
  critCount,
  newCount,
  escCount,
  scopeLabel,
}: {
  accent: LevelAccent
  jurisdiction: UserJurisdiction
  items: SitRepItem[]
  pins: ReturnType<typeof pinsFromFeed>
  statesGeo: GeoFeatureCollection | undefined
  selection: string[]
  wards: NamedRow[]
  coverage: Coverage | undefined
  critCount: number
  newCount: number
  escCount: number
  scopeLabel: string
}) {
  return (
    <>
      <div className={`mb-5 rounded-xl border ${accent.chip} px-4 py-3`}>
        <p className="font-(--font-mono) text-[10px] uppercase tracking-[0.2em]">
          Jurisdiction lock — this console reads and writes <strong>{jurisdiction.lgaName} LGA</strong>
          {jurisdiction.stateName ? <> ({jurisdiction.stateName} State)</> : null} data only
        </p>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Reports in LGA" value={num.format(items.length)} hint="Current window" accent={accent} />
        <Kpi label="Critical" value={num.format(critCount)} hint="In-LGA, open" accent={accent} />
        <Kpi
          label="Wards"
          value={coverage ? num.format(coverage.wards ?? wards.length) : num.format(wards.length)}
          hint="Under this area command"
          accent={accent}
        />
        <Kpi
          label="Polling units"
          value={coverage ? num.format(coverage.pollingUnits ?? 0) : '—'}
          hint={newCount ? `${newCount} reports awaiting ack` : 'All acknowledged'}
          accent={accent}
        />
      </div>

      {wards.length ? (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {wards.map((w) => (
            <span
              key={w.id}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-(--font-mono) text-[9px] uppercase tracking-wider text-emerald-300/80"
            >
              {w.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-12">
        <Panel title={`${jurisdiction.lgaName} live feed`} accent={accent} className="flex max-h-[560px] flex-col xl:col-span-5">
          <div className="flex-1 overflow-y-auto pr-1">
            <SitRepFeedList
              items={items}
              palette={TACTICAL_PALETTE}
              emptyHint={`No reports from ${jurisdiction.lgaName} yet.`}
            />
          </div>
        </Panel>

        <div className="flex flex-col gap-5 xl:col-span-7">
          <Panel title="Area operations map" accent={accent} pad={false} className="overflow-hidden">
            <div className="min-h-[300px] p-2 saturate-[0.75]">
              <NigeriaMap pins={pins} statesGeo={statesGeo} selectedStates={selection} height="300px" hint="" />
            </div>
          </Panel>
          <Panel title="File an area command report" accent={accent}>
            <SitRepComposer palette={TACTICAL_PALETTE} scopeLabel={scopeLabel} />
          </Panel>
          <Panel title="Escalation path" accent={accent}>
            <p className="text-xs leading-relaxed text-slate-400">
              Unresolved criticals escalate <span className="text-emerald-300">Area → {jurisdiction.stateName ?? 'State'} Command →
              Zonal → Force HQ</span>. Escalated in-LGA: <span className="font-(--font-mono) text-rose-400">{escCount}</span>.
            </p>
          </Panel>
        </div>
      </div>
    </>
  )
}

/* Re-export for portal pages that embed the portal-palette feed */
export { PORTAL_PALETTE }
