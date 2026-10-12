export function resolvePosition(safety, assignedPu) {
  const lat = safety?.last_lat
  const lng = safety?.last_lng
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return {
      lat,
      lng,
      source: safety.position_source === 'gps' ? 'gps' : 'checkin',
      at: safety.telemetry_at ?? null,
    }
  }

  const puLat = assignedPu?.lat
  const puLng = assignedPu?.lng
  if (Number.isFinite(puLat) && Number.isFinite(puLng) && puLat >= -90 && puLat <= 90 && puLng >= -180 && puLng <= 180) {
    return { lat: puLat, lng: puLng, source: 'assigned_pu', at: null }
  }

  return null
}

export function officerStatus({ sosActive, missedAt, nextDueAt }, now = new Date()) {
  if (sosActive) return 'sos'
  if (missedAt) return 'missed'
  if (!nextDueAt) return 'not_started'
  return new Date(nextDueAt) < now ? 'due' : 'ok'
}
