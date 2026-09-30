import { useEffect, useState } from 'react'
import { InteractiveSvgMap } from '../../components/InteractiveSvgMap'
import type { StateIncident } from '../../components/InteractiveSvgMap'

// GlassCard component extracted or duplicated for the cinematic feel
function GlassCard({ title, children, className = '', highlight = 'cyan' }: { title: string, children: React.ReactNode, className?: string, highlight?: 'cyan' | 'slate' | 'amber' }) {
  const borderColors = {
    cyan: 'border-cyan-500/30',
    slate: 'border-slate-700/50',
    amber: 'border-amber-500/30'
  }
  const textColors = {
    cyan: 'text-cyan-400',
    slate: 'text-slate-300',
    amber: 'text-amber-400'
  }
  
  return (
    <div className={`relative rounded-xl border ${borderColors[highlight]} bg-slate-900/40 backdrop-blur-xl shadow-2xl overflow-hidden ${className}`}>
      {/* Cinematic subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none"></div>
      
      <div className={`border-b ${borderColors[highlight]} bg-slate-950/50 px-4 py-3 flex justify-between items-center relative z-10`}>
        <h3 className={`font-(--font-mono) text-xs font-semibold uppercase tracking-widest ${textColors[highlight]}`}>
          {title}
        </h3>
        <div className="flex gap-1">
          <div className={`h-1.5 w-1.5 rounded-full ${highlight === 'cyan' ? 'bg-cyan-500/50' : highlight === 'amber' ? 'bg-amber-500/50' : 'bg-slate-500/50'}`}></div>
          <div className={`h-1.5 w-1.5 rounded-full ${highlight === 'cyan' ? 'bg-cyan-500/30' : highlight === 'amber' ? 'bg-amber-500/30' : 'bg-slate-500/30'}`}></div>
        </div>
      </div>
      <div className="p-4 relative z-10 h-[calc(100%-45px)]">
        {children}
      </div>
    </div>
  )
}

const liveFeedData = [
  ['14:38', 'PU-KN-00221', 'Kano', 'red', 'Ballot interference reported by agent.'],
  ['14:35', 'PU-RV-00105', 'Rivers', 'red', 'Gunshots heard near collation center.'],
  ['14:31', 'PU-LA-00842', 'Lagos', 'green', 'EC8A submitted ?" orderly.'],
  ['14:28', 'PU-DE-00441', 'Delta', 'amber', 'INEC materials delayed by 3 hours.'],
  ['14:20', 'PU-KN-00102', 'Kano', 'green', 'Voting concluded peacefully.'],
  ['14:15', 'PU-FC-00991', 'Federal Capital Territory', 'green', 'High turnout, security present.'],
  ['14:05', 'PU-RV-00222', 'Rivers', 'amber', 'Crowd control issues.'],
  ['13:50', 'PU-OY-00114', 'Oyo', 'green', 'Queue management resolved.'],
]

// Determine incident severity by mapping liveFeedData to states
const incidents: StateIncident[] = liveFeedData.reduce((acc, curr) => {
  const stateName = curr[2];
  const severity = curr[3];
  // Use the most severe status for a state if multiple exist
  const existing = acc.find(a => a.state === stateName);
  const severityVal = severity as 'green' | 'amber' | 'red';
  
  if (!existing) {
    acc.push({ state: stateName, severity: severityVal });
  } else {
    if (severityVal === 'red') existing.severity = 'red';
    else if (severityVal === 'amber' && existing.severity !== 'red') existing.severity = 'amber';
  }
  return acc;
}, [] as StateIncident[]);

export function SvgMonitorDashboard() {
  const [time, setTime] = useState(new Date())
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`)
      })
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  return (
    <div className="h-screen w-full bg-[color:var(--sr-app-bg)] text-slate-200 overflow-hidden flex flex-col">
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8">
        
        {/* Header */}
        <div className="mb-6 flex shrink-0 items-end justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
              SITUATION ROOM SCREEN
            </h1>
            <p className="mt-2 font-(--font-mono) text-sm tracking-wide text-cyan-500">
              TACTICAL OVERVIEW // GEOSPATIAL ABSTRACTION
            </p>
          </div>
          <div className="text-right flex items-center gap-6">
            <button 
              onClick={toggleFullscreen}
              className="flex items-center gap-2 rounded border border-cyan-900/50 bg-cyan-950/40 px-3 py-1.5 font-(--font-mono) text-[10px] uppercase text-cyan-400 hover:bg-cyan-900/60 transition-colors"
            >
              {isFullscreen ? '[X] EXIT FULLSCREEN' : '[+] ENTER FULLSCREEN'}
            </button>
            <div>
              <div className="font-(--font-mono) text-2xl font-light tracking-widest text-white">
                {time.toLocaleTimeString('en-GB')}
              </div>
              <div className="font-(--font-mono) text-xs text-slate-500">
                {time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="flex-1 grid gap-6 xl:grid-cols-12 min-h-0">
          
          {/* Center: Map */}
          <div className="xl:col-span-8 h-full min-h-0">
            <GlassCard title={`SVG THEATRE // ${selectedState ? selectedState.toUpperCase() : 'NATIONAL OVERVIEW'}`} highlight="cyan" className="h-full p-0 flex flex-col relative overflow-hidden group">
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

                {selectedState && (
                  <button
                    onClick={() => setSelectedState(null)}
                    className="mt-4 w-full rounded border border-cyan-900/50 bg-cyan-950/40 px-3 py-1.5 font-(--font-mono) text-[10px] uppercase text-cyan-400 hover:bg-cyan-900/60 transition-colors"
                  >
                    [X] CLEAR SELECTION
                  </button>
                )}
              </div>

              {/* Map container */}
              <div className="flex-1 relative flex items-center justify-center bg-slate-950/50">
                <InteractiveSvgMap 
                  incidents={incidents}
                  selectedState={selectedState}
                  onStateSelect={(state) => setSelectedState(state)}
                />
              </div>
            </GlassCard>
          </div>

          {/* Right Column: Live Feed */}
          <div className="xl:col-span-4 h-full min-h-0">
            <GlassCard title={`SITREP UPLINK // ${selectedState ? selectedState.toUpperCase() : 'LIVE'}`} highlight="amber" className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {liveFeedData
                  .filter((row) => !selectedState || row[2] === selectedState)
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
                
                {selectedState && liveFeedData.filter((row) => row[2] === selectedState).length === 0 && (
                  <div className="p-4 text-center font-(--font-mono) text-xs text-slate-500">
                    NO ACTIVE SITREPS FOR {selectedState.toUpperCase()}
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

        </div>
      </div>
    </div>
  )
}
