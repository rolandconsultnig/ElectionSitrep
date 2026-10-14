import { useQueries } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiJson } from '../lib/api'

type OfficeLevel = 'force_hq' | 'zonal' | 'state' | 'division' | 'station'

type Office = {
  id: number
  level: OfficeLevel
  name: string
  code: string | null
  parentId: number | null
  parentName: string | null
  stateName: string | null
  officePhone: string | null
  officeEmail: string | null
  oicRank: string | null
  oicName: string | null
}

type ParentFilter = {
  parentId: number
  parentName: string
  targetLevel: OfficeLevel
}

const COMMAND_LEVELS: {
  level: OfficeLevel
  label: string
  emptyLabel: string
  nextLevel?: OfficeLevel
}[] = [
  { level: 'force_hq', label: 'Force HQ', emptyLabel: 'Force Headquarters', nextLevel: 'zonal' },
  { level: 'zonal', label: 'Zonal Commands', emptyLabel: 'Zonal Commands', nextLevel: 'state' },
  { level: 'state', label: 'State Commands', emptyLabel: 'State Commands', nextLevel: 'division' },
  { level: 'division', label: 'Divisional HQs', emptyLabel: 'Divisional HQs', nextLevel: 'station' },
  { level: 'station', label: 'Police Stations', emptyLabel: 'Police Stations' },
]

const LEVEL_LABELS: Record<OfficeLevel, string> = {
  force_hq: 'Force HQ',
  zonal: 'Zonal Command',
  state: 'State Command',
  division: 'Divisional HQ',
  station: 'Police Station',
}

const NEXT_LEVEL_LABELS: Partial<Record<OfficeLevel, string>> = {
  zonal: 'Zonal Commands',
  state: 'State Commands',
  division: 'Divisional HQs',
  station: 'Police Stations',
}

export function CommandStructureTabs() {
  const [activeLevel, setActiveLevel] = useState<OfficeLevel>('force_hq')
  const [filter, setFilter] = useState<ParentFilter | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const officeQueries = useQueries({
    queries: COMMAND_LEVELS.map(({ level }) => ({
      queryKey: ['landing-command-structure', level],
      queryFn: () => apiJson<{ offices: Office[] }>(`/api/directory/offices?level=${level}`),
      staleTime: 60_000,
    })),
  })

  const activeIndex = COMMAND_LEVELS.findIndex(({ level }) => level === activeLevel)
  const activeTab = COMMAND_LEVELS[activeIndex]
  const activeQuery = officeQueries[activeIndex]
  const allOffices = activeQuery?.data?.offices ?? []
  const offices = filter?.targetLevel === activeLevel
    ? allOffices.filter((office) => office.parentId === filter.parentId)
    : allOffices

  function selectTab(level: OfficeLevel, selectedFilter: ParentFilter | null = null) {
    setActiveLevel(level)
    setFilter(selectedFilter)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % COMMAND_LEVELS.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index + COMMAND_LEVELS.length - 1) % COMMAND_LEVELS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = COMMAND_LEVELS.length - 1
    if (nextIndex == null) return
    event.preventDefault()
    selectTab(COMMAND_LEVELS[nextIndex].level)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Police command levels"
        className="flex gap-2 overflow-x-auto rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--sr-btn-ghost-bg)] p-2"
      >
        {COMMAND_LEVELS.map((tab, index) => {
          const selected = activeLevel === tab.level
          const query = officeQueries[index]
          return (
            <button
              key={tab.level}
              ref={(element) => { tabRefs.current[index] = element }}
              id={`command-tab-${tab.level}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="command-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.level)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider transition sm:px-4 sm:text-[10px] ${
                selected
                  ? 'bg-[#00c46a]/10 text-[#00c46a] shadow-[inset_0_0_0_1px_rgba(0,196,106,0.35)]'
                  : 'text-[var(--portal-muted)] hover:bg-[color:var(--portal-table-row-hover)] hover:text-[var(--sr-heading)]'
              }`}
            >
              {tab.label}
              <span className="rounded-full border border-[color:var(--portal-border)] px-1.5 py-0.5 text-[8px] tabular-nums">
                {query?.isLoading ? '…' : query?.data?.offices.length ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <section
        id="command-panel"
        role="tabpanel"
        aria-labelledby={`command-tab-${activeLevel}`}
        tabIndex={0}
        className="mt-5 outline-none focus-visible:ring-2 focus-visible:ring-[#00c46a]/60"
      >
        {filter ? (
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#00c46a]/30 bg-[#00c46a]/10 px-3 py-1.5 font-(--font-mono) text-[9px] uppercase tracking-wider text-[var(--portal-muted)]">
              Filter by <span className="font-semibold text-[#00c46a]">{filter.parentName}</span>
              <button
                type="button"
                onClick={() => setFilter(null)}
                className="ml-1 text-[var(--portal-dim)] underline decoration-[color:var(--portal-border)] underline-offset-2 hover:text-[var(--sr-heading)]"
                aria-label={`Clear filter for ${filter.parentName}`}
              >
                Clear
              </button>
            </span>
          </div>
        ) : null}

        {activeQuery?.isLoading ? (
          <p className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-5 text-sm text-[var(--portal-muted)]">
            Loading {activeTab.label.toLowerCase()}…
          </p>
        ) : activeQuery?.isError ? (
          <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-400">
            {(activeQuery.error as Error).message}
          </p>
        ) : offices.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {offices.map((office) => (
              <article
                key={office.id}
                className="rounded-2xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-4 shadow-[var(--sr-card-shadow)] transition-colors hover:border-[#00c46a]/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider text-[#00c46a]">
                    {LEVEL_LABELS[office.level]}
                  </span>
                  <span className="font-(--font-mono) text-[9px] text-[var(--portal-dim)]">{office.code || '—'}</span>
                </div>
                <h3 className="mt-2 break-words font-(--font-display) text-lg font-semibold text-[var(--sr-heading)]">
                  <Link to={`/directory/${office.id}`} className="hover:text-[#00c46a]">
                    {office.name}
                  </Link>
                </h3>
                <div className="mt-3 space-y-1 text-xs text-[var(--portal-muted)]">
                  {office.level !== 'force_hq' ? <p>Under {office.parentName || 'Not yet listed'}</p> : null}
                  <p>State: {office.stateName || 'Not yet listed'}</p>
                  <p>
                    Officer in charge: {office.oicRank || 'Not yet listed'} · {office.oicName || 'Not yet listed'}
                  </p>
                </div>
                <dl className="mt-4 grid gap-3 border-t border-[color:var(--portal-border)] pt-3 text-xs sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="font-(--font-mono) text-[8px] uppercase tracking-wider text-[var(--portal-dim)]">Office phone</dt>
                    <dd className="mt-1 break-words">
                      {office.officePhone
                        ? <a href={`tel:${office.officePhone}`} className="text-[#00c46a] hover:underline">{office.officePhone}</a>
                        : <span className="text-[var(--portal-muted)]">Not yet listed</span>}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-(--font-mono) text-[8px] uppercase tracking-wider text-[var(--portal-dim)]">Office email</dt>
                    <dd className="mt-1 break-words">
                      {office.officeEmail
                        ? <a href={`mailto:${office.officeEmail}`} className="text-[#00c46a] hover:underline">{office.officeEmail}</a>
                        : <span className="text-[var(--portal-muted)]">Not yet listed</span>}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--portal-border)] pt-3">
                  <Link to={`/directory/${office.id}`} className="font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider text-[var(--portal-muted)] hover:text-[#00c46a]">
                    Office details →
                  </Link>
                  {activeTab.nextLevel ? (
                    <button
                      type="button"
                      onClick={() => selectTab(activeTab.nextLevel!, {
                        parentId: office.id,
                        parentName: office.name,
                        targetLevel: activeTab.nextLevel!,
                      })}
                      className="font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider text-[#00c46a] hover:text-[var(--sr-heading)]"
                    >
                      View {NEXT_LEVEL_LABELS[activeTab.nextLevel]} →
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-6">
            <p className="text-sm text-[var(--portal-muted)]">No {activeTab.emptyLabel} listed yet.</p>
            <Link to="/directory" className="mt-3 inline-flex font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider text-[#00c46a] hover:underline">
              Browse full directory →
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
