import Constants from 'expo-constants'

/** API origin without trailing slash — required on device (no Vite proxy). */
export function getApiBaseUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl as string | undefined
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL
  const raw = (fromEnv || fromExtra || '').trim().replace(/\/$/, '')
  return raw
}

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBaseUrl()
  return base ? `${base}${p}` : p
}
