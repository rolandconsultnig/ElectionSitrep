import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'
import { PORTALS, postLoginPath } from '../lib/navigation'
import { portalFromUsername } from '../lib/portalFromUsername'

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
    <div className="sr-app-bg relative min-h-full">
      <div className="sr-grid-bg" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link to="/" className="rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0dccb0]">
            <BrandLogo size="md" withWordmark />
          </Link>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <Link
              to="/"
              className="sr-link-nav rounded-lg px-3 py-1.5 font-(--font-mono) text-[10px] font-semibold uppercase tracking-wider"
            >
              Home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-md px-4 pb-20 pt-12 md:px-8 md:pb-28 md:pt-16">
        <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0dccb0]">Access</p>
        <h1 className="sr-heading-page mt-2 font-(--font-display) text-2xl font-extrabold text-[var(--sr-heading)] md:text-3xl">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--portal-muted)]">
          First sign-in: use your issued username (batch from Admin → Credential batches) or demo accounts such as{' '}
          <code className="rounded bg-[color:var(--portal-table-row-hover)] px-1.5 py-0.5 font-(--font-mono) text-[12px] text-[#0dccb0]">
            admin.demo
          </code>{' '}
          /{' '}
          <code className="rounded bg-[color:var(--portal-table-row-hover)] px-1.5 py-0.5 font-(--font-mono) text-[12px] text-[#0dccb0]">
            field.officer1
          </code>{' '}
          with password <code className="font-(--font-mono) text-[12px] text-[#0dccb0]">demo</code>. After you complete onboarding,
          sign in with your <strong className="text-[var(--sr-heading)]">service number</strong> and the password you set.
        </p>

        <form onSubmit={handleSubmit} className="sr-card mt-8 space-y-4 border-[#0dccb0]/20">
          <div>
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
              <p className="mt-2 font-(--font-mono) text-[11px] text-[#0dccb0]">→ Opens {PORTALS[previewPortal].label}</p>
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
          <Link to="/" className="font-medium text-[#0dccb0] underline-offset-4 hover:underline">
            ← Back to landing page
          </Link>
        </p>
      </main>
    </div>
  )
}
