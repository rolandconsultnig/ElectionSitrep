import FaceDetection, { type FaceDetectionOptions } from '@react-native-ml-kit/face-detection'

export type FrameSample = {
  uri: string
  faceCount: number
  minEyeOpen: number | null
}

const DETECTION_OPTS: FaceDetectionOptions = {
  performanceMode: 'accurate',
  classificationMode: 'all',
  minFaceSize: 0.15,
}

export async function sampleFrame(uri: string): Promise<FrameSample> {
  const faces = (await FaceDetection.detect(uri, DETECTION_OPTS)) ?? []
  if (faces.length !== 1) {
    return { uri, faceCount: faces.length, minEyeOpen: null }
  }
  const f = faces[0]
  const eyes = [f.leftEyeOpenProbability, f.rightEyeOpenProbability].filter(
    (v): v is number => typeof v === 'number'
  )
  return {
    uri,
    faceCount: 1,
    minEyeOpen: eyes.length ? Math.min(...eyes) : null,
  }
}

export type LivenessVerdict = {
  ok: boolean
  reason: string | null
}

/**
 * Judges a sequence of frames: exactly one face in each, and a blink —
 * eye-open probability crosses from open (>= OPEN) to closed (<= CLOSED)
 * and back, or starts closed and opens. Rejects photos/screens that never blink.
 */
export function judgeFrames(frames: FrameSample[]): LivenessVerdict {
  const withFace = frames.filter((f) => f.faceCount === 1)
  if (withFace.length < Math.min(2, frames.length)) {
    const anyMulti = frames.some((f) => f.faceCount > 1)
    return {
      ok: false,
      reason: anyMulti
        ? 'More than one face detected — capture one face only.'
        : 'No face detected — centre your face in good light.',
    }
  }
  const eyeVals = withFace.map((f) => f.minEyeOpen).filter((v): v is number => v !== null)
  if (eyeVals.length < 2) {
    return { ok: false, reason: 'Eyes not visible — look directly at the camera.' }
  }
  const OPEN = 0.6
  const CLOSED = 0.25
  const sawOpen = eyeVals.some((v) => v >= OPEN)
  const sawClosed = eyeVals.some((v) => v <= CLOSED)
  if (!(sawOpen && sawClosed)) {
    return { ok: false, reason: 'Liveness check failed — blink slowly while looking at the camera.' }
  }
  return { ok: true, reason: null }
}
