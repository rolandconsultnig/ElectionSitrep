import test from 'node:test'
import assert from 'node:assert/strict'
import { officerStatus, resolvePosition } from './commandOfficerMap.js'

test('position prefers safety coordinates over assigned polling unit', () => {
  assert.deepEqual(
    resolvePosition(
      { last_lat: 6.5, last_lng: 3.4, position_source: 'gps', telemetry_at: '2026-01-01T00:00:00Z' },
      { lat: 7, lng: 4 },
    ),
    { lat: 6.5, lng: 3.4, source: 'gps', at: '2026-01-01T00:00:00Z' },
  )
})

test('position uses check-in source for safety coordinates and assigned PU as fallback', () => {
  assert.equal(
    resolvePosition({ last_lat: 6, last_lng: 3, position_source: 'checkin' }, { lat: 7, lng: 4 }).source,
    'checkin',
  )
  assert.deepEqual(resolvePosition({ last_lat: null, last_lng: null }, { lat: 7, lng: 4 }), {
    lat: 7,
    lng: 4,
    source: 'assigned_pu',
    at: null,
  })
  assert.equal(resolvePosition({}, {}), null)
})

test('officer status follows SOS, missed, not-started, due, then ok precedence', () => {
  const now = new Date('2026-01-01T00:00:00Z')
  assert.equal(officerStatus({ sosActive: true, missedAt: 'x', nextDueAt: 'x' }, now), 'sos')
  assert.equal(officerStatus({ missedAt: 'x', nextDueAt: 'x' }, now), 'missed')
  assert.equal(officerStatus({}, now), 'not_started')
  assert.equal(officerStatus({ nextDueAt: '2025-12-31T23:59:00Z' }, now), 'due')
  assert.equal(officerStatus({ nextDueAt: '2026-01-01T00:01:00Z' }, now), 'ok')
})
