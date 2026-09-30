import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'
import { PORTALS, postLoginPath } from '../lib/navigation'
import { portalFromUsername } from '../lib/portalFromUsername'

const ACCESS_POINTS = [
  { icon: '🛡', label: 'Jurisdiction-scoped by design', detail: 'You only ever see the ground you command — enforced at the API.' },
  { icon: '📡', label: 'Live SitRep pipeline', detail: 'Polling-unit reports reach Force HQ in seconds, offline-first.' },
  { icon: '🔐', label: 'Issued credentials only', detail: 'Batch-issued usernames, service numbers and immutable audit.' },
] as const

export function LoginPage() {
  const navigate = useNavigate()
  const { user, login, bootstrapping } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const previewPortal = useMemo(() => {
    if (!username.trim()) return null
    return portalFromUsername(username)
  }, [username])

  if (bootstrapping) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[color:var(--sr-app-bg)] p-8 text-sm text-[var(--portal-muted)]">
        Restoring session…
      </div>
    )
  }

  if (user) {
    return <Navigate to={postLoginPath(user)} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const result = await login(username, password)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      navigate(result.redirectTo, { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sr-app-bg relative grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <div className="sr-grid-bg" aria-hidden />

      {/* Brand / command panel */}
      <aside className="relative hidden overflow-hidden border-r border-[color:var(--portal-border)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -left-32 top-1/4 size-[420px] rounded-full bg-[#00c46a]/15 blur-[120px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-20 bottom-0 size-[320px] rounded-full bg-[#d9b64a]/10 blur-[100px]"
          aria-hidden
        />
        <div className="relative">
          <Link to="/" className="inline-block rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00c46a]">
            <BrandLogo size="lg" withWordmark />
          </Link>
          <h1 className="sr-heading-page mt-14 max-w-md font-(--font-display) text-4xl font-extrabold leading-[1.12] tracking-tight">
            Command access for election security operations.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-[var(--portal-muted)]">
            One national picture, built from thousands of polling-unit reports — every command signed in here sees
            exactly its own territory, and nothing else.
          </p>
          <ul className="mt-10 space-y-5">
            {ACCESS_POINTS.map((p) => (
              <li key={p.label} className="flex max-w-md gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#00c46a]/30 bg-[#00c46a]/10 text-base">
                  {p.icon}
                </span>
                <div>
                  <p className="text-sm font-bold text-[var(--sr-heading)]">{p.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--portal-muted)]">{p.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 font-(--font-mono) text-[10px] uppercase tracking-[0.18em] text-[var(--portal-dim)]">
          NPF operational intelligence · INEC remains the result authority
        </p>
      </aside>

      {/* Form column */}
      <div className="relative flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl lg:border-b-0 lg:bg-transparent">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-8">
            <Link to="/" className="rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00c46a] lg:hidden">
              <BrandLogo size="md" withWordmark />
            </Link>
            <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-3">
              <Link
                to="/"
                className="sr-link-nav rounded-full px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider"
              >
                ← Home
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 pt-6 md:px-8">
          <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#00c46a]">Secure access</p>
          <h2 className="sr-heading-page mt-2 font-(--font-display) text-2xl font-extrabold text-[var(--sr-heading)] md:text-3xl">
            Sign in
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--portal-muted)]">
            First sign-in: use your issued username (batch from Admin → Credential batches) or demo accounts such as{' '}
            <code className="rounded bg-[color:var(--portal-table-row-hover)] px-1.5 py-0.5 font-(--font-mono) text-[12px] text-[#00c46a]">
              admin.demo
            </code>{' '}
            /{' '}
            <code className="rounded bg-[color:var(--portal-table-row-hover)] px-1.5 py-0.5 font-(--font-mono) text-[12px] text-[#00c46a]">
              field.officer1
            </code>{' '}
            with password <code className="font-(--font-mono) text-[12px] text-[#00c46a]">demo</code>. After you complete
            onboarding, sign in with your <strong className="text-[var(--sr-heading)]">service number</strong> and the
            password you set.
          </p>

          <form onSubmit={handleSubmit} className="sr-card relative mt-8 space-y-4 overflow-hidden !rounded-2xl border-[#00c46a]/25">
            <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#00c46a] via-[#34e58f] to-[#d9b64a]" aria-hidden />
            <div className="pt-1">
              <label className="sr-label" htmlFor="login-username">
                Username or service number
              </label>
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="sr-input"
                placeholder="Issued username or AP / service number"
              />
              {previewPortal ? (
                <p className="mt-2 font-(--font-mono) text-[11px] text-[#00c46a]">→ Opens {PORTALS[previewPortal].label}</p>
              ) : username.trim() && /[._]/.test(username) ? (
                <p className="mt-2 font-(--font-mono) text-[11px] text-[#f59e0b]">No portal matched — check issued username prefix.</p>
              ) : username.trim() ? (
                <p className="mt-2 font-(--font-mono) text-[11px] text-[var(--portal-dim)]">
                  Service-number login works after profile setup; portal is chosen from your account.
                </p>
              ) : null}
            </div>
            <div>
              <label className="sr-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="sr-input"
                placeholder="Issued password from your batch"
              />
            </div>
            {formError ? (
              <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
                {formError}
              </p>
            ) : null}
            <button type="submit" disabled={submitting} className="sr-btn-primary w-full justify-center py-3 disabled:opacity-60">
              {submitting ? 'Signing in…' : 'Sign in & open portal'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[var(--portal-muted)]">
            <Link to="/" className="font-medium text-[#00c46a] underline-offset-4 hover:underline">
              ← Back to landing page
            </Link>
          </p>
        </main>
      </div>
    </div>
  )
}
