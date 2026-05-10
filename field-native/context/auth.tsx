import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@/lib/api'
import { getApiBaseUrl } from '@/lib/config'
import { getToken, setToken } from '@/lib/token-storage'

export type AuthUser = {
  username: string
  portalId: string
  onboardingComplete: boolean
  profile?: { name: string; serviceNumber: string; phone: string } | null
}

type AuthContextValue = {
  user: AuthUser | null
  bootstrapping: boolean
  apiConfigured: boolean
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const apiConfigured = useMemo(() => Boolean(getApiBaseUrl()), [])

  const refreshUser = useCallback(async () => {
    const t = await getToken()
    if (!t) {
      setUser(null)
      return
    }
    try {
      const data = await apiJson<{ user: AuthUser }>('/api/auth/me')
      if (data.user.portalId !== 'field') {
        await setToken(null)
        setUser(null)
        return
      }
      setUser(data.user)
    } catch {
      await setToken(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void refreshUser().finally(() => setBootstrapping(false))
  }, [refreshUser])

  const login = useCallback(async (username: string, password: string) => {
    if (!getApiBaseUrl()) {
      return {
        ok: false as const,
        error: 'Set EXPO_PUBLIC_API_BASE_URL (e.g. http://10.0.2.2:4000 for Android emulator).',
      }
    }
    try {
      const data = await apiJson<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!data.token || !data.user) return { ok: false as const, error: 'Invalid response' }
      if (data.user.portalId !== 'field') {
        return { ok: false as const, error: 'This app is for Field portal accounts only.' }
      }
      await setToken(data.token)
      setUser(data.user)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Login failed' }
    }
  }, [])

  const logout = useCallback(async () => {
    await setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      bootstrapping,
      apiConfigured,
      login,
      logout,
      refreshUser,
    }),
    [user, bootstrapping, apiConfigured, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
