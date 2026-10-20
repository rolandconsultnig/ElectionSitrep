import { useQueries } from '@tanstack/react-query'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiJson } from '../lib/api'

type OfficeLevel = 'force_hq' | 'zonal' | 'state' | 'division' | 'station'

type Office = {
  id: number
  level: OfficeLevel
  name: string
  parentId: number | null
  officePhone: string | null
  oicRank: string | null
  oicName: string | null
  childCount?: number
}

type Connector = {
  parentId: number
  parentX: number
  parentBottom: number
  barStart: number
  barEnd: number
  barY: number
  children: { x: number; top: number }[]
}

const OFFICE_LEVELS: { level: OfficeLevel; singular: string; plural: string }[] = [
  { level: 'force_hq', singular: 'Force HQ', plural: 'Force HQs' },
  { level: 'zonal', singular: 'Zonal Command', plural: 'Zonal Commands' },
  { level: 'state', singular: 'State Command', plural: 'State Commands' },
  { level: 'division', singular: 'Divisional HQ', plural: 'Divisional HQs' },
  { level: 'station', singular: 'Police Station', plural: 'Police Stations' },
]

const NEXT_LEVELS: Partial<Record<OfficeLevel, { singular: string; plural: string }>> = {
  force_hq: { singular: 'zonal command', plural: 'zonal commands' },
  zonal: { singular: 'state command', plural: 'state commands' },
  state: { singular: 'divisional HQ', plural: 'divisional HQs' },
  division: { singular: 'police station', plural: 'police stations' },
}

const LEVEL_LABELS: Record<OfficeLevel, string> = {
  force_hq: 'Force HQ',
  zonal: 'Zonal Command',
  state: 'State Command',
  division: 'Divisional HQ',
  station: 'Police Station',
}

function sameConnectors(previous: Connector[], next: Connector[]) {
  if (previous.length !== next.length) return false
  return previous.every((connector, index) => {
    const candidate = next[index]
    return connector.parentId === candidate.parentId
      && Math.abs(connector.parentX - candidate.parentX) < 0.5
      && Math.abs(connector.parentBottom - candidate.parentBottom) < 0.5
      && Math.abs(connector.barStart - candidate.barStart) < 0.5
      && Math.abs(connector.barEnd - candidate.barEnd) < 0.5
      && Math.abs(connector.barY - candidate.barY) < 0.5
      && connector.children.length === candidate.children.length
      && connector.children.every((child, childIndex) => {
        const candidateChild = candidate.children[childIndex]
        return Math.abs(child.x - candidateChild.x) < 0.5
          && Math.abs(child.top - candidateChild.top) < 0.5
      })
  })
}

export function CommandOrganogram() {
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [searchParams] = useSearchParams()
  const tierParam = searchParams.get('tier')
  const requestedLevel = OFFICE_LEVELS.find(({ level }) => level === tierParam)?.level
  const chartRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const nodeRefs = useRef<Map<number, HTMLElement>>(new Map())
  const rowParents: Array<number | null> = [null, ...selectedPath]
  const officeQueries = useQueries({
    queries: rowParents.map((parentId) => ({
      queryKey: ['landing-command-organogram', parentId ?? 'root'],
      queryFn: () => apiJson<{ offices: Office[] }>(
        parentId == null ? '/api/directory/offices' : `/api/directory/offices?parentId=${parentId}`,
      ),
      staleTime: 60_000,
    })),
  })
  const rootOffice = officeQueries[0]?.data?.offices[0]

  useEffect(() => {
    if (!requestedLevel) return
    const rootId = rootOffice?.id
    const expandRoot = requestedLevel !== 'force_hq' && rootId != null && (rootOffice?.childCount ?? 0) > 0
    const frame = window.requestAnimationFrame(() => {
      setSelectedPath(expandRoot ? [rootId] : [])
      document.getElementById('command')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [requestedLevel, rootOffice])

  const queryDataVersion = officeQueries.map((query) => query.dataUpdatedAt).join(',')

  useLayoutEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    let frame = 0
    const updateConnectors = () => {
      const chartRect = chart.getBoundingClientRect()
      const next: Connector[] = []
      selectedPath.forEach((parentId, depth) => {
        const parentNode = nodeRefs.current.get(parentId)
        const childRow = rowRefs.current[depth + 1]
        if (!parentNode || !childRow) return
        const childNodes = Array.from(childRow.querySelectorAll<HTMLElement>('[data-office-node]'))
        if (!childNodes.length) return
        const parentRect = parentNode.getBoundingClientRect()
        const childRect = childRow.getBoundingClientRect()
        const parentX = parentRect.left + parentRect.width / 2 - chartRect.left
        const children = childNodes.map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            x: rect.left + rect.width / 2 - chartRect.left,
            top: rect.top - chartRect.top,
          }
        })
        const childXs = children.map(({ x }) => x)
        const barY = childRect.top - chartRect.top - 12
        next.push({
          parentId,
          parentX,
          parentBottom: parentRect.bottom - chartRect.top,
          barStart: Math.min(parentX, ...childXs),
          barEnd: Math.max(parentX, ...childXs),
          barY,
          children,
        })
      })
      setConnectors((previous) => sameConnectors(previous, next) ? previous : next)
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateConnectors)
    }
    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(chart)
    rowRefs.current.forEach((row) => {
      if (row) observer.observe(row)
    })
    selectedPath.forEach((id) => {
      const node = nodeRefs.current.get(id)
      if (node) observer.observe(node)
    })
    window.addEventListener('resize', scheduleUpdate)
    scheduleUpdate()
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', scheduleUpdate)
      observer.disconnect()
    }
  }, [selectedPath, queryDataVersion])

  function selectOffice(depth: number, office: Office) {
    if ((office.childCount ?? 0) < 1) return
    setSelectedPath((current) => {
      if (current[depth] === office.id) return current.slice(0, depth)
      return [...current.slice(0, depth), office.id]
    })
  }

  const breadcrumb = selectedPath.flatMap((id, depth) => {
    const office = officeQueries[depth]?.data?.offices.find((candidate) => candidate.id === id)
    return office ? [office] : []
  })
  const targetIndex = requestedLevel ? OFFICE_LEVELS.findIndex(({ level }) => level === requestedLevel) : -1
  const currentRowIndex = Math.min(selectedPath.length, OFFICE_LEVELS.length - 1)
  const nextRowLevel = OFFICE_LEVELS[currentRowIndex + 1]
  const hint = targetIndex > currentRowIndex && nextRowLevel
    ? `Select a ${OFFICE_LEVELS[currentRowIndex].singular} to view its ${nextRowLevel.plural}`
    : null

  return (
    <div className="mt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Selected command path">
          <ol className="flex flex-wrap items-center gap-2 font-(--font-mono) text-[9px] uppercase tracking-wider text-[var(--portal-muted)]">
            {(breadcrumb.length ? breadcrumb : rootOffice ? [rootOffice] : []).map((office, index) => (
              <Fragment key={office.id}>
                {index ? <li aria-hidden className="text-[var(--portal-dim)]">/</li> : null}
                <li className={index === breadcrumb.length - 1 ? 'text-[#00c46a]' : ''}>{office.name}</li>
              </Fragment>
            ))}
            {!rootOffice && !breadcrumb.length ? <li>Force HQ</li> : null}
          </ol>
        </nav>
        <button
          type="button"
          onClick={() => setSelectedPath([])}
          disabled={!selectedPath.length}
          className="rounded-full border border-[color:var(--portal-border)] px-3 py-1.5 font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider text-[var(--portal-muted)] transition hover:border-[#00c46a]/50 hover:text-[#00c46a] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Collapse all
        </button>
      </div>

      {hint ? (
        <p className="mb-5 rounded-xl border border-[#00c46a]/20 bg-[#00c46a]/5 px-4 py-3 text-xs text-[var(--portal-muted)]">
          {hint}
        </p>
      ) : null}

      <div ref={chartRef} className="relative mx-auto w-full max-w-6xl">
        <div className="relative z-10 flex flex-col gap-6">
          {officeQueries.map((query, depth) => {
            const level = OFFICE_LEVELS[depth]
            const offices = query.data?.offices ?? []
            if (query.isLoading && !query.data) {
              return (
                <p key={rowParents[depth] ?? 'root'} className="rounded-xl border border-[color:var(--portal-border)] p-4 text-center text-xs text-[var(--portal-muted)]">
                  Loading {level.plural.toLowerCase()}…
                </p>
              )
            }
            if (query.isError && !query.data) {
              return (
                <p key={rowParents[depth] ?? 'root'} role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-center text-xs text-red-400">
                  {(query.error as Error).message}
                </p>
              )
            }
            if (!offices.length) {
              return (
                <p key={rowParents[depth] ?? 'root'} className="rounded-xl border border-[color:var(--portal-border)] p-4 text-center text-xs text-[var(--portal-muted)]">
                  No {level.plural} listed yet.
                </p>
              )
            }
            return (
              <div
                key={rowParents[depth] ?? 'root'}
                ref={(element) => { rowRefs.current[depth] = element }}
                className="flex flex-wrap justify-center gap-x-4 gap-y-6"
              >
                {offices.map((office) => {
                  const hasChildren = (office.childCount ?? 0) > 0 && Boolean(NEXT_LEVELS[office.level])
                  const selected = selectedPath[depth] === office.id
                  const next = NEXT_LEVELS[office.level]
                  const countLabel = next
                    ? hasChildren
                      ? `${office.childCount} ${office.childCount === 1 ? next.singular : next.plural} ▾`
                      : `No ${next.plural} listed yet`
                    : null
                  const oicLabel = [office.oicRank, office.oicName].filter(Boolean).join(' ') || 'Not yet listed'
                  return (
                    <article
                      key={office.id}
                      ref={(element) => {
                        if (element) nodeRefs.current.set(office.id, element)
                        else nodeRefs.current.delete(office.id)
                      }}
                      data-office-node=""
                      className={`w-full max-w-[15rem] rounded-2xl border bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-3 shadow-[var(--sr-card-shadow)] transition-colors ${
                        selected
                          ? 'border-[#00c46a]/70 ring-1 ring-[#00c46a]/30'
                          : 'border-[color:var(--portal-border)] hover:border-[#00c46a]/40'
                      }`}
                    >
                      <button
                        type="button"
                        aria-expanded={hasChildren ? selected : false}
                        aria-disabled={!hasChildren}
                        onClick={() => selectOffice(depth, office)}
                        className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c46a]/60"
                      >
                        <span className="block font-(--font-mono) text-[8px] font-semibold uppercase tracking-[0.16em] text-[#00c46a]">
                          {LEVEL_LABELS[office.level]}
                        </span>
                        <span className="mt-1 block break-words text-sm font-semibold leading-snug text-[var(--sr-heading)]">
                          {office.name}
                        </span>
                        <span className="mt-2 block break-words text-[10px] leading-relaxed text-[var(--portal-muted)]">
                          {oicLabel}
                        </span>
                        {countLabel ? (
                          <span className={`mt-2 block text-[10px] font-medium ${hasChildren ? 'text-[#00c46a]' : 'text-[var(--portal-dim)]'}`}>
                            {countLabel}
                          </span>
                        ) : null}
                      </button>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[color:var(--portal-border)] pt-2 font-(--font-mono) text-[9px]">
                        {office.officePhone
                          ? <a href={`tel:${office.officePhone}`} className="min-w-0 break-all text-[var(--portal-muted)] hover:text-[#00c46a]">{office.officePhone}</a>
                          : <span className="text-[var(--portal-dim)]">Not yet listed</span>}
                        <Link to={`/directory/${office.id}`} className="shrink-0 text-[#00c46a] hover:underline">
                          Details →
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )
          })}
        </div>
        {connectors.length ? (
          <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
            {connectors.map((connector) => (
              <Fragment key={connector.parentId}>
                <span
                  className="absolute w-px bg-[#00c46a]/35 sm:hidden"
                  style={{
                    left: connector.parentX,
                    top: connector.parentBottom,
                    height: Math.max(0, (connector.children[0]?.top ?? connector.barY) - connector.parentBottom),
                  }}
                />
                <span
                  className="absolute hidden w-px bg-[#00c46a]/35 sm:block"
                  style={{
                    left: connector.parentX,
                    top: connector.parentBottom,
                    height: Math.max(0, connector.barY - connector.parentBottom),
                  }}
                />
                <span
                  className="absolute hidden h-px bg-[#00c46a]/35 sm:block"
                  style={{
                    left: connector.barStart,
                    top: connector.barY,
                    width: Math.max(1, connector.barEnd - connector.barStart),
                  }}
                />
                {connector.children.map(({ x, top }, index) => (
                  <span
                    key={`${connector.parentId}-${index}`}
                    className="absolute hidden w-px bg-[#00c46a]/35 sm:block"
                    style={{
                      left: x,
                      top: connector.barY,
                      height: Math.max(0, top - connector.barY),
                    }}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
