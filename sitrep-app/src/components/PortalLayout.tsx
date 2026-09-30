import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import type { NavItem, PortalId } from '../lib/navigation'
import { PORTALS } from '../lib/navigation'
import { BrandLogo } from './BrandLogo'
import { CommandAlertCenter } from './CommandAlertCenter'
import { ThemeToggle } from './ThemeToggle'

type Props = { portalId: PortalId }

function NavItemNode({ item, portalId, setMobileNavOpen }: { item: NavItem; portalId: string; setMobileNavOpen: (v: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  
  if (item.subItems) {
    return (
      <div className="mb-0.5">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition duration-200 text-[var(--portal-muted)] hover:bg-[color:var(--portal-table-row-hover)] hover:text-[var(--portal-fg)]"
        >
          <span className="mt-0.5 text-base opacity-90">{item.icon}</span>
          <span className="min-w-0 flex-1 leading-snug text-left">
            <span className="font-(--font-mono) text-[10px] font-medium text-[var(--portal-dim)]">{item.moduleCode}</span>
            <span className="block text-[13px]">{item.label}</span>
          </span>
          <span className={`text-[10px] mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {isOpen && (
          <div className="ml-8 mt-1 flex flex-col gap-1 border-l-[1.5px] border-[color:var(--portal-border)] pl-3">
            {item.subItems.map((sub: NonNullable<NavItem['subItems']>[number]) => (
              <NavLink
                key={sub.id}
                to={sub.path?.startsWith('/') ? sub.path : `/${portalId}/${sub.path}`}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  [
                    'flex items-start gap-3 rounded-xl px-3 py-2 text-[12.5px] font-medium transition duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-[#00c46a]/20 to-transparent text-[#00c46a] shadow-[inset_3px_0_0_#00c46a]'
                      : 'text-[var(--portal-muted)] hover:bg-[color:var(--portal-table-row-hover)] hover:text-[var(--portal-fg)]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className={isActive ? 'font-(--font-mono) text-[10px] font-semibold text-[#00c46a]' : 'font-(--font-mono) text-[10px] font-medium text-[var(--portal-dim)]'}>{sub.moduleCode}</span>
                    <span className="block text-[13px]">{sub.label}</span>
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.path?.startsWith('/') ? item.path : `/${portalId}/${item.path}`}
      onClick={() => setMobileNavOpen(false)}
      className={({ isActive }) =>
        [
          'mb-0.5 flex items-start gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition duration-200',
          isActive
            ? 'bg-gradient-to-r from-[#00c46a]/20 to-transparent text-[#00c46a] shadow-[inset_3px_0_0_#00c46a]'
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
                  ? 'font-(--font-mono) text-[10px] font-semibold text-[#00c46a]'
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
  )
}

export function PortalLayout({ portalId }: Props) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { onlineOfficers } = useSocket()
  const activeFieldOfficers = Object.values(onlineOfficers || {})
  const meta = PORTALS[portalId]
  const [now, setNow] = useState(() => new Date())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const [prevPortalId, setPrevPortalId] = useState(portalId)
  if (portalId !== prevPortalId) {
    setPrevPortalId(portalId)
    setMobileNavOpen(false)
  }

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
    const first = user?.profile?.firstName?.trim() || ''
    const last = user?.profile?.lastName?.trim() || ''
    if (first && last) return (first[0] + last[0]).toUpperCase()
    if (first && first.length >= 2) return first.slice(0, 2).toUpperCase()
    if (last && last.length >= 2) return last.slice(0, 2).toUpperCase()
    return user?.username?.slice(0, 2).toUpperCase() || '—'
  }, [user?.profile?.firstName, user?.profile?.lastName, user?.username])

  const headerSubtitle = user?.profile?.serviceNumber?.trim()
    ? `${user.profile.serviceNumber} · signed in`
    : `${user?.username ?? ''} · signed in`

  const sidebar = (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-[color:var(--portal-border)] bg-[color:var(--sr-shell-sidebar)] py-3 backdrop-blur-md">
      <div className="hidden px-3 pb-3 pt-1 md:block">
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] px-3 py-2">
          <span
            className="size-1.5 shrink-0 rounded-full bg-[#00c46a] shadow-[0_0_8px_rgba(0,196,106,0.9)]"
            aria-hidden
          />
          <span className="truncate font-(--font-mono) text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--portal-muted)]">
            {meta.shortLabel} command module
          </span>
        </div>
      </div>
      <div className="px-4 pb-2 md:hidden">
        <BrandLogo size="sm" withWordmark />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2">
        {meta.nav.map((group) => (
          <div key={group.section} className="mb-1">
            <div className="flex items-center gap-2 px-3 pb-2 pt-4 font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--portal-dim)] first:pt-1">
              <span className="h-px w-3 shrink-0 bg-[#00c46a]/60" aria-hidden />
              {group.section}
            </div>
            {group.items.map((item) => (
              <NavItemNode key={item.id} item={item} portalId={portalId} setMobileNavOpen={setMobileNavOpen} />
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-[color:var(--portal-border)] p-3">
        <div className="flex max-h-[32vh] flex-col gap-2 overflow-y-auto rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] p-3">
          <div className="flex items-center justify-between font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--portal-dim)]">
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00c46a] opacity-50" />
                <span className="relative inline-flex size-1.5 rounded-full bg-[#00c46a]" />
              </span>
              Active Field Units
            </span>
            <span className="rounded-full bg-[#00c46a]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#00c46a]">
              {activeFieldOfficers.length}
            </span>
          </div>
          {activeFieldOfficers.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1.5">
              {activeFieldOfficers.map(officer => (
                <div key={officer.userId} className="flex items-center gap-2 text-[12px] text-[var(--portal-fg)]">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00c46a] opacity-50" />
                    <span className="relative inline-flex size-2 rounded-full bg-[#00c46a]" />
                  </span>
                  <span className="flex-1 truncate font-medium">{officer.username}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 font-(--font-mono) text-[10px] text-[var(--portal-dim)]">No active units</p>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <div className="sr-app-bg flex h-full min-h-0 flex-col">
      <header className="relative z-30 flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-[color:var(--portal-border)] bg-[color:var(--sr-shell-header)] px-3 backdrop-blur-xl md:gap-4 md:px-5">
        <div
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-[#00c46a]/50 to-transparent"
          aria-hidden
        />
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
              title={`${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim() || user?.username}
            >
              {`${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim() || user?.username}
            </span>
            <span className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[var(--portal-dim)]">{headerSubtitle}</span>
          </div>
          <div
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#00c46a]/40 bg-[color:var(--theme-toggle-bg)] text-[var(--portal-fg)] shadow-[0_0_0_2px_rgba(0,196,106,0.12),0_0_16px_rgba(0,196,106,0.18)]"
            title={`${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim() || user?.username}
          >
            {user?.profile?.pictureDataUrl ? (
              <img src={user.profile.pictureDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <span className="font-(--font-mono) text-[11px] font-bold text-[#00c46a]">{avatarInitials}</span>
            )}
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--theme-toggle-bg)] px-3 py-1.5 lg:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#00c46a] opacity-35" />
              <span className="relative inline-flex size-2 rounded-full bg-[#00c46a] shadow-[0_0_10px_rgba(0,196,106,0.6)]" />
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
            {portalId !== 'field' && <CommandAlertCenter basePath={`/${portalId}`} />}
          </div>
        </main>
      </div>
    </div>
  )
}
