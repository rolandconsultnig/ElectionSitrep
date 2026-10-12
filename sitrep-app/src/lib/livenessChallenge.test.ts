import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceLivenessChallenge, createLivenessState, type LivenessFrame, type LivenessState } from './livenessChallenge.ts'

const centered = { faceCount: 1, box: { wFrac: 0.4 }, yawRatio: 0.5, blinkL: 0.1, blinkR: 0.1 }

function feed(state: LivenessState, frame: Omit<LivenessFrame, 't'> & { t: number }) {
  return advanceLivenessChallenge(state, frame)
}

function start(state: LivenessState, t = 0): LivenessState {
  state = feed(state, { ...centered, t }).state
  return feed(state, { ...centered, t: t + 600 }).state
}

function completeBlink(state: LivenessState, t: number): LivenessState {
  let next = feed(state, { ...centered, t }).state
  next = feed(next, { ...centered, blinkL: 0.8, blinkR: 0.8, t: t + 100 }).state
  return feed(next, { ...centered, t: t + 200 }).state
}

function completeTurn(state: LivenessState, t: number): LivenessState {
  const yawRatio = state.turnDirection === 'left' ? 0.72 : 0.28
  return feed(state, { ...centered, yawRatio, t }).state
}

function finishCorrectSequence(order: 'blink-first' | 'turn-first' = 'blink-first') {
  let state = start(createLivenessState({ order, turnDirection: 'left' }))
  if (order === 'blink-first') {
    state = completeBlink(state, 700)
    state = completeBlink(state, 1000)
  } else {
    state = completeTurn(state, 700)
    state = completeBlink(state, 800)
    state = completeBlink(state, 1100)
  }
  if (state.phase !== 'return') state = completeTurn(state, 1400)
  return state
}

test('a static frontal face never captures', () => {
  let state = createLivenessState({ order: 'blink-first', turnDirection: 'left' })
  for (let t = 0; t <= 10_000; t += 100) state = feed(state, { ...centered, t }).state
  assert.equal(state.phase, 'challenge')
  assert.equal(state.completed.blink, false)
  assert.equal(state.completed.turn, false)
})

test('a complete challenge sequence captures exactly once', () => {
  let state = finishCorrectSequence()
  assert.equal(state.phase, 'return')
  const captured = feed(state, { ...centered, t: 1500 })
  assert.equal(captured.captureNow, true)
  assert.equal(captured.state.phase, 'captured')
  assert.equal(feed(captured.state, { ...centered, t: 1600 }).captureNow, false)
})

test('turning in the wrong direction resets the session', () => {
  const state = start(createLivenessState({ order: 'turn-first', turnDirection: 'left' }))
  const transition = feed(state, { ...centered, yawRatio: 0.28, t: 700 })
  assert.equal(transition.resetMessage, 'Wrong direction — start again')
  assert.equal(transition.state.phase, 'align')
})

test('a second face resets the session', () => {
  const state = start(createLivenessState({ order: 'blink-first', turnDirection: 'left' }))
  const transition = feed(state, { t: 700, faceCount: 2 })
  assert.match(transition.resetMessage ?? '', /More than one face/)
  assert.equal(transition.state.phase, 'align')
})

test('a face lost for more than one second resets the session', () => {
  let state = start(createLivenessState({ order: 'blink-first', turnDirection: 'left' }))
  state = feed(state, { t: 700, faceCount: 0 }).state
  const transition = feed(state, { t: 1701, ...centered })
  assert.match(transition.resetMessage ?? '', /No face detected/)
})

test('a session times out after thirty seconds', () => {
  let state = start(createLivenessState({ order: 'blink-first', turnDirection: 'left' }))
  const transition = feed(state, { ...centered, t: 30_601 })
  assert.equal(transition.resetMessage, 'Timed out — try again')
  assert.equal(transition.state.phase, 'align')
})

test('capture requires a frontal face with both eyes open', () => {
  let state = finishCorrectSequence()
  assert.equal(feed(state, { ...centered, yawRatio: 0.7, t: 1500 }).captureNow, false)
  assert.equal(feed(state, { ...centered, blinkL: 0.8, blinkR: 0.8, t: 1500 }).captureNow, false)
})
