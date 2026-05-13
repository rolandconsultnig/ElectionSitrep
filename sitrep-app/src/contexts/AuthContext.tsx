import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { apiFetch, apiJson, apiUrl, getAuthToken, setAuthToken } from '../lib/api'
import { postLoginPath } from '../lib/navigation'
import type { PortalId } from '../lib/navigation'
import type { AuthUser, OfficerProfile } from './auth-types'

type ApiUser = {
  username: string
  portalId: string
  onboardingComplete: boolean
  passwordMustChange?: boolean
  profile?: OfficerProfile | null
}

/** When the Vite proxy returns 5xx or fetch fails — backend not on 5530 or DB down */
function devApiUnavailableHint() {
  const ui = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5535'
  return `Start the API on port 5530 (server PORT in .env). Test: http://localhost:5530/api/health — expect {"ok":true}. From repo root: npm run dev (API + web), or npm run dev --prefix server while Vite runs. This page: ${ui}. See README.`
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
            error: data.error || `API or database unavailable. ${devApiUnavailableHint()}`,
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
        error: `Cannot reach the API. ${devApiUnavailableHint()}`,
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
