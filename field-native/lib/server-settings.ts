import AsyncStorage from '@react-native-async-storage/async-storage'
import { setApiBaseUrlOverride } from './api-base-store'

const KEY_HOST = '@field_server_host'
const KEY_PORT = '@field_server_port'

export function buildServerUrl(hostRaw: string, portRaw: string): string {
  const host = hostRaw
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.trim()
  const port = String(portRaw || '').replace(/\D/g, '') || '5530'
  if (!host) throw new Error('Server IP or hostname is required.')
  return `http://${host}:${port}`
}

export async function hydrateApiBaseFromStorage(): Promise<void> {
  try {
    const host = (await AsyncStorage.getItem(KEY_HOST))?.trim()
    const port = (await AsyncStorage.getItem(KEY_PORT))?.trim()
    if (host && port) {
      setApiBaseUrlOverride(buildServerUrl(host, port))
    } else {
      setApiBaseUrlOverride(null)
    }
  } catch {
    setApiBaseUrlOverride(null)
  }
}

export async function getStoredEndpoint(): Promise<{ host: string; port: string } | null> {
  const host = (await AsyncStorage.getItem(KEY_HOST))?.trim()
  const port = (await AsyncStorage.getItem(KEY_PORT))?.trim()
  if (!host || !port) return null
  return { host, port }
}

export async function saveServerEndpoint(host: string, port: string): Promise<void> {
  const url = buildServerUrl(host, port)
  await AsyncStorage.setItem(KEY_HOST, host.trim())
  await AsyncStorage.setItem(KEY_PORT, port.trim())
  setApiBaseUrlOverride(url)
}

export async function clearServerEndpoint(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_HOST, KEY_PORT])
  setApiBaseUrlOverride(null)
}
