import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceMobileLiveness,
  createMobileLivenessState,
  type MobileFrame,
  type MobileLivenessState,
} from './livenessMachine.ts'

const frontal = { faceCount: 1, rotationY: 0, minEyeOpen: 0.9 }

function step(state: MobileLivenessState, frame: MobileFrame) {
  return advanceMobileLiveness(state, frame)
}

function start(state: MobileLivenessState): MobileLivenessState {
  return step(state, { ...frontal, t: 0 }).state
}

function blink(state: MobileLivenessState, t: number): MobileLivenessState {
  state = step(state, { ...frontal, minEyeOpen: 0.9, t }).state
  state = step(state, { ...frontal, minEyeOpen: 0.1, t: t + 100 }).state
  return step(state, { ...frontal, minEyeOpen: 0.9, t: t + 200 }).state
}

function turn(state: MobileLivenessState, t: number): MobileLivenessState {
  return step(state, { ...frontal, rotationY: 23, t }).state
}

test('a static face never captures', () => {
  let state = start(createMobileLivenessState({ order: 'blink-first' }))
  for (let t = 100; t < 10_000; t += 100) state = step(state, { ...frontal, t }).state
  assert.equal(state.phase, 'challenge')
  assert.equal(state.completed.blink, false)
  assert.equal(state.completed.turn, false)
})

test('a full blink, turn, and return captures exactly once', () => {
  let state = start(createMobileLivenessState({ order: 'blink-first' }))
  state = blink(state, 100)
  state = turn(state, 500)
  const captured = step(state, { ...frontal, t: 600 })
  assert.equal(captured.captureNow, true)
  assert.equal(captured.state.phase, 'captured')
  assert.equal(step(captured.state, { ...frontal, t: 700 }).captureNow, false)
})

test('two faces reset the session', () => {
  const state = start(createMobileLivenessState({ order: 'blink-first' }))
  const transition = step(state, { t: 100, faceCount: 2, rotationY: null, minEyeOpen: null })
  assert.match(transition.resetMessage ?? '', /More than one face/)
  assert.equal(transition.state.phase, 'align')
})

test('three consecutive no-face frames reset the session', () => {
  let state = start(createMobileLivenessState({ order: 'blink-first' }))
  state = step(state, { t: 100, faceCount: 0, rotationY: null, minEyeOpen: null }).state
  state = step(state, { t: 200, faceCount: 0, rotationY: null, minEyeOpen: null }).state
  const transition = step(state, { t: 300, faceCount: 0, rotationY: null, minEyeOpen: null })
  assert.match(transition.resetMessage ?? '', /No face detected/)
})

test('a session times out after thirty seconds', () => {
  const state = start(createMobileLivenessState({ order: 'blink-first' }))
  const transition = step(state, { ...frontal, t: 30_001 })
  assert.equal(transition.resetMessage, 'Timed out — try again')
})

test('capture requires frontal orientation and open eyes', () => {
  let state = start(createMobileLivenessState({ order: 'blink-first' }))
  state = blink(state, 100)
  state = turn(state, 500)
  assert.equal(step(state, { ...frontal, rotationY: 20, t: 600 }).captureNow, false)
  assert.equal(step(state, { ...frontal, minEyeOpen: 0.2, t: 600 }).captureNow, false)
})
