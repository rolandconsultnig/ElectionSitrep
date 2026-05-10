import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PortalLayout } from './PortalLayout'
import { firstNavPath, type PortalId } from '../lib/navigation'

type Props = { portalId: PortalId }

/** Signed-in users only; redirects wrong portal to their home route. */
export function PortalGate({ portalId }: Props) {
  const { user, bootstrapping } = useAuth()

  if (bootstrapping) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-[color:var(--sr-app-bg)] p-8 text-sm text-[var(--portal-muted)]">
        Restoring session…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ reason: 'auth' }} />
  }

  if (!user.onboardingComplete) {
    return <Navigate to="/onboarding" replace />
  }

  if (user.portalId !== portalId) {
    return <Navigate to={firstNavPath(user.portalId)} replace />
  }

  return <PortalLayout portalId={portalId} />
}
