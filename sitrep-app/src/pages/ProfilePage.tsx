import { PORTALS } from '../lib/navigation'
import type { PortalId } from '../lib/navigation'
import { portalMatchHint } from '../lib/portalFromUsername'
import { useAuth } from '../contexts/AuthContext'

const ORDER: PortalId[] = ['admin', 'field', 'management', 'igp']

export function ProfilePage() {
  const { user } = useAuth()
  const profile = user?.profile

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Profile &amp; training</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">
          Your issued account, verified details, and how this demo routes you to the correct portal.
        </p>
      </header>

      <section className="sr-card space-y-4">
        <h2 className="font-(--font-display) text-lg font-bold text-[var(--portal-fg)]">Your account</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">Username</dt>
            <dd className="mt-1 font-(--font-mono) text-[#0dccb0]">{user?.username ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">Portal</dt>
            <dd className="mt-1 text-[var(--portal-muted)]">{user ? PORTALS[user.portalId].label : '—'}</dd>
          </div>
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">First name</dt>
            <dd className="mt-1 text-[var(--portal-muted)]">{profile?.firstName ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">Last name</dt>
            <dd className="mt-1 text-[var(--portal-muted)]">{profile?.lastName ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">Service number</dt>
            <dd className="mt-1 font-(--font-mono) text-[var(--portal-muted)]">{profile?.serviceNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">Phone</dt>
            <dd className="mt-1 text-[var(--portal-muted)]">{profile?.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
              Live photo (onboarding)
            </dt>
            <dd className="mt-2">
              {profile?.pictureDataUrl ? (
                <img
                  src={profile.pictureDataUrl}
                  alt="Verified capture"
                  className="max-h-40 rounded-xl border border-[color:var(--portal-border)] object-cover"
                />
              ) : (
                <span className="text-[var(--portal-dim)]">Not recorded</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="sr-card space-y-4">
        <h2 className="font-(--font-display) text-lg font-bold text-[var(--portal-fg)]">Self-training</h2>
        <p className="text-sm leading-relaxed text-[var(--portal-muted)]">
          In production, ICT issues credentials by rank and role; each batch maps to portal access. Your{' '}
          <strong className="text-[var(--sr-heading)]">username pattern</strong> still selects the portal in this demo until OIDC
          claims replace prefix routing.
        </p>
        <ol className="space-y-4">
          {[
            {
              n: '01',
              t: 'Understand your role',
              d: 'You use one of four portals aligned to the NPF command chain. Cross-portal URLs redirect to your assignment.',
            },
            {
              n: '02',
              t: 'Username pattern',
              d: 'The segment before the first . or _ routes the app after login (until JWT claims are wired).',
            },
            {
              n: '03',
              t: 'Use modules inside your portal',
              d: 'Reporting and jurisdiction follow RBAC server-side; the sidebar reflects your tier.',
            },
          ].map((step) => (
            <li key={step.n} className="flex gap-4 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-4 py-3">
              <span className="font-(--font-mono) text-xl font-bold text-[#0dccb0]/80">{step.n}</span>
              <div>
                <h3 className="font-(--font-display) font-bold text-[var(--portal-fg)]">{step.t}</h3>
                <p className="mt-1 text-sm text-[var(--portal-muted)]">{step.d}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="overflow-x-auto rounded-xl border border-[color:var(--portal-border)]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Example usernames</th>
              </tr>
            </thead>
            <tbody className="text-[var(--portal-muted)]">
              {ORDER.map((id) => {
                const p = PORTALS[id]
                return (
                  <tr key={id} className="border-b border-[color:var(--portal-border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-[var(--sr-heading)]">
                      {p.shortLabel} — {p.label}
                    </td>
                    <td className="px-4 py-3 font-(--font-mono) text-[12px] text-[#0dccb0]">{portalMatchHint(id)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
