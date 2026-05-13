function trimBase(url: string) {
  return url.replace(/\/+$/, '')
}

let overrideBase: string | null = null

/** In-memory override (hydrated from AsyncStorage or saved in network settings). */
export function setApiBaseUrlOverride(url: string | null) {
  overrideBase = url ? trimBase(url) : null
}

export function getApiBaseUrlOverride(): string | null {
  return overrideBase
}
