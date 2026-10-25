export const GEOFENCE_RADIUS_M = 100
// A fix is only trusted for breach decisions when accuracy is under this.
// Cuts false alarms from coarse cell/Wi-Fi fixes and indoor drift.
const MAX_TRUSTED_ACCURACY_M = 60
// Require this many consecutive out-of-range fixes before declaring a breach.
const BREACH_STRIKES = 2

export type GeofenceTarget = {
  id: string
  name: string
  code?: string | null
  lat: number
  lng: number
}

export type GeofenceEvent = 'breach' | 'return'

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export type GeofenceResult = {
  breached: boolean
  distanceM: number
}

/**
 * Tracks an officer's distance from an assigned post and fires on `breach`
 * only after several consecutive out-of-range, decent-accuracy fixes, and on
 * `return` when the officer is confirmed back inside the radius.
 */
export class GeofenceMonitor {
  private outStrikes = 0
  private _breached = false
  private readonly target: GeofenceTarget
  private readonly radiusM: number
  private readonly onEvent: (event: GeofenceEvent, distanceM: number) => void

  constructor(
    target: GeofenceTarget,
    radiusM: number,
    onEvent: (event: GeofenceEvent, distanceM: number) => void,
  ) {
    this.target = target
    this.radiusM = radiusM
    this.onEvent = onEvent
  }

  get breached() { return this._breached }

  ingestFix(lat: number, lng: number, accuracyM: number | null | undefined): GeofenceResult | null {
    // Ignore fixes too coarse to tell inside from outside the radius.
    if (typeof accuracyM === 'number' && accuracyM > MAX_TRUSTED_ACCURACY_M) {
      return { breached: this._breached, distanceM: haversineM(lat, lng, this.target.lat, this.target.lng) }
    }
    const distanceM = haversineM(lat, lng, this.target.lat, this.target.lng)
    if (distanceM > this.radiusM) {
      this.outStrikes += 1
      if (!this._breached && this.outStrikes >= BREACH_STRIKES) {
        this._breached = true
        this.onEvent('breach', distanceM)
      }
    } else {
      const wasBreached = this._breached
      this.outStrikes = 0
      this._breached = false
      if (wasBreached) this.onEvent('return', distanceM)
    }
    return { breached: this._breached, distanceM }
  }
}
