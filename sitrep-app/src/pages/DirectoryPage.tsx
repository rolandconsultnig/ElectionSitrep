import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { apiJson } from '../lib/api'

type BreadcrumbItem = { id: number; level: string; name: string }
type Office = {
  id: number
  level: string
  name: string
  code: string | null
  parentId: number | null
  stateId: number | null
  stateName: string | null
  address: string | null
  officePhone: string | null
  officeEmail: string | null
  oicRank: string | null
  oicName: string | null
  oicPhone?: string | null
  oicEmail?: string | null
  childCount: number
  breadcrumb?: BreadcrumbItem[]
}

type OfficeResponse = { office: Office; breadcrumb: BreadcrumbItem[]; children: Office[] }

const LEVEL_LABELS: Record<string, string> = {
  force_hq: 'Force Headquarters',
  zonal: 'Zonal Command',
  state: 'State Command',
  division: 'Divisional HQ',
  station: 'Police Station',
}
const CHILD_HEADINGS: Record<string, string> = {
  force_hq: 'Zonal Commands',
  zonal: 'State Commands',
  state: 'Divisional HQs',
  division: 'Police Stations',
}

function ListedValue({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[var(--portal-dim)]">{label}</dt>
      <dd className="mt-1 break-words text-sm text-[var(--portal-muted)]">
        {value ? href ? <a className="text-[#00c46a] hover:underline" href={href}>{value}</a> : value : 'Not yet listed'}
      </dd>
    </div>
  )
}

export function DirectoryPage() {
  const { officeId } = useParams()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const rootQuery = useQuery({
    queryKey: ['directory-roots'],
    queryFn: () => apiJson<{ offices: Office[] }>('/api/directory/offices'),
    enabled: !officeId && !debouncedSearch,
  })
  const officeQuery = useQuery({
    queryKey: ['directory-office', officeId],
    queryFn: () => apiJson<OfficeResponse>(`/api/directory/offices/${officeId}`),
    enabled: Boolean(officeId) && !debouncedSearch,
  })
  const searchQuery = useQuery({
    queryKey: ['directory-search', debouncedSearch],
    queryFn: () => apiJson<{ offices: Office[] }>(`/api/directory/offices?q=${encodeURIComponent(debouncedSearch)}`),
    enabled: Boolean(debouncedSearch),
  })
  const detail = officeQuery.data
  const office = detail?.office
  const personalFieldsReturned = office
    ? Object.hasOwn(office, 'oicPhone') || Object.hasOwn(office, 'oicEmail')
    : false

  return (
    <div className="sr-app-bg min-h-full">
      <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link to="/" aria-label="Election SitRep home"><BrandLogo size="md" withWordmark /></Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="sr-link-nav rounded-full px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider">Home</Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#00c46a] to-[#00a35a] px-4 py-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[#04251f] shadow-[0_4px_20px_rgba(0,196,106,0.35)] transition hover:brightness-110"
            >
              Sign in <span aria-hidden>→</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--portal-muted)]" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-[#00c46a]">Home</Link>
          <span aria-hidden>/</span>
          <Link to="/directory" className="hover:text-[#00c46a]">Directory</Link>
          {detail?.breadcrumb.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-2">
              <span aria-hidden>/</span>
              <Link to={`/directory/${item.id}`} className="hover:text-[#00c46a]">{item.name}</Link>
            </span>
          ))}
        </div>

        <section className="mt-7">
          <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00c46a]">Nigeria Police Force</p>
          <h1 className="sr-subheading mt-2 font-(--font-display) text-3xl font-bold md:text-4xl">Command Directory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--portal-muted)]">
            Find Force, zonal, state and divisional commands and police stations.
          </p>
          <label className="mt-6 block max-w-xl">
            <span className="sr-only">Search offices</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search office, code or officer in charge"
              className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-4 py-3 text-sm text-[var(--portal-fg)] outline-none transition focus:border-[#00c46a]/60"
            />
          </label>
        </section>

        {debouncedSearch ? (
          <section className="mt-7 space-y-3">
            <h2 className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider text-[var(--portal-dim)]">Search results</h2>
            {searchQuery.isLoading ? <p className="text-sm text-[var(--portal-muted)]">Searching…</p> : null}
            {searchQuery.isError ? <p role="alert" className="text-sm text-red-400">{(searchQuery.error as Error).message}</p> : null}
            {(searchQuery.data?.offices ?? []).map((result) => (
              <Link
                key={result.id}
                to={`/directory/${result.id}`}
                onClick={() => {
                  setSearch('')
                  setDebouncedSearch('')
                }}
                className="sr-card block p-4 transition hover:border-[#00c46a]/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[#00c46a]">{LEVEL_LABELS[result.level] ?? result.level}</span>
                    <h3 className="mt-1 font-semibold text-[var(--sr-heading)]">{result.name}</h3>
                    <p className="mt-1 text-xs text-[var(--portal-muted)]">{(result.breadcrumb ?? []).map((item) => item.name).join(' / ')}</p>
                    {result.oicRank || result.oicName ? <p className="mt-2 text-xs text-[var(--portal-muted)]">{[result.oicRank, result.oicName].filter(Boolean).join(' ')}</p> : null}
                  </div>
                  <span className="text-xs text-[var(--portal-dim)]">{result.code || '—'}</span>
                </div>
              </Link>
            ))}
            {!searchQuery.isLoading && !searchQuery.data?.offices.length ? (
              <p className="sr-card p-6 text-sm text-[var(--portal-muted)]">No matching offices found.</p>
            ) : null}
          </section>
        ) : officeId ? (
          <section className="mt-7">
            {officeQuery.isLoading ? <p className="text-sm text-[var(--portal-muted)]">Loading office…</p> : null}
            {officeQuery.isError ? <p role="alert" className="text-sm text-red-400">{(officeQuery.error as Error).message}</p> : null}
            {office ? (
              <>
                <article className="sr-card p-5 md:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="rounded-full border border-[#00c46a]/30 bg-[#00c46a]/10 px-3 py-1 font-(--font-mono) text-[9px] font-semibold uppercase tracking-wider text-[#00c46a]">
                        {LEVEL_LABELS[office.level] ?? office.level}
                      </span>
                      <h2 className="mt-4 font-(--font-display) text-2xl font-bold text-[var(--sr-heading)] md:text-3xl">{office.name}</h2>
                    </div>
                    <span className="rounded-full border border-[color:var(--portal-border)] px-3 py-1 font-(--font-mono) text-[10px] text-[var(--portal-muted)]">{office.code || 'No code listed'}</span>
                  </div>
                  <dl className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <ListedValue label="State" value={office.stateName} />
                    <ListedValue label="Address" value={office.address} />
                    <ListedValue label="Official office phone" value={office.officePhone} href={office.officePhone ? `tel:${office.officePhone}` : undefined} />
                    <ListedValue label="Official office email" value={office.officeEmail} href={office.officeEmail ? `mailto:${office.officeEmail}` : undefined} />
                    <ListedValue label="OIC rank" value={office.oicRank} />
                    <ListedValue label="Officer in charge" value={office.oicName} />
                    {personalFieldsReturned ? (
                      <>
                        <ListedValue label="OIC direct phone" value={office.oicPhone} href={office.oicPhone ? `tel:${office.oicPhone}` : undefined} />
                        <ListedValue label="OIC direct email" value={office.oicEmail} href={office.oicEmail ? `mailto:${office.oicEmail}` : undefined} />
                      </>
                    ) : (
                      <p className="self-end text-xs text-[var(--portal-dim)] sm:col-span-2 lg:col-span-3">
                        Sign in as police personnel to view the officer's direct contact.
                      </p>
                    )}
                  </dl>
                </article>

                {detail.children.length ? (
                  <section className="mt-8">
                    <h2 className="font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{CHILD_HEADINGS[office.level] ?? 'Offices'}</h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {detail.children.map((child) => (
                        <Link key={child.id} to={`/directory/${child.id}`} className="sr-card block p-4 transition hover:border-[#00c46a]/40">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="break-words font-semibold text-[var(--sr-heading)]">{child.name}</h3>
                              <p className="mt-1 text-xs text-[var(--portal-muted)]">
                                {[child.oicRank, child.oicName].filter(Boolean).join(' ') || 'Not yet listed'}
                              </p>
                              <p className="mt-1 text-xs text-[var(--portal-dim)]">
                                {child.officePhone || 'Not yet listed'} · {child.childCount} {child.childCount === 1 ? 'child office' : 'child offices'}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-[var(--portal-dim)]">{child.code || '—'} →</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className="sr-card mt-8 p-6">
                    <h2 className="font-semibold text-[var(--sr-heading)]">{CHILD_HEADINGS[office.level] ?? 'Subordinate offices'}</h2>
                    <p className="mt-2 text-sm text-[var(--portal-muted)]">No offices have been listed here yet.</p>
                  </div>
                )}
              </>
            ) : null}
          </section>
        ) : (
          <section className="mt-7">
            <h2 className="font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">Force Headquarters</h2>
            {rootQuery.isLoading ? <p className="mt-3 text-sm text-[var(--portal-muted)]">Loading directory…</p> : null}
            {rootQuery.isError ? <p role="alert" className="mt-3 text-sm text-red-400">{(rootQuery.error as Error).message}</p> : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(rootQuery.data?.offices ?? []).map((root) => (
                <Link key={root.id} to={`/directory/${root.id}`} className="sr-card block p-5 transition hover:border-[#00c46a]/40">
                  <span className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[#00c46a]">Force HQ</span>
                  <h3 className="mt-2 font-semibold text-[var(--sr-heading)]">{root.name}</h3>
                  <p className="mt-1 text-xs text-[var(--portal-muted)]">{root.address || 'Address not yet listed'}</p>
                  <p className="mt-3 text-xs text-[var(--portal-dim)]">{root.childCount} zonal {root.childCount === 1 ? 'command' : 'commands'} →</p>
                </Link>
              ))}
            </div>
            {!rootQuery.isLoading && !rootQuery.data?.offices.length ? (
              <p className="sr-card mt-4 p-6 text-sm text-[var(--portal-muted)]">No Force Headquarters office has been listed.</p>
            ) : null}
          </section>
        )}
      </main>
    </div>
  )
}
