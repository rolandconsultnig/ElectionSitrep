import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GeofenceMonitor, haversineM, type GeofenceEvent, type GeofenceTarget } from './geofence.ts'

const pu: GeofenceTarget = { id: '1', name: 'Test PU', code: 'PU-001', lat: 9.0, lng: 8.0 }

// ~111.32 m per 0.001° of latitude
test('haversineM returns ~111m for 0.001 degree latitude', () => {
  const d = haversineM(9.0, 8.0, 9.001, 8.0)
  assert.ok(d > 105 && d < 118, `expected ~111m, got ${d}`)
})

test('haversineM returns 0 for identical points', () => {
  assert.equal(haversineM(9.0, 8.0, 9.0, 8.0), 0)
})

test('does not breach on a single out-of-range fix', () => {
  const events: GeofenceEvent[] = []
  const m = new GeofenceMonitor(pu, 100, (e) => events.push(e))
  // ~222m away
  const r = m.ingestFix(9.002, 8.0, 10)
  assert.equal(r?.breached, false)
  assert.deepEqual(events, [])
})

test('breaches after two consecutive out-of-range fixes', () => {
  const events: GeofenceEvent[] = []
  const m = new GeofenceMonitor(pu, 100, (e) => events.push(e))
  m.ingestFix(9.002, 8.0, 10)
  const r = m.ingestFix(9.002, 8.0, 10)
  assert.equal(r?.breached, true)
  assert.deepEqual(events, ['breach'])
})

test('does not breach when inside 100m', () => {
  const events: GeofenceEvent[] = []
  const m = new GeofenceMonitor(pu, 100, (e) => events.push(e))
  const r = m.ingestFix(9.0005, 8.0, 10) // ~56m
  assert.equal(r?.breached, false)
  assert.deepEqual(events, [])
})

test('fires return once back inside after breach', () => {
  const events: GeofenceEvent[] = []
  const m = new GeofenceMonitor(pu, 100, (e) => events.push(e))
  m.ingestFix(9.002, 8.0, 10)
  m.ingestFix(9.002, 8.0, 10)
  const r = m.ingestFix(9.0, 8.0, 10)
  assert.equal(r?.breached, false)
  assert.deepEqual(events, ['breach', 'return'])
})

test('resets strike count when an inside fix interrupts', () => {
  const events: GeofenceEvent[] = []
  const m = new GeofenceMonitor(pu, 100, (e) => events.push(e))
  m.ingestFix(9.002, 8.0, 10) // out
  m.ingestFix(9.0, 8.0, 10)   // in — resets
  m.ingestFix(9.002, 8.0, 10) // out again, only strike 1
  assert.equal(m.breached, false)
  assert.deepEqual(events, [])
})

test('ignores low-accuracy fixes for breach decisions', () => {
  const events: GeofenceEvent[] = []
  const m = new GeofenceMonitor(pu, 100, (e) => events.push(e))
  m.ingestFix(9.002, 8.0, 200) // poor accuracy — untrusted
  m.ingestFix(9.002, 8.0, 200)
  assert.equal(m.breached, false)
  assert.deepEqual(events, [])
})
