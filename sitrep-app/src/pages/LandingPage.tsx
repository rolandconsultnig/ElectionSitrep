import { Link, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'
import { PORTALS, postLoginPath } from '../lib/navigation'

const SECTION_LINKS = [
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'access', label: 'Command portals' },
  { id: 'igp-message', label: "IGP's message" },
  { id: 'about', label: 'About' },
] as const

const STATS = [
  { value: '36 + FCT', label: 'State commands covered' },
  { value: '4', label: 'Isolated command portals' },
  { value: 'EC8', label: 'Aligned result monitoring' },
  { value: 'Offline', label: 'Field-first sync' },
] as const

const CAPABILITIES = [
  {
    title: 'Field situation reporting',
    body: 'Offline-first PWA for polling-unit officers: SitReps, turnout, incidents and vote tallies captured on-device and synced when connectivity returns.',
    icon: (
      <path d="M9 12h6M9 16h4M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 0V3m10 1V3" />
    ),
  },
  {
    title: 'Live national collation',
    body: 'Results and pulse metrics aggregate from polling unit through ward, LGA, state and zonal tiers to Force Headquarters in near real time.',
    icon: (
      <path d="M4 19V9m5.5 10V5M15 19v-8m5 8V7M3 21h18" />
    ),
  },
  {
    title: 'Verified officer identity',
    body: 'Issued credentials, a one-time profile onboarding, and live-camera face verification before any officer reaches a command workspace.',
    icon: (
      <path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 9a7 7 0 0 1 14 0M9.5 21 12 19l2.5 2" />
    ),
  },
  {
    title: 'Immutable audit trail',
    body: 'Cryptographically chained audit design with SHA-256 form evidence — every action traceable to a user, portal and jurisdiction.',
    icon: (
      <path d="M12 3 4.5 6v5c0 4.5 3.2 8.4 7.5 10 4.3-1.6 7.5-5.5 7.5-10V6L12 3Zm-2.5 9 2 2 3.5-4" />
    ),
  },
] as const

const PORTAL_CARDS = [
  {
    id: 'field',
    name: 'Field Command',
    body: 'Polling-unit officers: SitRep submission, turnout, incidents and vote tally with offline capture.',
    accent: '#0dccb0',
  },
  {
    id: 'management',
    name: 'Management Ops',
    body: 'Command operations: officer monitoring, communications and escalation handling across jurisdictions.',
    accent: '#4f96ff',
  },
  {
    id: 'admin',
    name: 'Administration',
    body: 'Election setup, geography, credential batches, user management, audit logs and system settings.',
    accent: '#c9a227',
  },
  {
    id: 'igp',
    name: 'IGP Office',
    body: 'National oversight: executive dashboards, state comparisons and command-level pulse metrics.',
    accent: '#f05b4d',
  },
] as const

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="sr-app-bg relative min-h-full">
      <div className="sr-grid-bg" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 md:px-8">
          <BrandLogo size="md" withWordmark />
          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
            <nav className="hidden flex-wrap items-center gap-1 md:flex" aria-label="Page sections">
              {SECTION_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className="sr-link-nav rounded-lg px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            {!user ? (
              <Link
                to="/login"
                className="sr-btn-primary hidden px-4 py-1.5 text-xs font-semibold md:inline-flex"
              >
                Sign in
              </Link>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {user ? (
        <div className="border-b border-[#0dccb0]/25 bg-[color:var(--sr-banner-bar)] px-4 py-4 md:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[var(--portal-muted)]">
              Signed in as <span className="font-(--font-mono) text-[#0dccb0]">{user.username}</span> →{' '}
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

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20">
          <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0dccb0]/30 bg-[#0dccb0]/10 px-4 py-1.5 font-(--font-mono) text-[11px] font-medium uppercase tracking-[0.2em] text-[#0dccb0]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#0dccb0]" />
                Nigeria Police Force · Internal system
              </p>
              <h1 className="sr-heading-page font-(--font-display) text-[clamp(2.1rem,4.8vw,3.6rem)] font-extrabold leading-[1.05] tracking-tight">
                Election <span className="text-[#0dccb0]">SitRep</span> &amp; vote collation system
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--portal-muted)] md:text-lg">
                Operational intelligence for election-day security — disciplined situation reporting, verified officer
                identity, and live result monitoring from the polling unit to Force Headquarters.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                {!user ? (
                  <Link to="/login" className="sr-btn-primary px-7 py-3">
                    Sign in with issued credentials
                  </Link>
                ) : (
                  <button type="button" onClick={() => navigate(postLoginPath(user))} className="sr-btn-primary px-7 py-3">
                    {user.onboardingComplete ? 'Open your portal' : 'Continue setup'}
                  </button>
                )}
                <a href="#capabilities" className="sr-btn-ghost px-6 py-3">
                  Explore capabilities
                </a>
                <a
                  href="/downloads/npf-sitrep-field.apk"
                  download
                  className="sr-btn-ghost inline-flex items-center gap-2 px-6 py-3"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12" />
                    <path d="m7 11 5 5 5-5" />
                    <path d="M4 19h16" />
                  </svg>
                  Field app (Android)
                </a>
              </div>
              <p className="mt-6 font-(--font-mono) text-[11px] leading-relaxed text-[var(--portal-dim)]">
                Restricted to NPF command tiers and authorised field personnel.
              </p>
            </div>

            <div className="relative flex justify-center lg:justify-end">
              <div className="relative aspect-square w-full max-w-[300px] md:max-w-[330px]">
                <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-[#0dccb0]/25 via-transparent to-[#4f96ff]/20 blur-3xl" />
                <div className="relative flex h-full flex-col items-center justify-center gap-5 rounded-[2rem] border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-8 backdrop-blur-md [box-shadow:var(--sr-card-shadow)]">
                  <img
                    src="/police.png"
                    alt="Nigeria Police Force crest"
                    className="h-auto w-full max-w-[190px] object-contain drop-shadow-2xl md:max-w-[210px]"
                    width={280}
                    height={280}
                  />
                  <div className="w-full border-t border-[color:var(--portal-border)] pt-4 text-center">
                    <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c9a227]">
                      Force Headquarters
                    </p>
                    <p className="mt-1 font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
                      Election security operations
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <dl className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-border)] md:mt-20 md:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="bg-[color:var(--sr-card-grad-b)] px-6 py-6 text-center md:py-7"
              >
                <dt className="order-2 mt-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--portal-dim)]">
                  {s.label}
                </dt>
                <dd className="font-(--font-display) text-2xl font-extrabold text-[var(--sr-heading)] md:text-3xl">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Capabilities */}
        <section
          id="capabilities"
          className="scroll-mt-24 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)]"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
            <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0dccb0]">
              Capabilities
            </p>
            <h2 className="sr-subheading mt-2 max-w-2xl font-(--font-display) text-2xl font-bold md:text-3xl">
              Built for the realities of election-day command
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--portal-muted)]">
              From low-connectivity polling units to national collation rooms, the system keeps reporting disciplined,
              verifiable and visible up the chain of command.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {CAPABILITIES.map((c) => (
                <article
                  key={c.title}
                  className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--sr-card-grad-b)] p-6 [box-shadow:var(--sr-card-shadow)]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#0dccb0]/30 bg-[#0dccb0]/10 text-[#0dccb0]">
                    <Icon>{c.icon}</Icon>
                  </div>
                  <h3 className="mt-5 font-(--font-display) text-base font-bold text-[var(--sr-heading)]">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--portal-muted)]">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Portals */}
        <section id="access" className="scroll-mt-24 border-t border-[color:var(--portal-border)]">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0dccb0]">
                  Access model
                </p>
                <h2 className="sr-subheading mt-2 font-(--font-display) text-2xl font-bold md:text-3xl">
                  Four portals, one chain of command
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-[var(--portal-muted)]">
                Access is issued by your unit — credential batches are generated by rank and role, and jurisdiction is
                enforced at the API.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PORTAL_CARDS.map((p) => (
                <article
                  key={p.id}
                  className="rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--sr-card-grad-b)] p-5"
                >
                  <span
                    className="inline-block h-1 w-10 rounded-full"
                    style={{ backgroundColor: p.accent }}
                    aria-hidden
                  />
                  <h3 className="mt-4 font-(--font-display) text-sm font-bold text-[var(--sr-heading)]">{p.name}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--portal-muted)]">{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* IGP message */}
        <section
          id="igp-message"
          className="scroll-mt-24 border-t border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)]"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
            <div className="sr-card overflow-hidden border-[color:color-mix(in_srgb,var(--color-sr-gold)_35%,var(--portal-border))]">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
                <div className="mx-auto shrink-0 lg:mx-0">
                  <div className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] shadow-[var(--sr-card-shadow)]">
                    <img
                      src="/igp.png"
                      alt="Olatunji Rilwan Disu, Inspector-General of Police"
                      className="mx-auto block h-auto w-full max-w-[220px] object-cover object-top md:max-w-[260px]"
                      width={320}
                      height={400}
                    />
                  </div>
                  <p className="mt-3 text-center font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
                    Inspector-General of Police
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c9a227]">
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
                      This SitRep and collation oversight capability strengthens operational visibility from the polling
                      unit through state and zonal commands to Force Headquarters while respecting INEC&apos;s
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
          </div>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-24 border-t border-[color:var(--portal-border)]">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div>
                <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.22em] text-[#0dccb0]">
                  About the system
                </p>
                <h2 className="sr-subheading mt-2 font-(--font-display) text-2xl font-bold md:text-3xl">
                  Oversight without overreach
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-[var(--portal-muted)]">
                  The NPF Election SitRep &amp; Vote Collation System is an operational intelligence platform for
                  election-day security reporting, field aggregation, and INEC EC8–aligned result <em>monitoring</em>.
                  It does not replace INEC&apos;s constitutional result management.
                </p>
              </div>
              <ul className="grid content-start gap-3 sm:grid-cols-2">
                {[
                  'Offline-first field PWA with secure sync for low-connectivity areas',
                  'Four isolated portals aligned to command structure (Admin, Field, Management, IGP)',
                  'Immutable audit design: cryptographic chaining, SHA-256 for form evidence',
                  '25% Presidential rule and EC8 tier awareness as system constraints where applicable',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--sr-card-grad-b)] px-4 py-3 text-sm text-[var(--portal-muted)]"
                  >
                    <span className="mt-0.5 shrink-0 text-[#0dccb0]">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <footer className="border-t border-[color:var(--portal-border)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 md:px-8">
            <BrandLogo size="sm" withWordmark />
            <p className="font-(--font-mono) text-[10px] leading-relaxed text-[var(--portal-dim)]">
              NPF operational intelligence · Does not replace INEC result management · Restricted to authorised
              personnel
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
