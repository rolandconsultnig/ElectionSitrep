import { Bar, Doughnut } from 'react-chartjs-2'
import { chartTooltipTheme } from '../../charts/register'
import { NigeriaMap } from '../../components/NigeriaMap'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiJson } from '../../lib/api'

// Million-dollar palette (Cinematic + Tactical)
const techColors = {
  cyan: '#06b6d4',      // electric blue/cyan
  cyanGlow: 'rgba(6, 182, 212, 0.5)',
  red: '#f43f5e',       // tactical crimson
  amber: '#f59e0b',     // warning amber
  green: '#10b981',     // emerald secure
  slate800: '#1e293b',  // border colors
  slate900: '#0f172a',
  black: '#030906',     // deep obsidian
}

const mapPins = [
  { lat: 7.6195, lng: 5.2219, label: 'Kogi — ballot interference', severity: 'red' as const },
  { lat: 4.8156, lng: 7.0498, label: 'Rivers — gunfire near collation', severity: 'red' as const },
  { lat: 12.0022, lng: 8.592, label: 'Kano — peaceful', severity: 'green' as const },
  { lat: 6.5244, lng: 3.3792, label: 'Lagos — EC8A submitted', severity: 'green' as const },
  { lat: 9.0765, lng: 7.3986, label: 'FCT — high turnout', severity: 'green' as const },
  { lat: 5.5325, lng: 5.8987, label: 'Delta — delayed materials', severity: 'amber' as const },
]

const liveFeedData = [
  ['14:38', 'PU-KN-00221', 'Kogi', 'red', 'Ballot interference reported by agent.'],
  ['14:35', 'PU-RV-00105', 'Rivers', 'red', 'Gunshots heard near collation center.'],
  ['14:31', 'PU-LA-00842', 'Lagos', 'green', 'EC8A submitted — orderly.'],
  ['14:28', 'PU-DE-00441', 'Delta', 'amber', 'INEC materials delayed by 3 hours.'],
  ['14:20', 'PU-KN-00102', 'Kano', 'green', 'Voting concluded peacefully.'],
  ['14:15', 'PU-FC-00991', 'FCT', 'green', 'High turnout, security present.'],
  ['14:05', 'PU-RV-00222', 'Rivers', 'amber', 'Crowd control issues.'],
  ['13:50', 'PU-OY-00114', 'Oyo', 'green', 'Queue management resolved.'],
]

export function SituationRoomDashboard() {
  const [time, setTime] = useState(new Date())
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [showPollingUnits, setShowPollingUnits] = useState(false)
  const [showFieldOfficers, setShowFieldOfficers] = useState(false)
  
  const statesGeoQuery = useQuery({
    queryKey: ['geo-layers-states-public'],
    queryFn: async () => {
      const res = await fetch('/api/geo/layers/states')
      if (!res.ok) throw new Error('Failed to load state boundaries')
      return res.json()
    },
  })

  const pollingUnitsQuery = useQuery({
    queryKey: ['geo-polling-units-public'],
    queryFn: () =>
      apiJson<{ pollingUnits: Array<{ lat: number; lng: number; code: string; name: string }> }>(
        '/api/geography/polling-units',
      ),
    enabled: showPollingUnits
  })

  const fieldOfficersQuery = useQuery({
    queryKey: ['field-operations-map-public'],
    queryFn: () =>
      apiJson<{
        active: Array<{ userId: string; username?: string; displayName?: string; lat: number; lng: number; stateHint?: string }>
        inactive: Array<{ userId: string; displayName?: string; lat: number; lng: number; reason: string }>
      }>('/api/admin/field-operations-map'),
    enabled: showFieldOfficers
  })
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const tally = {
    labels: ['APC', 'LP', 'PDP', 'NNPP', 'Others'],
    datasets: [
      {
        label: 'Votes (millions)',
        data: [22.1, 19.4, 13.8, 3.1, 1.3],
        backgroundColor: [
          'rgba(6, 182, 212, 0.8)', // Cyan
          'rgba(59, 130, 246, 0.8)', // Blue
          'rgba(245, 158, 11, 0.8)', // Amber
          'rgba(16, 185, 129, 0.8)', // Green
          'rgba(100, 116, 139, 0.8)' // Slate
        ],
        borderColor: techColors.cyan,
        borderWidth: 1,
        borderRadius: 2,
      },
    ],
  }

  const doughnut = {
    labels: ['SW', 'NW', 'SE', 'SS', 'NC', 'NE'],
    datasets: [
      {
        data: [72, 58, 84, 65, 49, 55],
        backgroundColor: [
          'rgba(6, 182, 212, 0.6)', 
          'rgba(59, 130, 246, 0.6)', 
          'rgba(245, 158, 11, 0.6)', 
          'rgba(16, 185, 129, 0.6)', 
          'rgba(168, 85, 247, 0.6)', 
          'rgba(100, 116, 139, 0.6)'
        ],
        borderColor: techColors.slate900,
        borderWidth: 2,
      },
    ],
  }

  return (
    <div className="relative min-h-screen bg-[#030906] text-slate-300 overflow-hidden font-(--font-syne)">
      {/* Cinematic/Tactical Background Effects */}
      {/* 1. Subtle tactical grid */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      {/* 2. Deep ambient glows (Cinematic) */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-900/20 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[40%] h-[50%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 p-4 sm:p-6 lg:p-8">
        {/* Header (Tactical HUD Style) */}
        <header className="mb-8 flex items-end justify-between border-b border-cyan-900/40 pb-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-2 bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
            <div>
              <h1 className="text-4xl font-bold tracking-[0.1em] text-white">COMMAND<span className="text-cyan-400">/</span>NEXUS</h1>
              <div className="mt-1 flex items-center gap-3 font-(--font-mono) text-xs uppercase tracking-[0.2em] text-cyan-500/80">
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-cyan-500 animate-pulse"></span> SYSTEM ONLINE</span>
                <span>//</span>
                <span>SECURE UPLINK</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-(--font-mono) text-3xl font-light tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              {time.toLocaleTimeString('en-NG', { hour12: false })} <span className="text-cyan-500 text-xl font-bold">WAT</span>
            </div>
            <div className="font-(--font-mono) text-[10px] uppercase tracking-[0.15em] text-slate-400">
              {time.toLocaleDateString('en-NG', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit' })} — EPOCH {Math.floor(time.getTime()/1000)}
            </div>
          </div>
        </header>

        {/* Top KPIs */}
        <div className="mb-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <TacticalKpi label="PUs Reporting" value="84.2%" trend="+2.4% /hr" tone="cyan" icon="◒" />
          <TacticalKpi label="Votes Observed" value="62.4M" trend="Nominal" tone="blue" icon="∑" />
          <TacticalKpi label="Active Alerts" value="12" trend="Escalating" tone="amber" icon="⚠" />
          <TacticalKpi label="Volatility Index" value="CRITICAL" trend="Code Red" tone="red" icon="⛝" />
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 xl:grid-cols-12 h-[calc(100vh-280px)] min-h-[600px]">
          
          {/* Left Column: Tally and Turnout */}
          <div className="flex flex-col gap-6 xl:col-span-3">
            <GlassCard title="LIVE TALLY [EC8A]" highlight="cyan">
              <div className="h-[220px] w-full pt-4">
                <Bar
                  data={tally}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: chartTooltipTheme() },
                    scales: {
                      x: { ticks: { color: '#64748b', font: { family: 'monospace' } }, grid: { display: false } },
                      y: { ticks: { color: '#64748b', font: { family: 'monospace' } }, grid: { color: 'rgba(30, 41, 59, 0.5)' } },
                    },
                  }}
                />
              </div>
            </GlassCard>
            <GlassCard title="REGIONAL TURNOUT" highlight="slate">
              <div className="h-[180px] w-full flex items-center justify-center pt-2">
                <Doughnut
                  data={doughnut}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'monospace', size: 10 } } }, tooltip: chartTooltipTheme() },
                    cutout: '75%',
                  }}
                />
              </div>
            </GlassCard>
          </div>

          {/* Center: Map */}
          <div className="xl:col-span-6 h-full">
            <GlassCard title={`THEATRE OF OPERATIONS // ${selectedStates.length > 0 ? selectedStates.join(', ').toUpperCase() : 'NGA'}`} highlight="cyan" className="h-full p-0 flex flex-col relative overflow-hidden group">
              {/* Tactical corners */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500 z-20 pointer-events-none"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500 z-20 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500 z-20 pointer-events-none"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500 z-20 pointer-events-none"></div>
              
              {/* Overlay legend */}
              <div className="absolute top-12 left-4 z-20 rounded bg-slate-950/80 px-4 py-3 border border-slate-800/80 backdrop-blur-md shadow-xl">
                <div className="mt-1 space-y-2 font-(--font-mono) text-[10px] uppercase tracking-widest text-slate-400">
                  <div className="flex items-center gap-3"><span className="size-2 rounded-sm bg-[#f43f5e] shadow-[0_0_8px_#f43f5e]"></span> CRITICAL EVENT</div>
                  <div className="flex items-center gap-3"><span className="size-2 rounded-sm bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]"></span> WARNING STATE</div>
                  <div className="flex items-center gap-3"><span className="size-2 rounded-sm bg-[#10b981] shadow-[0_0_8px_#10b981]"></span> SECURE / NOMINAL</div>
                </div>

                <div className="mt-4 space-y-2 font-(--font-mono) text-[10px] uppercase text-slate-300 border-t border-slate-700/50 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer hover:text-cyan-400 transition-colors">
                    <input 
                      type="checkbox" 
                      className="accent-cyan-500" 
                      checked={showPollingUnits} 
                      onChange={(e) => setShowPollingUnits(e.target.checked)} 
                    />
                    <span>Show Polling Units <span className="text-yellow-400 font-bold">(YELLOW)</span></span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer hover:text-cyan-400 transition-colors">
                    <input 
                      type="checkbox" 
                      className="accent-cyan-500" 
                      checked={showFieldOfficers} 
                      onChange={(e) => setShowFieldOfficers(e.target.checked)} 
                    />
                    <span>Show Field Officers <span className="text-blue-400 font-bold">(BLUE)</span></span>
                  </label>
                </div>

                {selectedStates.length > 0 && (
                  <button
                    onClick={() => setSelectedStates([])}
                    className="mt-4 w-full rounded border border-cyan-900/50 bg-cyan-950/40 px-3 py-1.5 font-(--font-mono) text-[10px] uppercase text-cyan-400 hover:bg-cyan-900/60 transition-colors"
                  >
                    [X] RESET TO NATIONAL
                  </button>
                )}
              </div>

              {/* Map container with tech styling */}
              <div className="flex-1 relative filter saturate-[0.8] contrast-125 sepia-[.1] hue-rotate-[180deg] invert-[0.9]">
                <NigeriaMap 
                  pins={selectedStates.length > 0 ? mapPins.filter(p => selectedStates.some(st => p.label.includes(st))) : mapPins} 
                  statesGeo={statesGeoQuery.data}
                  selectedStates={selectedStates}
                  onStateClick={(stateName) => {
                    setSelectedStates(prev => 
                      prev.includes(stateName) 
                        ? prev.filter(s => s !== stateName) 
                        : [...prev, stateName]
                    )
                  }}
                  pollingUnits={showPollingUnits ? pollingUnitsQuery.data?.pollingUnits : null}
                  fieldOfficers={showFieldOfficers ? fieldOfficersQuery.data : null}
                  height="100%" 
                  hint="" 
                />
              </div>
            </GlassCard>
          </div>

          {/* Right Column: Live Feed */}
          <div className="xl:col-span-3 h-full">
            <GlassCard title={`SITREP UPLINK // ${selectedStates.length > 0 ? selectedStates.join(', ').toUpperCase() : 'LIVE'}`} highlight="amber" className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {liveFeedData
                  .filter((row) => selectedStates.length === 0 || selectedStates.includes(row[2]))
                  .map(([t, pu, st, sev, msg], idx) => (
                  <div key={idx} className="group relative flex gap-3 rounded border border-slate-800/60 bg-slate-900/40 p-3 hover:bg-slate-800/60 transition-colors">
                    {/* Glowing side accent */}
                    <div className={`absolute left-0 top-0 w-0.5 h-full ${
                      sev === 'green' ? 'bg-[#10b981] shadow-[0_0_5px_#10b981]' 
                      : sev === 'amber' ? 'bg-[#f59e0b] shadow-[0_0_5px_#f59e0b]' 
                      : 'bg-[#f43f5e] shadow-[0_0_5px_#f43f5e]'
                    }`}></div>
                    
                    <div className="flex-1 pl-2">
                      <div className="flex items-center justify-between font-(--font-mono) text-[10px] text-slate-500 mb-1">
                        <span className="text-cyan-500/70">[{pu}]</span>
                        <span>{t}</span>
                      </div>
                      <div className="text-sm font-medium text-slate-200 leading-snug">{msg}</div>
                      <div className="mt-1.5 font-(--font-mono) text-[9px] uppercase tracking-widest text-slate-500">
                        LOC: {st}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

        </div>
      </div>
    </div>
  )
}

function TacticalKpi({ label, value, trend, tone, icon }: { label: string; value: string; trend: string; tone: 'cyan' | 'blue' | 'amber' | 'red', icon: string }) {
  const colors = {
    cyan: { text: 'text-cyan-400', shadow: 'shadow-[0_0_15px_rgba(34,211,238,0.2)]', border: 'border-cyan-500/30', bg: 'bg-cyan-950/30' },
    blue: { text: 'text-blue-400', shadow: 'shadow-[0_0_15px_rgba(96,165,250,0.2)]', border: 'border-blue-500/30', bg: 'bg-blue-950/30' },
    amber: { text: 'text-amber-400', shadow: 'shadow-[0_0_15px_rgba(251,191,36,0.2)]', border: 'border-amber-500/30', bg: 'bg-amber-950/30' },
    red: { text: 'text-rose-400', shadow: 'shadow-[0_0_15px_rgba(244,63,94,0.3)]', border: 'border-rose-500/40', bg: 'bg-rose-950/30' },
  }[tone]

  return (
    <div className={`relative overflow-hidden rounded-lg border ${colors.border} ${colors.bg} p-5 backdrop-blur-xl ${colors.shadow} transition-all hover:brightness-125`}>
      {/* Scanline effect */}
      <div className="absolute inset-0 opacity-[0.03] bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,#fff_2px,#fff_4px)] pointer-events-none"></div>
      
      <div className="relative z-10 flex items-start justify-between">
        <div>
          <div className="font-(--font-mono) text-[11px] uppercase tracking-[0.15em] text-slate-400">{label}</div>
          <div className={`mt-2 font-(--font-syne) text-4xl font-bold tracking-tight ${colors.text} drop-shadow-md`}>{value}</div>
          <div className="mt-3 flex items-center gap-2 font-(--font-mono) text-[10px] uppercase text-slate-500">
            <span className={`inline-block size-1.5 bg-current ${tone === 'red' ? 'animate-ping' : ''} ${colors.text}`}></span>
            {trend}
          </div>
        </div>
        <div className={`text-2xl opacity-40 ${colors.text}`}>{icon}</div>
      </div>
    </div>
  )
}

function GlassCard({ title, highlight, children, className = '' }: { title: string; highlight: 'cyan' | 'amber' | 'slate', children: React.ReactNode, className?: string }) {
  const highlightColor = {
    cyan: 'bg-cyan-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
  }[highlight]

  return (
    <div className={`rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-2xl shadow-2xl p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between border-b border-slate-800/50 pb-3">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-1 ${highlightColor} shadow-[0_0_5px_currentColor]`}></div>
          <h2 className="font-(--font-mono) text-xs font-bold uppercase tracking-[0.2em] text-slate-200">{title}</h2>
        </div>
        <div className="flex gap-1">
          <span className="size-1 rounded-full bg-slate-600"></span>
          <span className="size-1 rounded-full bg-slate-600"></span>
          <span className="size-1 rounded-full bg-slate-600"></span>
        </div>
      </div>
      {children}
    </div>
  )
}
