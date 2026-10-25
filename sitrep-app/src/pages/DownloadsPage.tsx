import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { useAuth } from '../contexts/AuthContext'

const APK_URL = '/downloads/npf-sitrep-field-release.apk'

export function DownloadsPage() {
  const { user } = useAuth()
  const [apkInfo, setApkInfo] = useState<{ sizeMb: number; modified: string } | null>(null)

  useEffect(() => {
    // Try to fetch APK metadata via HEAD request to the downloads route
    fetch(APK_URL, { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) return
        const size = res.headers.get('content-length')
        const modified = res.headers.get('last-modified')
        if (size || modified) {
          setApkInfo({
            sizeMb: size ? Math.round(Number(size) / 1024 / 1024) : 0,
            modified: modified ? new Date(modified).toLocaleDateString() : '',
          })
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[var(--portal-bg)] text-[var(--portal-fg)]">
      {/* Nav */}
      <nav className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-(--font-display) text-lg font-bold text-[var(--sr-heading)]">
            <BrandLogo className="h-7 w-7" />
            NPF SitRep
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {!user ? (
              <Link to="/login" className="font-(--font-mono) text-[11px] font-bold uppercase tracking-wider text-[#00c46a] transition hover:text-[var(--sr-heading)]">
                Sign in →
              </Link>
            ) : null}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="font-(--font-mono) text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d9b64a]">
          Downloads
        </p>
        <h1 className="sr-subheading mt-2 font-(--font-display) text-3xl font-bold">
          NPF SitRep Field — Android app
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--portal-muted)]">
          The official mobile application for field officers at the polling unit. Download the APK, install it on an
          Android 10+ device, and sign in with your issued field credentials.
        </p>

        {/* APK Download Card */}
        <div className="mt-8 rounded-2xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-6 shadow-[var(--sr-card-shadow)] sm:p-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-[#00c46a] to-[#00a35a] shadow-[0_4px_20px_rgba(0,196,106,0.35)]">
              <span className="text-3xl text-[#04251f]" aria-hidden>⬇</span>
            </div>
            <div className="flex-1">
              <h2 className="font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">
                NPF SitRep Field — Release
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
                <span>v1.1.0</span>
                <span>·</span>
                <span>Android 10+</span>
                <span>·</span>
                <span>Universal APK</span>
                {apkInfo ? (
                  <>
                    <span>·</span>
                    <span>{apkInfo.sizeMb} MB</span>
                    {apkInfo.modified ? (
                      <>
                        <span>·</span>
                        <span>Updated {apkInfo.modified}</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-[var(--portal-muted)]">
                <li className="flex items-center gap-2">
                  <span className="text-[#00c46a]">✓</span> Offline report queueing — submits automatically when network returns
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#00c46a]">✓</span> Real-time chat with Command
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#00c46a]">✓</span> Voice and video calls to the Situation Room
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#00c46a]">✓</span> Live GPS presence on the command map
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#00c46a]">✓</span> Over-the-air updates on launch
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-[color:var(--portal-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={APK_URL}
              download
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#00c46a] to-[#00a35a] px-6 py-3.5 font-(--font-mono) text-[12px] font-bold uppercase tracking-wider text-[#04251f] shadow-[0_4px_24px_rgba(0,196,106,0.4)] transition hover:brightness-110 active:scale-[0.98]"
            >
              <span aria-hidden>⬇</span> Download APK
            </a>
            <p className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
              Allow "install unknown apps" when prompted
            </p>
          </div>
        </div>

        {/* Installation instructions */}
        <div className="mt-8 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-5">
          <h3 className="font-(--font-mono) text-[11px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
            Installation
          </h3>
          <ol className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--portal-muted)]">
            <li className="flex gap-2"><span className="shrink-0 font-bold text-[var(--sr-heading)]">1.</span> Download the APK to your Android phone (or transfer from PC via USB).</li>
            <li className="flex gap-2"><span className="shrink-0 font-bold text-[var(--sr-heading)]">2.</span> Tap the file to install. Android may ask "install from unknown source" — allow it for your file manager or browser.</li>
            <li className="flex gap-2"><span className="shrink-0 font-bold text-[var(--sr-heading)]">3.</span> Open the app, sign in with your issued field credentials, and complete your profile.</li>
            <li className="flex gap-2"><span className="shrink-0 font-bold text-[var(--sr-heading)]">4.</span> The app works offline — reports are queued and sent automatically when you have signal.</li>
          </ol>
        </div>

        <Link to="/" className="mt-8 inline-block font-(--font-mono) text-[11px] font-semibold text-[#00c46a] transition hover:text-[var(--sr-heading)]">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
