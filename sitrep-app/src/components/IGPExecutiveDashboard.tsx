import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { generateDashboardPDF } from '../lib/pdfGenerator'
import { chartColors } from '../charts/register'

export type IGPExecutiveDashboardProps = {
  // Existing real backend data
  kpis: {
    registeredPus: number
    activeFieldOfficers: number
    pendingApprovals: number
    partiesRegistered: number
  }
  geography: {
    statesAndFct: number
    lgas: number
    wards: number
    pollingUnits: number
  }
  readiness: {
    items: { label: string; status: string }[]
    readinessPercent: number
  }
  isLoading: boolean
  isError: boolean
}

// ----------------------------------------------------------------------
// Mock Data Generators for the new premium requirements
// ----------------------------------------------------------------------

const SEVERITIES = ['low', 'medium', 'critical'] as const

const CRISIS_CATEGORIES = [
  'Ballot Snatching',
  'Voter Intimidation',
  'Bimodal Voter Auth System (BVAS) Failure',
  'Logistics Delay',
  'Police Absence',
  'Armed Thuggery',
  'Vote Buying',
  'Curfew Violation'
]

import { NIGERIAN_REGIONS } from '../lib/nigerianRegions'

/**
 * Deterministic pseudo-random value derived from a string seed.
 * Pure (safe to call during render) and stable across re-renders.
 */
const seededValue = (seed: string, min: number, range: number): number => {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  }
  return min + (h % range)
}

const getRandomLocation = () => {
  const zones = Object.keys(NIGERIAN_REGIONS)
  const zone = zones[Math.floor(Math.random() * zones.length)]
  const states = Object.keys(NIGERIAN_REGIONS[zone])
  const state = states[Math.floor(Math.random() * states.length)]
  const lgas = NIGERIAN_REGIONS[zone][state]
  const lga = lgas[Math.floor(Math.random() * lgas.length)]
  return { zone, state, lga }
}

const generateMockIncidents = () => {
  return Array.from({ length: 45 }).map((_, i) => {
    const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)]
    const loc = getRandomLocation()
    return {
      id: `inc-${i}`,
      time: new Date(Date.now() - Math.floor(Math.random() * 7200000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...loc,
      category: CRISIS_CATEGORIES[Math.floor(Math.random() * CRISIS_CATEGORIES.length)],
      severity,
      description: `Reported issue requires immediate Situation Room assessment.`
    }
  }).sort((a, b) => b.time.localeCompare(a.time))
}

const generateMockSitReps = () => {
  return Array.from({ length: 25 }).map((_, i) => ({
    id: `sr-${i}`,
    timestamp: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    phase: ['Pre', 'D-Day', 'Post'][Math.floor(Math.random() * 3)],
    ...getRandomLocation(),
    officer: `Insp. ${['Okoro', 'Bello', 'Ade', 'Eze', 'Danladi'][Math.floor(Math.random() * 5)]}`,
  }))
}

// ----------------------------------------------------------------------
// UI Components
// ----------------------------------------------------------------------

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="font-(--font-mono) text-lg font-bold text-white tabular-nums tracking-widest">
      {time.toLocaleTimeString('en-NG', { hour12: false })} <span className="text-[#00c46a]">WAT</span>
    </div>
  )
}

function SyncIndicator() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[#d9b64a]/30 bg-[#d9b64a]/10 px-3 py-1">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#d9b64a] opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#d9b64a]"></span>
      </span>
      <span className="font-(--font-mono) text-[10px] uppercase font-bold text-[#d9b64a] tracking-wider">Live Sync</span>
    </div>
  )
}

type KpiCardProps = {
  title: string
  value: ReactNode
  subtitle?: string
  icon: ReactNode
  highlightClass: string
}

function KpiCard({ title, value, subtitle, icon, highlightClass }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#0a1510]/80 p-5 backdrop-blur-xl shadow-2xl transition-all duration-300 hover:border-white/10 hover:bg-[#101f18]">
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl ${highlightClass}`}></div>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-(--font-mono) text-[10px] uppercase tracking-widest text-[var(--portal-muted)]">{title}</p>
          <div className="mt-2 font-(--font-syne) text-3xl font-extrabold text-white">{value}</div>
          {subtitle && <p className={`mt-1 text-xs font-medium ${highlightClass.split(' ').find((cls: string) => cls.startsWith('text-')) ?? 'text-white'}`}>{subtitle}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-xl">
          {icon}
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Main Dashboard
// ----------------------------------------------------------------------

export function IGPExecutiveDashboard({ kpis, geography, readiness, isLoading, isError }: IGPExecutiveDashboardProps) {
  // Region Filter State
  const [selectedZone, setSelectedZone] = useState<string>('All')
  const [selectedState, setSelectedState] = useState<string>('All')
  const [selectedLga, setSelectedLga] = useState<string>('All')

  // Reset cascades — handled in the select onChange handlers below

  // Use useMemo for mock data so it doesn't regenerate every render
  const allIncidents = useMemo(() => generateMockIncidents(), [])
  const allSitreps = useMemo(() => generateMockSitReps(), [])

  // Filter Data based on Geographic Probes
  const incidents = useMemo(() => {
    return allIncidents.filter(i => {
      if (selectedZone !== 'All' && i.zone !== selectedZone) return false
      if (selectedState !== 'All' && i.state !== selectedState) return false
      if (selectedLga !== 'All' && i.lga !== selectedLga) return false
      return true
    })
  }, [allIncidents, selectedZone, selectedState, selectedLga])

  const sitreps = useMemo(() => {
    return allSitreps.filter(s => {
      if (selectedZone !== 'All' && s.zone !== selectedZone) return false
      if (selectedState !== 'All' && s.state !== selectedState) return false
      if (selectedLga !== 'All' && s.lga !== selectedLga) return false
      return true
    })
  }, [allSitreps, selectedZone, selectedState, selectedLga])
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const handleGeneratePdf = async (title: string) => {
    setIsGeneratingPdf(true)
    try {
      await generateDashboardPDF('igp-dashboard-content', title)
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-NG').format(n)
  const openReadiness = readiness.items.length - readiness.items.filter((item) => item.status === 'done').length
  const criticalIncidents = incidents.filter((i) => i.severity === 'critical').length
  const mediumIncidents = incidents.filter((i) => i.severity === 'medium').length
  const incidentPosture = criticalIncidents > 6 ? 'Elevated' : mediumIncidents > 8 ? 'Heightened' : 'Stable'
  const regionLabel = selectedLga !== 'All' ? selectedLga : selectedState !== 'All' ? selectedState : selectedZone !== 'All' ? selectedZone : 'National'

  // Derived state list for the charts based on selection
  const chartStates = useMemo(() => {
    if (selectedState !== 'All') return [selectedState]
    if (selectedZone !== 'All') return Object.keys(NIGERIAN_REGIONS[selectedZone])
    return Object.values(NIGERIAN_REGIONS).flatMap((z) => Object.keys(z))
  }, [selectedZone, selectedState])

  // Chart Data: Threat Level by State
  const threatLevelData = useMemo(() => ({
    labels: chartStates,
    datasets: [{
      label: 'Volatility Index',
      data: chartStates.map((s) => seededValue(`volatility:${s}`, 20, 70)),
      backgroundColor: (ctx: { raw: unknown }) => {
        const val = Number(ctx.raw)
        if (val > 75) return '#ef4444' // red
        if (val > 40) return '#f59e0b' // amber
        return '#d9b64a' // green
      },
      borderRadius: 4,
    }],
  }), [chartStates])

  // Chart Data: Crisis Type Breakdown
  const crisisTypeData = useMemo(() => ({
    labels: CRISIS_CATEGORIES,
    datasets: [{
      data: CRISIS_CATEGORIES.map((c) => seededValue(`crisis:${c}`, 0, 50)),
      backgroundColor: [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', 
        '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'
      ],
      borderWidth: 0,
    }]
  }), [])

  const readinessDonut = useMemo(() => ({
    labels: ['Readiness index', 'Open items'],
    datasets: [{
      data: [readiness?.readinessPercent || 0, Math.max(0, 100 - (readiness?.readinessPercent || 0))],
      backgroundColor: [chartColors.green, 'rgba(255,255,255,0.05)'],
      borderColor: 'transparent',
      borderWidth: 0,
      cutout: '80%',
    }],
  }), [readiness])

  if (isLoading) return <div className="p-12 text-center text-[var(--portal-muted)]">Initializing Secure Command Link...</div>
  if (isError) return <div className="p-12 text-center text-[#ef4444]">Secure connection failed. Retrying...</div>

  return (
    <div className="min-h-screen bg-[#040b08] p-4 sm:p-6 text-slate-300 selection:bg-[#d9b64a]/30">
      
      {/* TOP BAR */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/5 bg-[#0a1510]/60 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-red-500/20 px-3 py-1.5 border border-red-500/30">
            <span className="font-(--font-mono) text-[11px] font-bold tracking-[0.2em] text-red-400">RESTRICTED // IGP EYES ONLY</span>
          </div>
          <h1 className="font-(--font-syne) text-xl font-bold text-white hidden md:block">National Situation Room</h1>
        </div>
        <div className="flex items-center gap-6">
          <SyncIndicator />
          <div className="h-6 w-px bg-white/10"></div>
          <LiveClock />
        </div>
      </header>

      {/* GEOGRAPHIC PROBE BAR */}
      <div className="mb-6 rounded-2xl border border-[#00c46a]/20 bg-[#0a1510]/80 p-4 backdrop-blur-xl shadow-[0_0_20px_rgba(0,196,106,0.05)]">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-2 mr-4 shrink-0">
            <span className="text-xl">📍</span>
            <span className="font-(--font-syne) text-sm font-bold text-white uppercase tracking-wider">Geographic Probe</span>
          </div>
          
          <select 
            aria-label="Select geopolitical zone"
            value={selectedZone} 
            onChange={e => { setSelectedZone(e.target.value); setSelectedState('All'); setSelectedLga('All') }}
            className="w-full sm:w-auto rounded-lg border border-white/10 bg-[#040b08] px-4 py-2 text-sm text-white focus:border-[#00c46a] focus:outline-none"
          >
            <option value="All">All Geopolitical Zones</option>
            {Object.keys(NIGERIAN_REGIONS).map(zone => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>

          <select 
            aria-label="Select state within zone"
            value={selectedState} 
            onChange={e => { setSelectedState(e.target.value); setSelectedLga('All') }}
            disabled={selectedZone === 'All'}
            className="w-full sm:w-auto rounded-lg border border-white/10 bg-[#040b08] px-4 py-2 text-sm text-white focus:border-[#00c46a] focus:outline-none disabled:opacity-50"
          >
            <option value="All">All States in Zone</option>
            {selectedZone !== 'All' && Object.keys(NIGERIAN_REGIONS[selectedZone]).map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>

          <select 
            aria-label="Select local government area"
            value={selectedLga} 
            onChange={e => setSelectedLga(e.target.value)}
            disabled={selectedState === 'All'}
            className="w-full sm:w-auto rounded-lg border border-white/10 bg-[#040b08] px-4 py-2 text-sm text-white focus:border-[#00c46a] focus:outline-none disabled:opacity-50"
          >
            <option value="All">All LGAs / Cities</option>
            {selectedZone !== 'All' && selectedState !== 'All' && NIGERIAN_REGIONS[selectedZone]?.[selectedState]?.map(lga => (
              <option key={lga} value={lga}>{lga}</option>
            ))}
          </select>

          {(selectedZone !== 'All' || selectedState !== 'All' || selectedLga !== 'All') && (
            <button 
              onClick={() => { setSelectedZone('All'); setSelectedState('All'); setSelectedLga('All') }}
              className="ml-auto text-xs text-[#fca5a5] hover:text-red-400 font-medium tracking-wide uppercase font-(--font-mono)"
            >
              Clear Filters ✕
            </button>
          )}
        </div>
      </div>

      <div id="igp-dashboard-content" className="space-y-6 rounded-2xl bg-[#040b08]">
      <section className="mb-6 rounded-2xl border border-white/10 bg-[#0a1510]/55 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#d9b64a]">Command brief</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Decision-ready executive summary</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Operational posture for {regionLabel} is {incidentPosture.toLowerCase()} based on field reports, readiness status, and active officer coverage.
              Use the geographic probe and incident feed to confirm whether escalation or reinforcement is required.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-[#040b08]/80 p-3 text-center">
              <div className="text-sm uppercase tracking-[0.24em] text-slate-400">Readiness</div>
              <div className="mt-2 text-3xl font-bold text-white">{readiness.readinessPercent}%</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#040b08]/80 p-3 text-center">
              <div className="text-sm uppercase tracking-[0.24em] text-slate-400">Active officers</div>
              <div className="mt-2 text-3xl font-bold text-white">{fmt(kpis.activeFieldOfficers)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#040b08]/80 p-3 text-center">
              <div className="text-sm uppercase tracking-[0.24em] text-slate-400">Open actions</div>
              <div className="mt-2 text-3xl font-bold text-white">{openReadiness}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#040b08]/80 p-3 text-center">
              <div className="text-sm uppercase tracking-[0.24em] text-slate-400">Critical alerts</div>
              <div className="mt-2 text-3xl font-bold text-white">{criticalIncidents}</div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI CARDS */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          title="Registered polling units" 
          value={fmt(kpis.registeredPus)} 
          subtitle={`${fmt(geography.pollingUnits)} polling units catalogued`} 
          highlightClass="bg-[#3b82f6]/20 text-[#3b82f6]" 
          icon="📡" 
        />
        <KpiCard 
          title="Active field officers" 
          value={fmt(kpis.activeFieldOfficers)} 
          subtitle={`${fmt(kpis.pendingApprovals)} approvals pending`} 
          highlightClass="bg-[#d9b64a]/20 text-[#d9b64a]" 
          icon="👮" 
        />
        <KpiCard 
          title="Operational readiness" 
          value={`${readiness.readinessPercent}%`} 
          subtitle={`${openReadiness} checklist items open`} 
          highlightClass="bg-[#f59e0b]/20 text-[#f59e0b]" 
          icon="⚙️" 
        />
        <KpiCard 
          title="Registered parties" 
          value={fmt(kpis.partiesRegistered)} 
          subtitle={`${fmt(geography.statesAndFct)} states/FCT footprint`} 
          highlightClass="bg-[#8b5cf6]/20 text-[#8b5cf6]" 
          icon="🏛️" 
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* LEFT COLUMN: Charts & Tiles */}
        <div className="space-y-6 lg:col-span-8">
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Threat Level by State */}
            <div className="rounded-2xl border border-white/5 bg-[#0a1510]/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 font-(--font-syne) text-sm font-bold text-white">Threat Level by State</h2>
              <div className="h-64">
                <Bar 
                  data={threatLevelData} 
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b' } },
                      y: { grid: { display: false }, ticks: { color: '#94a3b8', font: { family: 'monospace', size: 10 } } }
                    }
                  }} 
                />
              </div>
            </div>

            {/* Crisis Type Breakdown */}
            <div className="rounded-2xl border border-white/5 bg-[#0a1510]/60 p-5 backdrop-blur-sm">
              <h2 className="mb-4 font-(--font-syne) text-sm font-bold text-white">Crisis Categories</h2>
              <div className="h-64 flex items-center justify-center relative">
                <Doughnut 
                  data={crisisTypeData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: { 
                      legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 } } 
                    }
                  }} 
                />
              </div>
            </div>
          </div>

          {/* Combined Old Portal Data: Readiness & Footprint */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex items-center rounded-2xl border border-white/5 bg-[#0a1510]/60 p-5 backdrop-blur-sm">
              <div className="h-32 w-32 shrink-0">
                <Doughnut 
                  data={readinessDonut} 
                  options={{ plugins: { tooltip: { enabled: false } }, cutout: '75%' }} 
                />
              </div>
              <div className="ml-6">
                <p className="font-(--font-mono) text-[10px] uppercase text-[#d9b64a] tracking-widest">Election Readiness</p>
                <div className="mt-1 font-(--font-syne) text-4xl font-black text-white">{readiness?.readinessPercent}%</div>
                <p className="mt-1 text-xs text-slate-400">All command checkpoints cleared</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-[#0a1510]/60 p-5 backdrop-blur-sm">
              <h2 className="mb-3 font-(--font-syne) text-sm font-bold text-white">Active Crisis Watch</h2>
              <div className="grid grid-cols-2 gap-3">
                {CRISIS_CATEGORIES.slice(0, 4).map((c, i) => (
                  <div key={i} className="rounded-lg border border-white/5 bg-white/5 p-3">
                    <div className="font-(--font-mono) text-[10px] uppercase text-slate-400 truncate">{c}</div>
                    <div className="mt-1 font-(--font-syne) text-xl font-bold text-white">{seededValue(`kpi:${c}`, 5, 30)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent SitReps Panel */}
          <div className="rounded-2xl border border-white/5 bg-[#0a1510]/60 p-5 backdrop-blur-sm">
             <h2 className="mb-4 font-(--font-syne) text-sm font-bold text-white">Recent Field SitReps</h2>
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead>
                   <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-(--font-mono)">
                     <th className="pb-3 pr-4">Time</th>
                     <th className="pb-3 pr-4">Phase</th>
                     <th className="pb-3 pr-4">Location</th>
                     <th className="pb-3">Reporting Officer</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {sitreps.map((sr) => (
                     <tr key={sr.id} className="transition-colors hover:bg-white/5">
                       <td className="py-3 pr-4 font-(--font-mono) text-xs text-white">{sr.timestamp}</td>
                       <td className="py-3 pr-4">
                         <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">{sr.phase}</span>
                       </td>
                       <td className="py-3 pr-4 text-slate-300">{sr.state} State</td>
                       <td className="py-3 text-slate-400">{sr.officer}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Incident Feed */}
        <div className="flex flex-col rounded-2xl border border-white/5 bg-[#0a1510]/60 p-5 backdrop-blur-sm lg:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-(--font-syne) text-sm font-bold text-white">Live Incident Feed</h2>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar max-h-[calc(100vh-280px)]">
            {incidents.map((inc) => (
              <div 
                key={inc.id} 
                className={`relative rounded-xl border p-4 transition-all hover:translate-x-1 ${
                  inc.severity === 'critical' ? 'border-red-500/30 bg-red-500/10' :
                  inc.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/10' :
                  'border-emerald-500/30 bg-emerald-500/10'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 font-(--font-mono) text-[9px] font-bold uppercase tracking-wider ${
                    inc.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    inc.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {inc.severity}
                  </span>
                  <span className="font-(--font-mono) text-[10px] text-slate-400">{inc.time}</span>
                </div>
                <h3 className="font-(--font-syne) text-sm font-bold text-white">{inc.category}</h3>
                <p className="mt-1 text-xs text-slate-300">{inc.state} State — {inc.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="mt-6 flex flex-wrap gap-4 border-t border-white/10 pt-6">
        <button 
          onClick={() => handleGeneratePdf('Technical Specification Report')}
          disabled={isGeneratingPdf}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {isGeneratingPdf ? 'Generating...' : 'Technical Spec'}
        </button>
        <button 
          onClick={() => handleGeneratePdf('Ministerial Briefing Document')}
          disabled={isGeneratingPdf}
          className="flex items-center gap-2 rounded-xl bg-[#d9b64a] px-5 py-2.5 text-sm font-bold text-[#040b08] transition-colors hover:bg-[#e8c96a] shadow-[0_0_15px_rgba(0,200,150,0.3)] disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          {isGeneratingPdf ? 'Generating...' : 'Printable Ministerial Brief'}
        </button>
      </div>

    </div>
  )
}
