import Constants from 'expo-constants'
import { getApiBaseUrlOverride } from './api-base-store'

function trimBase(url: string) {
  return url.replace(/\/+$/, '')
}

/** Resolved API base: AsyncStorage override → env → app.json extra → localhost. */
export function getApiBaseUrl(): string {
  const injected = getApiBaseUrlOverride()
  if (injected) return injected
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL
  if (fromEnv && String(fromEnv).trim()) return trimBase(String(fromEnv).trim())
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
  if (extra?.apiBaseUrl) return trimBase(String(extra.apiBaseUrl))
  return 'http://localhost:5530'
}
