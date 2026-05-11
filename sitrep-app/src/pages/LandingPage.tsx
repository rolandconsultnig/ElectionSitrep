import { Link, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'
import { PORTALS, postLoginPath } from '../lib/navigation'

const SECTION_LINKS = [
  { id: 'about', label: 'About the system' },
  { id: 'igp-message', label: "IGP's message" },
] as const

export function LandingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="sr-app-bg relative min-h-full">
      <div className="sr-grid-bg" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <BrandLogo size="md" withWordmark />
          <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
            <nav className="flex flex-wrap items-center gap-1 md:gap-2" aria-label="Page sections">
              {SECTION_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  className="sr-link-nav rounded-lg px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider"
                >
                  {link.label}
                </a>
              ))}
              {!user ? (
                <Link
                  to="/login"
                  className="sr-link-nav rounded-lg px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider"
                >
                  Sign in
                </Link>
              ) : null}
            </nav>
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

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 md:px-8 md:pb-28 md:pt-14">
        {/* Hero */}
        <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#0dccb0]/30 bg-[#0dccb0]/10 px-4 py-1.5 font-(--font-mono) text-[11px] font-medium uppercase tracking-[0.2em] text-[#0dccb0]">
              NPF internal system
            </p>
            <h1 className="sr-heading-page font-(--font-display) text-[clamp(1.85rem,4.5vw,3.25rem)] font-extrabold leading-[1.1] tracking-tight">
              Election <span className="text-[#0dccb0]">SitRep</span> &amp; vote collation
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--portal-muted)]">
              Use credentials issued by your unit (Admin generates batches by rank and role). After sign-in you complete a one-time
              profile and live photo check, then enter your assigned portal. Your <strong className="text-[#c9a227]">username</strong>{' '}
              still selects the demo portal route until OIDC claims replace prefix routing.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {!user ? (
                <Link to="/login" className="sr-btn-primary px-6">
                  Sign in
                </Link>
              ) : null}
              <a href="#about" className="sr-btn-ghost">
                About the system
              </a>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative aspect-square w-full max-w-[280px] md:max-w-[300px]">
              <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[#0dccb0]/30 via-transparent to-[#4f96ff]/20 blur-2xl" />
              <div className="relative flex h-full items-center justify-center rounded-[2rem] border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-8 backdrop-blur-md [box-shadow:var(--sr-card-shadow)]">
                <img
                  src="/police.png"
                  alt="Nigeria Police Force crest"
                  className="h-auto w-full max-w-[200px] object-contain drop-shadow-2xl md:max-w-[220px]"
                  width={280}
                  height={280}
                />
              </div>
            </div>
          </div>
        </section>

        {/* IGP message */}
        <section id="igp-message" className="mt-20 scroll-mt-28 md:mt-28">
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
                    The Nigeria Police Force remains unwavering in its constitutional duty to secure electoral processes and
                    safeguard citizens during elections. Timely situation reporting and disciplined command coordination are
                    central to public confidence in our democracy.
                  </p>
                  <p>
                    This SitRep and collation oversight capability strengthens operational visibility from the polling unit
                    through state and zonal commands to Force Headquarters while respecting INEC&apos;s constitutional
                    responsibility for result management. We will continue to uphold professionalism, accountability, and
                    national security as guiding principles of election policing.
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
        </section>

        {/* About */}
        <section id="about" className="mt-24 scroll-mt-28 border-t border-[color:var(--portal-border)] pt-16 md:mt-32 md:pt-20">
          <h2 className="sr-subheading font-(--font-display) text-2xl font-bold md:text-3xl">About this project</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--portal-muted)]">
            The NPF Election SitRep &amp; Vote Collation System is an operational intelligence platform for election-day
            security reporting, field aggregation, and INEC EC8–aligned result <em>monitoring</em>. It does not replace
            INEC’s constitutional result management. Access is restricted to NPF command tiers and authorised field
            personnel; jurisdiction is enforced at the API using claims (in production: OIDC / Keycloak + JWT).
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              'Offline-first field PWA with secure sync for low-connectivity areas',
              'Four isolated portals aligned to command structure (Admin, Field, Management, IGP)',
              'Immutable audit design: cryptographic chaining, SHA-256 for form evidence (target architecture)',
              '25% Presidential rule and EC8 tier awareness as system constraints where applicable',
            ].map((item) => (
              <li
                key={item}
                className="flex gap-3 rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-4 py-3 text-sm text-[var(--portal-muted)]"
              >
                <span className="mt-0.5 text-[#0dccb0]">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-20 border-t border-[color:var(--portal-border)] pt-10">
          <p className="text-center font-(--font-mono) text-[10px] leading-relaxed text-[var(--portal-dim)]">
            NPF operational intelligence · Does not replace INEC result management · Demo login does not constitute production
            security
          </p>
        </footer>
      </main>
    </div>
  )
}
