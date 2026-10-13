export type TurnDirection = 'left' | 'right'
export type ChallengeOrder = 'blink-first' | 'turn-first'
export type LivenessPhase = 'align' | 'challenge' | 'return' | 'captured'

export type LivenessFrame = {
  t: number
  faceCount: number
  box?: { wFrac: number }
  yawRatio?: number
  blinkL?: number
  blinkR?: number
}

export type LivenessOptions = {
  turnDirection?: TurnDirection
  order?: ChallengeOrder
  random?: () => number
}

export type LivenessState = {
  phase: LivenessPhase
  order: ChallengeOrder
  turnDirection: TurnDirection
  challengeIndex: number
  blinkCount: number
  blinkStage: number
  alignedSince: number | null
  startedAt: number | null
  noFaceSince: number | null
  completed: { blink: boolean; turn: boolean }
  options: LivenessOptions
  instruction: string
}

export type LivenessResult = {
  state: LivenessState
  instruction: string
  captureNow: boolean
  resetMessage: string | null
}

const FRONTAL_MIN = 0.38
const FRONTAL_MAX = 0.62
const FACE_WIDTH_MIN = 0.16
const ALIGN_MS = 400
const NO_FACE_MS = 1000
const TIMEOUT_MS = 30_000

function chooseOrder(options: LivenessOptions): ChallengeOrder {
  return options.order ?? ((options.random ?? Math.random)() < 0.5 ? 'blink-first' : 'turn-first')
}

function chooseDirection(options: LivenessOptions): TurnDirection {
  return options.turnDirection ?? ((options.random ?? Math.random)() < 0.5 ? 'left' : 'right')
}

function makeState(options: LivenessOptions, startedAt: number | null): LivenessState {
  return {
    phase: 'align',
    order: chooseOrder(options),
    turnDirection: chooseDirection(options),
    challengeIndex: 0,
    blinkCount: 0,
    blinkStage: 0,
    alignedSince: null,
    startedAt,
    noFaceSince: null,
    completed: { blink: false, turn: false },
    options,
    instruction: 'Position your face in the oval and look straight ahead.',
  }
}

export function createLivenessState(options: LivenessOptions = {}): LivenessState {
  return makeState(options, null)
}

function result(state: LivenessState, captureNow = false, resetMessage: string | null = null): LivenessResult {
  return { state, instruction: state.instruction, captureNow, resetMessage }
}

function reset(state: LivenessState, t: number, message: string): LivenessResult {
  const next = makeState(state.options, t)
  next.instruction = 'Position your face in the oval and look straight ahead.'
  return result(next, false, message)
}

function isFrontal(yawRatio: number | undefined): boolean {
  return yawRatio !== undefined && yawRatio >= FRONTAL_MIN && yawRatio <= FRONTAL_MAX
}

function eyesOpen(frame: LivenessFrame): boolean {
  return (frame.blinkL ?? 1) < 0.32 && (frame.blinkR ?? 0) < 0.32
}

function instructionForChallenge(state: LivenessState): string {
  if (state.phase === 'return') return 'Look straight ahead with both eyes open.'
  const challenge = state.order === 'blink-first'
    ? (state.challengeIndex === 0 ? 'blink' : 'turn')
    : (state.challengeIndex === 0 ? 'turn' : 'blink')
  if (challenge === 'blink') return `Blink twice (${state.blinkCount}/2).`
  return `Turn your head to your ${state.turnDirection}.`
}

export function advanceLivenessChallenge(state: LivenessState, frame: LivenessFrame): LivenessResult {
  if (state.phase === 'captured') return result(state)
  if (state.startedAt !== null && frame.t - state.startedAt > TIMEOUT_MS) {
    return reset(state, frame.t, 'Timed out — try again')
  }
  if (frame.faceCount > 1) return reset(state, frame.t, 'More than one face — start again')

  let current = state
  if (frame.faceCount === 0) {
    const noFaceSince = current.noFaceSince ?? frame.t
    if (frame.t - noFaceSince > NO_FACE_MS) return reset(current, frame.t, 'No face detected — start again')
    current = {
      ...current,
      startedAt: current.startedAt ?? frame.t,
      noFaceSince,
      alignedSince: null,
      instruction: 'No face detected — move into view.',
    }
    return result(current)
  }

  if (current.noFaceSince !== null && frame.t - current.noFaceSince > NO_FACE_MS) {
    return reset(current, frame.t, 'No face detected — start again')
  }
  current = { ...current, startedAt: current.startedAt ?? frame.t, noFaceSince: null }

  if (current.phase === 'align') {
    const aligned =
      (frame.box?.wFrac ?? 0) >= FACE_WIDTH_MIN &&
      isFrontal(frame.yawRatio)
    if (!aligned) {
      const instruction = (frame.box?.wFrac ?? 0) < FACE_WIDTH_MIN
        ? 'Move closer until your face fills the oval.'
        : 'Look straight ahead and centre your face.'
      return result({ ...current, alignedSince: null, instruction })
    }

    const alignedSince = current.alignedSince ?? frame.t
    if (frame.t - alignedSince < ALIGN_MS) {
      return result({ ...current, alignedSince, instruction: 'Hold still and look straight ahead.' })
    }
    current = { ...current, phase: 'challenge', alignedSince, instruction: '' }
    return result({ ...current, instruction: instructionForChallenge(current) })
  }

  if (current.phase === 'challenge') {
    const challenge = current.order === 'blink-first'
      ? (current.challengeIndex === 0 ? 'blink' : 'turn')
      : (current.challengeIndex === 0 ? 'turn' : 'blink')

    if (challenge === 'blink') {
      const bothOpen = eyesOpen(frame)
      const bothClosed = (frame.blinkL ?? 0) > 0.45 && (frame.blinkR ?? 0) > 0.45
      let blinkStage = current.blinkStage
      let blinkCount = current.blinkCount
      let completedBlink = current.completed.blink
      if (blinkStage === 0 && bothOpen) blinkStage = 1
      else if (blinkStage === 1 && bothClosed) blinkStage = 2
      else if (blinkStage === 2 && bothOpen) {
        blinkCount += 1
        blinkStage = 0
        if (blinkCount >= 2) completedBlink = true
      }
      let next: LivenessState = {
        ...current,
        blinkCount,
        blinkStage,
        completed: { ...current.completed, blink: completedBlink },
      }
      if (completedBlink) next = { ...next, challengeIndex: next.challengeIndex + 1 }
      if (next.challengeIndex >= 2) next = { ...next, phase: 'return' }
      next = { ...next, instruction: instructionForChallenge(next) }
      return result(next)
    }

    // Target turn reached
    const targetReached = current.turnDirection === 'left'
      ? (frame.yawRatio ?? 0.5) >= 0.64
      : (frame.yawRatio ?? 0.5) <= 0.36
    const wrongDirection = current.turnDirection === 'left'
      ? (frame.yawRatio ?? 0.5) <= 0.28
      : (frame.yawRatio ?? 0.5) >= 0.72
    if (wrongDirection) return reset(current, frame.t, 'Wrong direction — start again')
    if (!targetReached) return result({ ...current, instruction: instructionForChallenge(current) })
    let next: LivenessState = {
      ...current,
      completed: { ...current.completed, turn: true },
      challengeIndex: current.challengeIndex + 1,
    }
    if (next.challengeIndex >= 2) next = { ...next, phase: 'return' }
    next = { ...next, instruction: instructionForChallenge(next) }
    return result(next)
  }

  if (current.phase === 'return') {
    if (isFrontal(frame.yawRatio) && eyesOpen(frame)) {
      const next = { ...current, phase: 'captured' as const, instruction: 'Live face verified. Photo captured.' }
      return result(next, true)
    }
    return result({ ...current, instruction: instructionForChallenge(current) })
  }

  return result(current)
}
