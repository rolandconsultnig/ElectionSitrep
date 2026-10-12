export type MobileFrame = {
  t: number
  faceCount: number
  rotationY: number | null
  minEyeOpen: number | null
  faceWidthFraction?: number | null
  uri?: string
}

export type MobileChallengeOrder = 'blink-first' | 'turn-first'
export type MobileLivenessPhase = 'align' | 'challenge' | 'return' | 'captured'
export type MobileLivenessOptions = { order?: MobileChallengeOrder; random?: () => number }

export type MobileLivenessState = {
  phase: MobileLivenessPhase
  order: MobileChallengeOrder
  challengeIndex: number
  blinkStage: number
  completed: { blink: boolean; turn: boolean }
  startedAt: number | null
  noFaceFrames: number
  options: MobileLivenessOptions
  instruction: string
}

export type MobileLivenessResult = {
  state: MobileLivenessState
  instruction: string
  captureNow: boolean
  resetMessage: string | null
}

function createState(options: MobileLivenessOptions, startedAt: number | null): MobileLivenessState {
  return {
    phase: 'align',
    order: options.order ?? ((options.random ?? Math.random)() < 0.5 ? 'blink-first' : 'turn-first'),
    challengeIndex: 0,
    blinkStage: 0,
    completed: { blink: false, turn: false },
    startedAt,
    noFaceFrames: 0,
    options,
    instruction: 'Look straight at the camera and hold still.',
  }
}

export function createMobileLivenessState(options: MobileLivenessOptions = {}): MobileLivenessState {
  return createState(options, null)
}

function transition(
  state: MobileLivenessState,
  captureNow = false,
  resetMessage: string | null = null,
): MobileLivenessResult {
  return { state, instruction: state.instruction, captureNow, resetMessage }
}

function reset(state: MobileLivenessState, t: number, message: string): MobileLivenessResult {
  const next = createState(state.options, t)
  return transition(next, false, message)
}

function frontal(frame: MobileFrame): boolean {
  return frame.rotationY !== null && Math.abs(frame.rotationY) < 12
}

function challengeInstruction(state: MobileLivenessState): string {
  if (state.phase === 'return') return 'Look straight ahead with both eyes open.'
  const challenge = state.order === 'blink-first'
    ? (state.challengeIndex === 0 ? 'blink' : 'turn')
    : (state.challengeIndex === 0 ? 'turn' : 'blink')
  return challenge === 'blink' ? 'Close your eyes, then open them.' : 'Turn your head to either side.'
}

export function advanceMobileLiveness(state: MobileLivenessState, frame: MobileFrame): MobileLivenessResult {
  if (state.phase === 'captured') return transition(state)
  if (state.startedAt !== null && frame.t - state.startedAt > 30_000) {
    return reset(state, frame.t, 'Timed out — try again')
  }
  if (frame.faceCount > 1) return reset(state, frame.t, 'More than one face — start again')
  if (frame.faceCount === 0) {
    const noFaceFrames = state.noFaceFrames + 1
    if (noFaceFrames >= 3) return reset(state, frame.t, 'No face detected — start again')
    const next = {
      ...state,
      startedAt: state.startedAt ?? frame.t,
      noFaceFrames,
      instruction: 'No face detected — move into view.',
    }
    return transition(next)
  }

  let current = { ...state, startedAt: state.startedAt ?? frame.t, noFaceFrames: 0 }
  if (current.phase === 'align') {
    if (!frontal(frame)) {
      return transition({ ...current, instruction: 'Look straight at the camera and hold still.' })
    }
    current = { ...current, phase: 'challenge' }
    return transition({ ...current, instruction: challengeInstruction(current) })
  }

  if (current.phase === 'challenge') {
    const challenge = current.order === 'blink-first'
      ? (current.challengeIndex === 0 ? 'blink' : 'turn')
      : (current.challengeIndex === 0 ? 'turn' : 'blink')
    if (challenge === 'blink') {
      let blinkStage = current.blinkStage
      let completedBlink = current.completed.blink
      const eyes = frame.minEyeOpen
      if (blinkStage === 0 && eyes !== null && eyes >= 0.6) blinkStage = 1
      else if (blinkStage === 1 && eyes !== null && eyes <= 0.3) blinkStage = 2
      else if (blinkStage === 2 && eyes !== null && eyes >= 0.6) {
        blinkStage = 0
        completedBlink = true
      }
      let next: MobileLivenessState = {
        ...current,
        blinkStage,
        completed: { ...current.completed, blink: completedBlink },
      }
      if (completedBlink) next = { ...next, challengeIndex: next.challengeIndex + 1 }
      if (next.challengeIndex >= 2) next = { ...next, phase: 'return' }
      return transition({ ...next, instruction: challengeInstruction(next) })
    }

    if (frame.rotationY !== null && Math.abs(frame.rotationY) >= 20) {
      let next: MobileLivenessState = {
        ...current,
        completed: { ...current.completed, turn: true },
        challengeIndex: current.challengeIndex + 1,
      }
      if (next.challengeIndex >= 2) next = { ...next, phase: 'return' }
      return transition({ ...next, instruction: challengeInstruction(next) })
    }
    return transition({ ...current, instruction: challengeInstruction(current) })
  }

  if (current.phase === 'return') {
    if (frontal(frame) && frame.minEyeOpen !== null && frame.minEyeOpen >= 0.6) {
      return transition({ ...current, phase: 'captured', instruction: 'Live face verified. Photo captured.' }, true)
    }
    return transition({ ...current, instruction: challengeInstruction(current) })
  }

  return transition(current)
}
