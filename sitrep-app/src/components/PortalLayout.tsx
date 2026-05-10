import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { PortalId } from '../lib/navigation'
import { PORTALS } from '../lib/navigation'
import { BrandLogo } from './BrandLogo'
import { ThemeToggle } from './ThemeToggle'

type Props = { portalId: PortalId }

export function PortalLayout({ portalId }: Props) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const meta = PORTALS[portalId]
  const [now, setNow] = useState(() => new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [portalId])

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

  const wat = useMemo(
    () =>
      now.toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' WAT',
    [now],
  )

  const avatarInitials = useMemo(() => {
    const src = user?.profile?.name?.trim() || user?.username?.trim() || ''
    const parts = src.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
    return src.slice(0, 2).toUpperCase() || '—'
  }, [user?.profile?.name, user?.username])

  const headerSubtitle = user?.profile?.serviceNumber?.trim()
    ? `${user.profile.serviceNumber} · signed in`
    : `${user?.username ?? ''} · signed in`

  const sidebar = (
    <aside className="flex h-full w-[270px] shrink-0 flex-col border-r border-[color:var(--portal-border)] bg-[color:var(--sr-shell-sidebar)] py-3 backdrop-blur-md">
      <div className="px-4 pb-2 md:hidden">
        <BrandLogo size="sm" withWordmark />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2">
        {meta.nav.map((group) => (
          <div key={group.section} className="mb-1">
            <div className="px-3 pb-2 pt-4 font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--portal-dim)] first:pt-1">
              {group.section}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.id}
                to={`/${portalId}/${item.path}`}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  [
                    'mb-0.5 flex items-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-[#0dccb0]/20 to-transparent text-[#0dccb0] shadow-[inset_3px_0_0_#0dccb0]'
                      : 'text-[var(--portal-muted)] hover:bg-[color:var(--portal-table-row-hover)] hover:text-[var(--portal-fg)]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="mt-0.5 text-base opacity-90">{item.icon}</span>
                    <span className="min-w-0 flex-1 leading-snug">
                      <span
                        className={
                          isActive
                            ? 'font-(--font-mono) text-[10px] font-semibold text-[#0dccb0]'
                            : 'font-(--font-mono) text-[10px] font-medium text-[var(--portal-dim)]'
                        }
                      >
                        {item.moduleCode}
                      </span>
                      <span className="block text-[13px]">{item.label}</span>
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-[color:var(--portal-border)] p-4">
        <p className="font-(--font-mono) text-[9px] leading-relaxed text-[var(--portal-dim)]">
          Jurisdiction enforced server-side. UI mirrors RBAC only.
        </p>
      </div>
    </aside>
  )

  return (
    <div className="sr-app-bg flex h-full min-h-0 flex-col">
      <header className="relative z-30 flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--sr-shell-header)] px-3 backdrop-blur-xl md:gap-4 md:px-5">
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] text-[var(--portal-fg)] md:hidden"
          aria-expanded={mobileNavOpen}
          aria-label="Open navigation menu"
          onClick={() => setMobileNavOpen(true)}
        >
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="hidden min-w-0 md:flex md:items-center md:gap-3">
          <BrandLogo size="md" />
          <div className="hidden h-9 w-px bg-[color:var(--portal-border)] lg:block" aria-hidden />
          <div className="hidden min-w-0 lg:block">
            <div className="font-(--font-display) text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--portal-muted)]">
              Command intelligence
            </div>
            <div className="truncate font-(--font-display) text-sm font-extrabold text-[var(--sr-heading)]">
              SitRep &amp; collation
            </div>
          </div>
        </div>

        <span
          className={`hidden max-w-[200px] truncate rounded-full border px-3 py-1 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider sm:inline-flex ${meta.accentClass}`}
        >
          {meta.shortLabel} · {meta.label}
        </span>

        <div className="ml-auto flex max-w-[min(100%,480px)] items-center gap-2 sm:gap-3">
          <div className="hidden min-w-0 flex-col items-end text-right sm:flex">
            <span
              className="truncate font-(--font-mono) text-[10px] font-medium text-[var(--portal-muted)]"
              title={user?.profile?.name || user?.username}
            >
              {user?.profile?.name?.trim() || user?.username}
            </span>
            <span className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[var(--portal-dim)]">{headerSubtitle}</span>
          </div>
          <div
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] text-[var(--portal-fg)] shadow-inner"
            title={user?.profile?.name || user?.username}
          >
            {user?.profile?.pictureDataUrl ? (
              <img src={user.profile.pictureDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="font-(--font-mono) text-[11px] font-bold text-[#0dccb0]">{avatarInitials}</span>
            )}
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] px-3 py-1.5 lg:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#0dccb0] opacity-35" />
              <span className="relative inline-flex size-2 rounded-full bg-[#0dccb0] shadow-[0_0_10px_rgba(13,204,176,0.6)]" />
            </span>
            <span className="font-(--font-mono) text-[11px] tabular-nums text-[var(--portal-muted)]">{wat}</span>
          </div>
          <ThemeToggle variant="icon" className="!px-2.5 !py-2" />
          <button
            type="button"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
            className="sr-btn-ghost shrink-0 px-3 py-2 text-xs"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="hidden md:flex md:min-h-0">{sidebar}</div>

        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <div
          className={[
            'fixed inset-y-0 left-0 z-50 w-[min(288px,92vw)] transition-transform duration-300 ease-out md:hidden',
            mobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full pointer-events-none',
          ].join(' ')}
        >
          <div className="flex h-full flex-col border-r border-[color:var(--portal-border)] bg-[color:var(--sr-shell-sidebar)] shadow-xl">
            {sidebar}
          </div>
          <button
            type="button"
            className="absolute -right-3 top-4 flex size-9 items-center justify-center rounded-full border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] text-[var(--portal-fg)] shadow-lg md:hidden"
            aria-label="Close"
            onClick={() => setMobileNavOpen(false)}
          >
            ✕
          </button>
        </div>

        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="sr-grid-bg pointer-events-none" aria-hidden />
          <div className="relative z-[1] mx-auto max-w-[1600px] p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
