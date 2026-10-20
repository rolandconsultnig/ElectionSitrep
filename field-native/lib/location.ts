import * as Location from 'expo-location'

export type DevicePosition = {
  lat: number
  lng: number
  accuracy: number | null
}

/**
 * Requests foreground permission (if needed) and returns the current position.
 * Returns null when permission is denied or the fix fails — callers must treat
 * GPS as best-effort and never block submission on it.
 */
export async function getCurrentPosition(): Promise<DevicePosition | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync()
    let granted = perm.granted
    if (!granted && perm.canAskAgain) {
      const req = await Location.requestForegroundPermissionsAsync()
      granted = req.granted
    }
    if (!granted) return null
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    }
  } catch {
    return null
  }
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
