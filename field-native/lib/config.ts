import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const STORAGE_KEY = '@field-native/apiBaseUrlOverride'

let memoryOverride: string | null = null
let storageLoaded = false

function normalizeBase(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  return t.replace(/\/$/, '')
}

/** Loads persisted server URL override before any API calls. Safe to call multiple times. */
export async function initApiBaseUrlFromStorage(): Promise<void> {
  if (storageLoaded) return
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY)
    memoryOverride = normalizeBase(v)
  } catch {
    memoryOverride = null
  } finally {
    storageLoaded = true
  }
}

/** Saves override like `http://192.168.1.5:5530`. Pass null to use bundled default from app.json / env. */
export async function persistApiBaseUrlOverride(url: string | null): Promise<void> {
  const n = normalizeBase(url)
  if (!n) {
    await AsyncStorage.removeItem(STORAGE_KEY)
    memoryOverride = null
    return
  }
  await AsyncStorage.setItem(STORAGE_KEY, n)
  memoryOverride = n
}

/** Default API origin from env / app.json (no device override). */
export function getBundledApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL
  return normalizeBase(fromEnv || fromExtra || '') || ''
}

/** Effective API origin: device override, then env, then app.json extra. */
export function getApiBaseUrl(): string {
  if (memoryOverride) return memoryOverride
  return getBundledApiBaseUrl()
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBaseUrl()
  return base ? `${base}${p}` : p
}

export type ParsedApiOrigin = { scheme: 'http' | 'https'; host: string; port: string }

/** Parses `http://host:port` for the server settings UI. */
export function parseApiOrigin(url: string): ParsedApiOrigin {
  const fallback = (): ParsedApiOrigin => ({ scheme: 'http', host: '', port: '5530' })
  if (!url?.trim()) return fallback()
  try {
    const raw = url.includes('://') ? url.trim() : `http://${url.trim()}`
    const u = new URL(raw)
    const scheme = u.protocol === 'https:' ? 'https' : 'http'
    const port =
      u.port ||
      (scheme === 'https' ? '443' : '80')
    return { scheme, host: u.hostname, port }
  } catch {
    return fallback()
  }
}
