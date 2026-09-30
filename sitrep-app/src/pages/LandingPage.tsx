import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { Reveal } from '../components/Reveal'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'
import { PORTALS, postLoginPath } from '../lib/navigation'

const SECTION_LINKS = [
  { id: 'portals', label: 'Portals' },
  { id: 'command', label: 'Command structure' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'igp-message', label: "IGP's message" },
  { id: 'about', label: 'About' },
] as const

const COVERAGE_STATS = [
  { value: 37, suffix: '', label: 'State commands + FCT' },
  { value: 774, suffix: '', label: 'Local government areas' },
  { value: 176, suffix: 'k+', label: 'Polling units covered' },
  { value: 4, suffix: '', label: 'Command portals' },
] as const

const PORTAL_CARDS = [
  {
    id: 'admin',
    icon: '◈',
    title: 'Admin Portal',
    desc: 'Election configuration, geography, credential batches, roles and the immutable audit trail.',
    accent: 'text-red-400 border-red-500/40 bg-red-500/10',
    bar: 'bg-red-500',
    glow: 'rgba(240, 91, 77, 0.14)',
  },
  {
    id: 'field',
    icon: '📝',
    title: 'Field Portal',
    desc: 'Offline-first SitReps, voting status, turnout counts and incident capture at the polling unit.',
    accent: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    bar: 'bg-amber-500',
    glow: 'rgba(232, 164, 60, 0.14)',
  },
  {
    id: 'management',
    icon: '📡',
    title: 'Management Portal',
    desc: 'State and area command situation rooms, live scoped feeds, escalation and operational orders.',
    accent: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    bar: 'bg-blue-500',
    glow: 'rgba(79, 150, 255, 0.16)',
  },
  {
    id: 'igp',
    icon: '🛡',
    title: 'IGP Portal',
    desc: 'Executive national overview, hotspot intelligence, security posture and briefing for Force HQ.',
    accent: 'text-[#d9b64a] border-[#d9b64a]/40 bg-[#d9b64a]/10',
    bar: 'bg-[#d9b64a]',
    glow: 'rgba(0, 200, 150, 0.16)',
  },
] as const

const COMMAND_CHAIN = [
  { tier: 'Force Headquarters', detail: 'National situation room · IGP & command staff', tag: 'FHQ' },
  { tier: 'Zonal Commands', detail: 'Multi-state coordination and reinforcement', tag: 'ZONAL' },
  { tier: 'State Commands', detail: 'State-scoped dashboards · 36 states + FCT', tag: 'STATE' },
  { tier: 'Area Commands', detail: 'LGA-scoped feeds, wards and polling units', tag: 'AREA' },
  { tier: 'Polling Units', detail: 'Field officers file from the point of voting', tag: 'PU' },
] as const

const CAPABILITIES = [
  {
    icon: '📡',
    title: 'Live jurisdiction-scoped feeds',
    desc: 'Every command sees only its own territory. Oyo State Command sees Oyo alone; an Area Command sees its LGA; Force HQ sees the nation.',
  },
  {
    icon: '🛰',
    title: 'Offline-first field capture',
    desc: 'SitReps, EC8A-aligned tallies and incidents queue on-device and sync securely when connectivity returns.',
  },
  {
    icon: '🚨',
    title: 'Severity ladder & escalation',
    desc: 'Routine, incident and violence-flash reports flow up the chain with acknowledge / escalate / resolve workflow states.',
  },
  {
    icon: '🗺',
    title: 'Operational mapping',
    desc: 'State boundaries, polling-unit pins and officer positions on one tactical map — from national theatre to a single ward.',
  },
  {
    icon: '🗳',
    title: 'Result monitoring (EC8-aware)',
    desc: 'Vote tallies observed at source with the 25% spread rule surfaced — monitoring only; INEC remains the result authority.',
  },
  {
    icon: '🔐',
    title: 'Immutable audit & identity',
    desc: 'Credential batches, live-photo onboarding, and hash-chained audit logging of every sensitive action.',
  },
] as const

const SITREP_WORKFLOW = [
  { step: '01', title: 'Report', desc: 'Field officer or command desk files a SitRep, incident or violence flash with severity and location.' },
  { step: '02', title: 'Scope', desc: 'The API pins the report to the author’s jurisdiction — polling unit, LGA, state — automatically.' },
  { step: '03', title: 'Acknowledge', desc: 'The responsible command acknowledges receipt; timers and status are visible on every dashboard.' },
  { step: '04', title: 'Escalate', desc: 'Unresolved criticals escalate upward — area → state → Force HQ — until resolved.' },
] as const

const TICKER_ITEMS = [
  'Jurisdiction-scoped visibility',
  'Offline-first field capture',
  'Severity ladder & escalation',
  'EC8-aware result monitoring',
  'Immutable audit trail',
  'Live operational mapping',
  'Credential batch issuance',
  'Force HQ national picture',
] as const

/** Animates a number from 0 to target the first time it enters the viewport. */
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setValue(target)
      return
    }
    let raf = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        const start = performance.now()
        const duration = 1400
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration)
          const eased = 1 - Math.pow(1 - t, 3)
          setValue(Math.round(target * eased))
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [target])

  return (
    <span ref={ref}>
      {value.toLocaleString()}
      {suffix}
    </span>
  )
}

/** Tracks pointer position so portal cards can render an accent glow that follows the cursor. */
function trackGlow(e: MouseEvent<HTMLElement>, color: string) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--sr-glow-x', `${e.clientX - rect.left}px`)
  el.style.setProperty('--sr-glow-y', `${e.clientY - rect.top}px`)
  el.style.setProperty('--sr-glow-color', color)
}

export function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const progressRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onScroll = () => {
      const el = progressRef.current
      if (!el) return
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      el.style.setProperty('--sr-scroll', max > 0 ? `${Math.min(1, window.scrollY / max)}` : '0')
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="sr-app-bg relative min-h-full">
      <div className="sr-grid-bg" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <BrandLogo size="md" withWordmark />
          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
            <nav
              className="flex flex-wrap items-center gap-1 rounded-full border border-[color:var(--portal-border)] bg-[color:var(--sr-btn-ghost-bg)] px-1.5 py-1 md:gap-2"
              aria-label="Page sections"
            >
              {SECTION_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className="sr-link-nav rounded-full px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            {!user ? (
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#00c46a] to-[#00a35a] px-4 py-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[#04251f] shadow-[0_4px_20px_rgba(0,196,106,0.35)] transition hover:brightness-110 active:scale-[0.97]"
              >
                Sign in
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
        <div
          ref={progressRef}
          className="sr-scroll-progress h-0.5 bg-gradient-to-r from-[#00c46a] via-[#4f96ff] to-[#d9b64a]"
          aria-hidden
        />
      </header>

      {user ? (
        <div className="border-b border-[#00c46a]/25 bg-[color:var(--sr-banner-bar)] px-4 py-4 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[var(--portal-muted)]">
              Signed in as <span className="font-(--font-mono) text-[#00c46a]">{user.username}</span>
              {user.jurisdiction && user.jurisdiction.level !== 'national' ? (
                <>
                  {' '}
                  ·{' '}
                  <span className="font-(--font-mono) text-[#d9b64a]">
                    {user.jurisdiction.level === 'area'
                      ? `${user.jurisdiction.lgaName} Area Command`
                      : `${user.jurisdiction.stateName} State Command`}
                  </span>
                </>
              ) : null}{' '}
              →{' '}
              <strong className="text-[var(--sr-heading)]">
                {PORTALS[user.portalId as keyof typeof PORTALS]?.label ?? user.portalId}
              </strong>
            </p>
            <button type="button" onClick={() => navigate(postLoginPath(user))} className="sr-btn-primary px-6">
              {user.onboardingComplete ? 'Open your portal' : 'Continue setup'}
            </button>
          </div>
        </div>
      ) : null}

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 md:px-8 md:pb-28 md:pt-14">
        {/* Hero */}
        <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <Reveal>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#00c46a]/30 bg-[#00c46a]/10 px-4 py-1.5 font-(--font-mono) text-[11px] font-medium uppercase tracking-[0.2em] text-[#00c46a]">
                <span className="size-1.5 animate-pulse rounded-full bg-[#00c46a]" />
                Nigeria Police Force · Election security operations
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="sr-heading-page font-(--font-display) text-[clamp(1.85rem,4.5vw,3.25rem)] font-extrabold leading-[1.1] tracking-tight">
                One national picture.
                <br />
                Every command, <span className="bg-gradient-to-r from-[#00c46a] to-[#4f96ff] bg-clip-text text-transparent">its own territory.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--portal-muted)]">
                The Election SitRep &amp; Vote Collation System moves situation reports from the polling unit to Force
                Headquarters in seconds — scoped by jurisdiction, so each state and area command works from exactly the
                ground it is responsible for, and nothing else.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap gap-3">
                {!user ? (
                  <Link to="/login" className="sr-btn-primary px-6">
                    Sign in with issued credentials
                  </Link>
                ) : null}
                <a href="#capabilities" className="sr-btn-ghost">
                  Explore capabilities
                  <span aria-hidden className="text-[#00c46a]">↓</span>
                </a>
              </div>
            </Reveal>

            {/* Coverage strip */}
            <Reveal delay={320}>
              <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-border)] shadow-[var(--sr-card-shadow)] sm:grid-cols-4">
                {COVERAGE_STATS.map((s) => (
                  <div
                    key={s.label}
                    className="bg-[color:var(--sr-card-grad-b)] px-4 py-4 text-center transition-colors hover:bg-[color:var(--portal-table-row-hover)]"
                  >
                    <dt className="order-2 mt-1 block font-(--font-mono) text-[9px] uppercase tracking-widest text-[var(--portal-dim)]">
                      {s.label}
                    </dt>
                    <dd className="font-(--font-display) text-2xl font-extrabold text-[var(--sr-heading)]">
                      <CountUp target={s.value} suffix={s.suffix} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* Crest showcase */}
          <Reveal delay={200} className="relative flex justify-center lg:justify-end">
            <div className="relative aspect-square w-full max-w-[300px] md:max-w-[330px]">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[#00c46a]/30 via-transparent to-[#4f96ff]/20 blur-2xl" />
              {/* spinning conic accent ring */}
              <div
                className="sr-ring-spin absolute -inset-3 rounded-[2.4rem] opacity-60"
                aria-hidden
                style={{
                  background:
                    'conic-gradient(from 0deg, transparent 0%, rgba(0,196,106,0.5) 12%, transparent 26%, transparent 55%, rgba(217,182,74,0.45) 68%, transparent 82%)',
                  mask: 'linear-gradient(black, black) content-box, linear-gradient(black, black)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  padding: '2px',
                }}
              />
              <div className="sr-ping-ring absolute inset-6 rounded-[2rem] border border-[#00c46a]/30" aria-hidden />
              <div className="relative flex h-full items-center justify-center rounded-[2rem] border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-8 backdrop-blur-md [box-shadow:var(--sr-card-shadow)]">
                <img
                  src="/police.png"
                  alt="Nigeria Police Force crest"
                  className="sr-float h-auto w-full max-w-[210px] object-contain drop-shadow-[0_12px_32px_rgba(0,196,106,0.25)] md:max-w-[230px]"
                  width={318}
                  height={263}
                />
              </div>

              {/* Floating status chips */}
              <div className="sr-float absolute -left-6 top-8 hidden items-center gap-2 rounded-full border border-[#00c46a]/30 bg-[color:var(--sr-card-grad-a)] px-3 py-1.5 backdrop-blur-md [box-shadow:var(--sr-card-shadow)] sm:inline-flex">
                <span className="size-1.5 animate-pulse rounded-full bg-[#00c46a]" />
                <span className="font-(--font-mono) text-[9px] font-semibold uppercase tracking-widest text-[var(--portal-muted)]">
                  FHQ · Live feed
                </span>
              </div>
              <div className="sr-float-delayed absolute -right-4 bottom-10 hidden items-center gap-2 rounded-full border border-[#e8a43c]/30 bg-[color:var(--sr-card-grad-a)] px-3 py-1.5 backdrop-blur-md [box-shadow:var(--sr-card-shadow)] sm:inline-flex">
                <span className="size-1.5 rounded-full bg-[#e8a43c]" />
                <span className="font-(--font-mono) text-[9px] font-semibold uppercase tracking-widest text-[var(--portal-muted)]">
                  Offline-first sync
                </span>
              </div>
              <div className="sr-float absolute -bottom-4 left-8 hidden items-center gap-2 rounded-full border border-[#4f96ff]/30 bg-[color:var(--sr-card-grad-a)] px-3 py-1.5 backdrop-blur-md [box-shadow:var(--sr-card-shadow)] sm:inline-flex [animation-delay:2.2s]">
                <span className="size-1.5 rounded-full bg-[#4f96ff]" />
                <span className="font-(--font-mono) text-[9px] font-semibold uppercase tracking-widest text-[var(--portal-muted)]">
                  EC8-aware
                </span>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Ticker */}
        <Reveal className="mt-16 md:mt-20">
          <div className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] py-3 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
            <div className="sr-marquee-track flex w-max items-center gap-8 pr-8">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
                <span
                  key={`${item}-${i}`}
                  className="flex items-center gap-8 whitespace-nowrap font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--portal-dim)]"
                >
                  {item}
                  <span className="text-[#00c46a]" aria-hidden>
                    ◆
                  </span>
                </span>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Portal access */}
        <section id="portals" className="mt-20 scroll-mt-28 md:mt-28">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00c46a]">
                  Access
                </p>
                <h2 className="sr-subheading mt-2 font-(--font-display) text-2xl font-bold md:text-3xl">
                  Four portals, one chain of command
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-[var(--portal-muted)]">
                Credentials are issued by Admin in batches by rank and role. Your username and jurisdiction assignment
                determine exactly which portal — and which territory — you see.
              </p>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PORTAL_CARDS.map((p, i) => (
              <Reveal key={p.id} delay={i * 90}>
                <Link
                  to="/login"
                  onMouseMove={(e) => trackGlow(e, p.glow)}
                  className="group relative block h-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-5 shadow-[var(--sr-card-shadow)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[color:var(--portal-border-strong)]"
                >
                  <span
                    className="sr-card-glow pointer-events-none absolute inset-0"
                    aria-hidden
                    style={{ '--sr-glow-color': p.glow } as CSSProperties}
                  />
                  <span className={`absolute left-0 top-0 h-full w-1 ${p.bar}`} aria-hidden />
                  <span
                    className={`relative inline-flex size-10 items-center justify-center rounded-xl border text-lg transition-transform duration-300 group-hover:scale-110 ${p.accent}`}
                  >
                    {p.icon}
                  </span>
                  <h3 className="relative mt-4 font-(--font-display) text-base font-bold text-[var(--sr-heading)]">
                    {p.title}
                  </h3>
                  <p className="relative mt-2 text-xs leading-relaxed text-[var(--portal-muted)]">{p.desc}</p>
                  <span className="relative mt-4 inline-flex items-center gap-1 font-(--font-mono) text-[10px] font-semibold uppercase tracking-widest text-[var(--portal-dim)] transition-colors group-hover:text-[#00c46a]">
                    Enter
                    <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Command structure */}
        <section id="command" className="mt-20 scroll-mt-28 md:mt-28">
          <Reveal>
            <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d9b64a]">
              Command structure
            </p>
            <h2 className="sr-subheading mt-2 font-(--font-display) text-2xl font-bold md:text-3xl">
              Reports climb. Visibility stays scoped.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--portal-muted)]">
              Each tier of the Nigeria Police Force operates its own situation room. A state command dashboard contains
              that state alone; an area command contains its LGA; Force Headquarters holds the national picture.
            </p>
          </Reveal>
          <ol className="mt-8 space-y-0">
            {COMMAND_CHAIN.map((c, i) => (
              <Reveal as="li" key={c.tier} delay={i * 80} className="relative flex gap-4 pb-6 last:pb-0">
                {i < COMMAND_CHAIN.length - 1 ? (
                  <span
                    className="absolute left-[19px] top-10 h-full w-px bg-gradient-to-b from-[#00c46a]/50 via-[color:var(--portal-border)] to-transparent"
                    aria-hidden
                  />
                ) : null}
                <span className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-[#00c46a]/40 bg-[#00c46a]/10 font-(--font-mono) text-[9px] font-bold tracking-wider text-[#00c46a] shadow-[0_0_16px_rgba(0,196,106,0.15)]">
                  {c.tag}
                </span>
                <div className="flex-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-4 py-3 transition-colors hover:border-[#00c46a]/30">
                  <p className="text-sm font-semibold text-[var(--sr-heading)]">{c.tier}</p>
                  <p className="mt-0.5 text-xs text-[var(--portal-muted)]">{c.detail}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="mt-20 scroll-mt-28 md:mt-28">
          <Reveal>
            <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00c46a]">
              Capabilities
            </p>
            <h2 className="sr-subheading mt-2 font-(--font-display) text-2xl font-bold md:text-3xl">
              Built for election day, end to end
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div className="group h-full rounded-2xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-5 shadow-[var(--sr-card-shadow)] transition-all duration-300 hover:-translate-y-1 hover:border-[#00c46a]/30">
                  <span
                    className="inline-flex size-11 items-center justify-center rounded-xl border border-[#00c46a]/25 bg-[#00c46a]/10 text-xl transition-transform duration-300 group-hover:scale-110"
                    aria-hidden
                  >
                    {f.icon}
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-[var(--sr-heading)]">{f.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--portal-muted)]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* SitRep workflow */}
          <Reveal className="mt-10">
            <div className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-6">
              <h3 className="font-(--font-display) text-lg font-bold text-[var(--sr-heading)]">
                The SitRep lifecycle
              </h3>
              <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {SITREP_WORKFLOW.map((w, i) => (
                  <div key={w.step} className="relative">
                    {i < SITREP_WORKFLOW.length - 1 ? (
                      <span
                        className="absolute -right-4 top-3 hidden text-[var(--portal-dim)] lg:block"
                        aria-hidden
                      >
                        →
                      </span>
                    ) : null}
                    <p className="font-(--font-mono) text-2xl font-extrabold text-[#00c46a]/60">{w.step}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--sr-heading)]">{w.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--portal-muted)]">{w.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* IGP message */}
        <section id="igp-message" className="mt-20 scroll-mt-28 md:mt-28">
          <Reveal>
            <div className="sr-card relative overflow-hidden border-[color:color-mix(in_srgb,var(--color-sr-gold)_35%,var(--portal-border))]">
              <span
                className="pointer-events-none absolute -right-6 -top-10 select-none font-(--font-display) text-[180px] font-extrabold leading-none text-[#d9b64a]/10"
                aria-hidden
              >
                &ldquo;
              </span>
              <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
                <div className="mx-auto shrink-0 lg:mx-0">
                  <div className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] shadow-[var(--sr-card-shadow)]">
                    <img
                      src="/igp.png"
                      alt="Olatunji Rilwan Disu, Inspector-General of Police"
                      className="mx-auto block h-auto w-full max-w-[220px] object-cover object-top transition-transform duration-500 hover:scale-[1.03] md:max-w-[260px]"
                      width={320}
                      height={400}
                    />
                  </div>
                  <p className="mt-3 text-center font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
                    Inspector-General of Police
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d9b64a]">
                    Statement
                  </p>
                  <h2 className="sr-subheading mt-2 font-(--font-display) text-xl font-bold md:text-2xl">
                    Message from the Inspector-General of Police
                  </h2>
                  <blockquote className="sr-igp-quote mt-6 space-y-4 pl-1 text-base leading-relaxed">
                    <p>
                      The Nigeria Police Force remains unwavering in its constitutional duty to secure electoral
                      processes and safeguard citizens during elections. Timely situation reporting and disciplined
                      command coordination are central to public confidence in our democracy.
                    </p>
                    <p>
                      This SitRep and collation oversight capability strengthens operational visibility from the
                      polling unit through state and zonal commands to Force Headquarters while respecting INEC&apos;s
                      constitutional responsibility for result management. We will continue to uphold professionalism,
                      accountability, and national security as guiding principles of election policing.
                    </p>
                  </blockquote>
                  <footer className="mt-8 border-t border-[color:var(--portal-border)] pt-6">
                    <p className="font-(--font-display) text-base font-bold text-[var(--sr-heading)]">
                      Olatunji Rilwan Disu, <span className="font-normal text-[var(--portal-muted)]">psc, NPM</span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--portal-muted)]">Inspector-General of Police</p>
                  </footer>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* About */}
        <section id="about" className="mt-24 scroll-mt-28 border-t border-[color:var(--portal-border)] pt-16 md:mt-32 md:pt-20">
          <Reveal>
            <h2 className="sr-subheading font-(--font-display) text-2xl font-bold md:text-3xl">About this project</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--portal-muted)]">
              The NPF Election SitRep &amp; Vote Collation System is an operational intelligence platform for
              election-day security reporting, field aggregation, and INEC EC8–aligned result <em>monitoring</em>. It
              does not replace INEC’s constitutional result management. Access is restricted to NPF command tiers and
              authorised field personnel; jurisdiction is enforced at the API on every request.
            </p>
          </Reveal>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              'Jurisdiction scoping enforced server-side — a command can never read outside its territory',
              'Offline-first field PWA with secure sync for low-connectivity areas',
              'Immutable audit design: cryptographic chaining, SHA-256 for form evidence (target architecture)',
              '25% Presidential rule and EC8 tier awareness as system constraints where applicable',
            ].map((item, i) => (
              <Reveal as="li" key={item} delay={(i % 2) * 90}>
                <div className="flex h-full gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-4 py-3 text-sm text-[var(--portal-muted)] transition-colors hover:border-[#00c46a]/30">
                  <span className="mt-0.5 text-[#00c46a]">✓</span>
                  {item}
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t border-[color:var(--portal-border)] pt-10">
          <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
            <BrandLogo size="sm" withWordmark />
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Footer sections">
              {SECTION_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider text-[var(--portal-dim)] transition-colors hover:text-[#00c46a]"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#00c46a]/25 bg-[#00c46a]/10 px-3 py-1.5 font-(--font-mono) text-[9px] font-semibold uppercase tracking-widest text-[#00c46a]">
              <span className="size-1.5 animate-pulse rounded-full bg-[#00c46a]" />
              Demo environment
            </p>
          </div>
          <p className="mt-8 text-center font-(--font-mono) text-[10px] leading-relaxed text-[var(--portal-dim)]">
            NPF operational intelligence · Does not replace INEC result management · Demo login does not constitute
            production security
          </p>
        </footer>
      </main>
    </div>
  )
}
