import * as SecureStore from 'expo-secure-store'

const KEY = 'npf_sitrep_token'

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY)
  } catch {
    return null
  }
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(KEY, token)
  else await SecureStore.deleteItemAsync(KEY).catch(() => {})
}
