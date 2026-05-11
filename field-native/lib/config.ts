import Constants from 'expo-constants'
import { getApiBaseUrlOverride } from './api-base-store'

function trimBase(url: string) {
  return url.replace(/\/+$/, '')
}

/** Value baked into the native binary from app.json `extra.apiBaseUrl`. */
function embeddedApiBase(): string | undefined {
  const fromExpoConfig = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined
  if (fromExpoConfig?.apiBaseUrl && String(fromExpoConfig.apiBaseUrl).trim()) {
    return trimBase(String(fromExpoConfig.apiBaseUrl).trim())
  }
  const legacy = Constants.manifest as { extra?: { apiBaseUrl?: string } } | null | undefined
  const fromLegacy = legacy?.extra?.apiBaseUrl
  if (fromLegacy && String(fromLegacy).trim()) return trimBase(String(fromLegacy).trim())
  return undefined
}

/**
 * Resolved API base:
 * 1) AsyncStorage (Network settings on device)
 * 2) Release: embedded `app.json` extra (production API) before env — avoids shipping an emulator `.env` URL on real devices.
 * 3) Dev: `EXPO_PUBLIC_API_BASE_URL` then embedded then localhost.
 */
export function getApiBaseUrl(): string {
  const injected = getApiBaseUrlOverride()
  if (injected) return injected

  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL
  const envUrl = fromEnv && String(fromEnv).trim() ? trimBase(String(fromEnv).trim()) : undefined
  const embedded = embeddedApiBase()

  if (__DEV__) {
    if (envUrl) return envUrl
    if (embedded) return embedded
    return 'http://localhost:5530'
  }

  if (embedded) return embedded
  if (envUrl) return envUrl
  return 'http://localhost:5530'
}
