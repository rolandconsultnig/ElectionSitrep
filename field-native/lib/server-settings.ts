import AsyncStorage from '@react-native-async-storage/async-storage'
import { setApiBaseUrlOverride } from './api-base-store'

const KEY_HOST = '@field_server_host'
const KEY_PORT = '@field_server_port'
const KEY_TLS = '@field_server_use_tls'

export function buildServerUrl(hostRaw: string, portRaw: string, useHttps = false): string {
  const host = hostRaw
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.trim()
  const port = String(portRaw || '').replace(/\D/g, '') || '5530'
  if (!host) throw new Error('Server IP or hostname is required.')
  const scheme = useHttps ? 'https' : 'http'
  return `${scheme}://${host}:${port}`
}

export async function hydrateApiBaseFromStorage(): Promise<void> {
  try {
    const host = (await AsyncStorage.getItem(KEY_HOST))?.trim()
    const port = (await AsyncStorage.getItem(KEY_PORT))?.trim()
    const useHttps = (await AsyncStorage.getItem(KEY_TLS)) === '1'
    if (host && port) {
      setApiBaseUrlOverride(buildServerUrl(host, port, useHttps))
    } else {
      setApiBaseUrlOverride(null)
    }
  } catch {
    setApiBaseUrlOverride(null)
  }
}

export async function getStoredEndpoint(): Promise<{ host: string; port: string; useHttps: boolean } | null> {
  const host = (await AsyncStorage.getItem(KEY_HOST))?.trim()
  const port = (await AsyncStorage.getItem(KEY_PORT))?.trim()
  if (!host || !port) return null
  const useHttps = (await AsyncStorage.getItem(KEY_TLS)) === '1'
  return { host, port, useHttps }
}

export async function saveServerEndpoint(host: string, port: string, useHttps = false): Promise<void> {
  const url = buildServerUrl(host, port, useHttps)
  await AsyncStorage.setItem(KEY_HOST, host.trim())
  await AsyncStorage.setItem(KEY_PORT, port.trim())
  await AsyncStorage.setItem(KEY_TLS, useHttps ? '1' : '0')
  setApiBaseUrlOverride(url)
}

export async function clearServerEndpoint(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_HOST, KEY_PORT, KEY_TLS])
  setApiBaseUrlOverride(null)
}
