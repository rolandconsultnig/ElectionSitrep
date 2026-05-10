import { loginRequest, meRequest, ApiError } from './api'
import type { UserPayload } from './types'
import * as SecureStore from 'expo-secure-store'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const TOKEN_KEY = 'sitrep_field_token'

type AuthState = {
  token: string | null
  user: UserPayload | null
  ready: boolean
}

type AuthContextValue = AuthState & {
  signIn: (identifier: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserPayload | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = await SecureStore.getItemAsync(TOKEN_KEY)
        if (cancelled) return
        setToken(t)
        if (t) {
          const { user: u } = await meRequest(t)
          if (!cancelled) setUser(u)
        }
      } catch {
        if (!cancelled) {
          setToken(null)
          setUser(null)
          await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (identifier: string, password: string) => {
    const { token: t, user: u } = await loginRequest(identifier.trim(), password)
    if (u.portalId !== 'field') {
      throw new ApiError('This app is for Field officers only.', 403)
    }
    await SecureStore.setItemAsync(TOKEN_KEY, t)
    setToken(t)
    setUser(u)
  }, [])

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {})
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!token) return
    const { user: u } = await meRequest(token)
    setUser(u)
  }, [token])

  const value = useMemo(
    () => ({ token, user, ready, signIn, signOut, refreshUser }),
    [token, user, ready, signIn, signOut, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
