import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { apiFetch, apiJson, apiUrl, getAuthToken, setAuthToken } from '../lib/api'
import { postLoginPath, type PortalId } from '../lib/navigation'

export type OfficerProfile = {
  firstName: string
  lastName: string
  serviceNumber: string
  phone: string
  pictureDataUrl: string
  livenessVerified: boolean
  livenessCheckedAt?: string
}

export type AuthUser = {
  username: string
  portalId: PortalId
  onboardingComplete: boolean
  /** True until user sets their own password (demo/batch issuance) */
  passwordMustChange?: boolean
  profile?: OfficerProfile | null
}

type ApiUser = {
  username: string
  portalId: string
  onboardingComplete: boolean
  passwordMustChange?: boolean
  profile?: OfficerProfile | null
}

function mapApiUser(u: ApiUser): AuthUser {
  const portalId = u.portalId as PortalId
  return {
    username: u.username,
    portalId,
    onboardingComplete: Boolean(u.onboardingComplete),
    passwordMustChange: Boolean(u.passwordMustChange),
    profile: u.profile ?? null,
  }
}

type AuthContextValue = {
  user: AuthUser | null
  /** True until initial session restore finishes */
  bootstrapping: boolean
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }>
  completeOnboarding: (
    profile: OfficerProfile,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setBootstrapping(false)
      return
    }
    void (async () => {
      try {
        const data = await apiJson<{ user: ApiUser }>('/api/auth/me')
        setUser(mapApiUser(data.user))
      } catch {
        setAuthToken(null)
        setUser(null)
      } finally {
        setBootstrapping(false)
      }
    })()
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const trimmed = username.trim()
    if (!trimmed) return { ok: false as const, error: 'Enter your assigned username.' }
    if (!password.trim()) return { ok: false as const, error: 'Enter your password.' }

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed, password }),
      })
      const rawText = await res.text()
      let data: { token?: string; user?: ApiUser; error?: string } = {}
      try {
        data = rawText ? (JSON.parse(rawText) as typeof data) : {}
      } catch {
        /* proxy/HTML error body */
      }
      if (!res.ok || !data.token || !data.user) {
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          return {
            ok: false as const,
            error:
              data.error ||
              'API or database unavailable. From repo root run: npm install && npm run dev (starts API + web), or start server/ and sitrep-app/ separately (see README).',
          }
        }
        return { ok: false as const, error: data.error || 'Invalid username or password.' }
      }
      setAuthToken(data.token)
      const next = mapApiUser(data.user)
      flushSync(() => {
        setUser(next)
      })
      return { ok: true as const, redirectTo: postLoginPath(next) }
    } catch {
      return {
        ok: false as const,
        error:
          'Cannot reach server. From repo root: npm install && npm run dev — or run npm run dev in server/ (port 5530) and sitrep-app/ (see README).',
      }
    }
  }, [])

  const completeOnboarding = useCallback(async (profile: OfficerProfile, newPassword: string, confirmPassword: string) => {
    const res = await apiFetch('/api/me/onboarding', {
      method: 'PUT',
      body: JSON.stringify({
        firstName: profile.firstName,
        lastName: profile.lastName,
        serviceNumber: profile.serviceNumber,
        phone: profile.phone,
        pictureDataUrl: profile.pictureDataUrl,
        livenessVerified: profile.livenessVerified,
        livenessCheckedAt: profile.livenessCheckedAt ?? new Date().toISOString(),
        newPassword,
        confirmPassword,
      }),
    })
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = typeof raw === 'object' && raw && 'error' in raw ? String((raw as { error: string }).error) : 'Save failed'
      throw new Error(msg)
    }
    const data = raw as { user: ApiUser }
    flushSync(() => {
      setUser(mapApiUser(data.user))
    })
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setAuthToken(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      bootstrapping,
      login,
      completeOnboarding,
      logout,
    }),
    [user, bootstrapping, login, completeOnboarding, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
