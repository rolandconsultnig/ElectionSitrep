import { Navigate, Route, Routes } from 'react-router-dom'
import { PortalGate } from './components/PortalGate'
import { useAuth } from './contexts/AuthContext'
import { postLoginPath } from './lib/navigation'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ProfilePage } from './pages/ProfilePage'
import {
  AdminAudit,
  AdminCandidates,
  AdminDashboard,
  AdminElections,
  AdminGeography,
  AdminOperationsMap,
  AdminParties,
  AdminRoles,
  AdminSettings,
  AdminUsers,
} from './pages/portal/AdminPortalPages'
import {
  FieldDashboard,
  FieldHistory,
  FieldIncidents,
  FieldReference,
  FieldSitRep,
  FieldTurnout,
  FieldViolence,
  FieldVoting,
} from './pages/portal/FieldPortalPages'
import {
  MgmtDashboard,
  MgmtIncidents,
  MgmtMap,
  MgmtOrders,
  MgmtResults,
  MgmtSitRepFeed,
  MgmtTurnout,
  MgmtUnits,
} from './pages/portal/ManagementPortalPages'
import {
  IGPBriefing,
  IGPHotspots,
  IGPOverview,
  IGPResults,
  IGPSecurity,
  IGPTimeline,
} from './pages/portal/IGPPortalPages'
import { AdminCredentialBatches } from './pages/portal/AdminCredentialBatches'

function OnboardingGate() {
  const { user, bootstrapping } = useAuth()
  if (bootstrapping) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[color:var(--sr-app-bg)] p-8 text-sm text-[var(--portal-muted)]">
        Restoring session…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.onboardingComplete) return <Navigate to={postLoginPath(user)} replace />
  return <OnboardingPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingGate />} />

      <Route path="/admin" element={<PortalGate portalId="admin" />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="elections" element={<AdminElections />} />
        <Route path="parties" element={<AdminParties />} />
        <Route path="candidates" element={<AdminCandidates />} />
        <Route path="geography" element={<AdminGeography />} />
        <Route path="operations-map" element={<AdminOperationsMap />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="credential-batches" element={<AdminCredentialBatches />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/field" element={<PortalGate portalId="field" />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<FieldDashboard />} />
        <Route path="sitrep" element={<FieldSitRep />} />
        <Route path="voting" element={<FieldVoting />} />
        <Route path="turnout" element={<FieldTurnout />} />
        <Route path="incidents" element={<FieldIncidents />} />
        <Route path="violence" element={<FieldViolence />} />
        <Route path="reference" element={<FieldReference />} />
        <Route path="history" element={<FieldHistory />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/management" element={<PortalGate portalId="management" />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<MgmtDashboard />} />
        <Route path="map" element={<MgmtMap />} />
        <Route path="sitrep" element={<MgmtSitRepFeed />} />
        <Route path="results" element={<MgmtResults />} />
        <Route path="incidents" element={<MgmtIncidents />} />
        <Route path="turnout" element={<MgmtTurnout />} />
        <Route path="orders" element={<MgmtOrders />} />
        <Route path="units" element={<MgmtUnits />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/igp" element={<PortalGate portalId="igp" />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<IGPOverview />} />
        <Route path="security" element={<IGPSecurity />} />
        <Route path="results" element={<IGPResults />} />
        <Route path="hotspots" element={<IGPHotspots />} />
        <Route path="timeline" element={<IGPTimeline />} />
        <Route path="briefing" element={<IGPBriefing />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
