import { useCallback, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { LivenessCapture } from '../components/LivenessCapture'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth, type OfficerProfile } from '../contexts/AuthContext'
import { PORTALS, firstNavPath } from '../lib/navigation'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user, completeOnboarding, bootstrapping } = useAuth()
  const [name, setName] = useState('')
  const [serviceNumber, setServiceNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [pictureDataUrl, setPictureDataUrl] = useState<string | null>(null)
  const [livenessVerified, setLivenessVerified] = useState(false)
  const [livenessReset, setLivenessReset] = useState(0)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleLivenessVerified = useCallback((dataUrl: string) => {
    setPictureDataUrl(dataUrl)
    setLivenessVerified(true)
  }, [])

  if (bootstrapping) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[color:var(--sr-app-bg)] p-8 text-sm text-[var(--portal-muted)]">
        Restoring session…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.onboardingComplete) {
    return <Navigate to={firstNavPath(user.portalId)} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setFormError(null)

    if (!name.trim()) {
      setFormError('Enter your full name.')
      return
    }
    if (!serviceNumber.trim()) {
      setFormError('Enter your service number.')
      return
    }
    if (!phone.trim()) {
      setFormError('Enter your phone number.')
      return
    }
    if (!livenessVerified || !pictureDataUrl) {
      setFormError('Complete live photo verification (blinks + Capture photo) before continuing.')
      return
    }
    if (newPassword.length < 8) {
      setFormError('Choose a new password with at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setFormError('Password confirmation does not match.')
      return
    }

    const profile: OfficerProfile = {
      name: name.trim(),
      serviceNumber: serviceNumber.trim(),
      phone: phone.trim(),
      pictureDataUrl,
      livenessVerified: true,
      livenessCheckedAt: new Date().toISOString(),
    }

    setSubmitting(true)
    try {
      await completeOnboarding(profile, newPassword, confirmPassword)
      navigate(firstNavPath(user.portalId), { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save your profile.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="sr-app-bg relative min-h-full">
      <div className="sr-grid-bg" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-[color:var(--sr-header-border)] bg-[color:var(--sr-header-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8">
          <BrandLogo size="sm" withWordmark />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-20 pt-10 md:px-8 md:pb-28 md:pt-14">
        <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#0dccb0]">
          First-time setup
        </p>
        <h1 className="sr-heading-page mt-2 font-(--font-display) text-2xl font-extrabold text-[var(--sr-heading)] md:text-3xl">
          Confirm your details
        </h1>
        <p className="mt-3 text-sm text-[var(--portal-muted)]">
          Signed in as{' '}
          <span className="font-(--font-mono) text-[#0dccb0]">{user.username}</span> · Assigned portal{' '}
          <strong className="text-[var(--sr-heading)]">{PORTALS[user.portalId].label}</strong>. Complete this page to enter
          your command workspace.
        </p>

        <form onSubmit={handleSubmit} className="sr-card mt-10 space-y-6 border-[#0dccb0]/20">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="sr-label" htmlFor="ob-name">
                Full name
              </label>
              <input
                id="ob-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="sr-input"
                placeholder="As recorded on your appointment"
              />
            </div>
            <div>
              <label className="sr-label" htmlFor="ob-service">
                Service number
              </label>
              <input
                id="ob-service"
                name="serviceNumber"
                value={serviceNumber}
                onChange={(e) => setServiceNumber(e.target.value)}
                className="sr-input font-(--font-mono)"
                placeholder="e.g. AP No."
              />
            </div>
            <div>
              <label className="sr-label" htmlFor="ob-phone">
                Phone number
              </label>
              <input
                id="ob-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="sr-input"
                placeholder="+234 …"
              />
            </div>
          </div>

          <div>
            <p className="sr-label">Live photograph</p>
            <p className="mb-3 text-xs text-[var(--portal-muted)]">
              Position your face in frame. After two detected blinks, tap <strong className="text-[var(--sr-heading)]">Capture photo</strong>{' '}
              to save your portrait — use good lighting and avoid covering your face.
            </p>
            <LivenessCapture key={livenessReset} resetKey={livenessReset} onVerified={handleLivenessVerified} />
            {livenessVerified ? (
              <button
                type="button"
                className="sr-btn-ghost mt-3 text-xs"
                onClick={() => {
                  setLivenessVerified(false)
                  setPictureDataUrl(null)
                  setLivenessReset((k) => k + 1)
                }}
              >
                Retake photo
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 border-t border-[color:var(--portal-border)] pt-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="sr-label">New password</p>
              <p className="mb-3 text-xs text-[var(--portal-muted)]">
                Replace your issued or demo password with one only you know. Required to finish setup.
              </p>
            </div>
            <div>
              <label className="sr-label" htmlFor="ob-pass">
                Create password
              </label>
              <input
                id="ob-pass"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="sr-input"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="sr-label" htmlFor="ob-pass2">
                Confirm password
              </label>
              <input
                id="ob-pass2"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="sr-input"
                placeholder="Repeat password"
              />
            </div>
          </div>

          {formError ? (
            <p className="rounded-lg border border-[#f05b4d]/30 bg-[#f05b4d]/10 px-3 py-2 text-sm text-[#fca5a5]" role="alert">
              {formError}
            </p>
          ) : null}

          <button type="submit" disabled={submitting} className="sr-btn-primary w-full justify-center py-3 disabled:opacity-60">
            {submitting ? 'Saving…' : `Submit & enter ${PORTALS[user.portalId].shortLabel}`}
          </button>
        </form>
      </main>
    </div>
  )
}
