import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceLivenessChallenge,
  createLivenessState,
  type LivenessOptions,
  type LivenessState,
} from '../lib/livenessChallenge'

type Props = {
  onVerified: (dataUrl: string) => void
  resetKey?: number
}

const SAMPLE_MS = 100
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe-wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}models/face_landmarker.task`

let landmarkerPromise: Promise<FaceLandmarker> | null = null

function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 2,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      })
    })()
    landmarkerPromise.catch(() => {
      landmarkerPromise = null
    })
  }
  return landmarkerPromise
}

function challengeOverrides(): LivenessOptions {
  if (!import.meta.env.DEV) return {}
  const params = new URLSearchParams(window.location.search)
  const turn = params.get('liveness_turn')
  const order = params.get('liveness_order')
  return {
    ...(turn === 'left' || turn === 'right' ? { turnDirection: turn } : {}),
    ...(order === 'blink-first' || order === 'turn-first' ? { order } : {}),
  }
}

function getBlendshapeScore(result: ReturnType<FaceLandmarker['detectForVideo']>, name: string) {
  return result.faceBlendshapes[0]?.categories.find((category) => category.categoryName === name)?.score
}

function getLivenessState(options: LivenessOptions): LivenessState {
  return createLivenessState(options)
}

export function LivenessCapture({ onVerified, resetKey = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<number | null>(null)
  const detectorRef = useRef<FaceLandmarker | null>(null)
  const [challengeState, setChallengeState] = useState<LivenessState>(() => getLivenessState(challengeOverrides()))
  const stateRef = useRef<LivenessState>(challengeState)
  const capturedRef = useRef(false)
  const lastTimestampRef = useRef(0)
  const onVerifiedRef = useRef(onVerified)

  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [faceDetected, setFaceDetected] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const resetMessageTimerRef = useRef<number | null>(null)
  const [captured, setCaptured] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    onVerifiedRef.current = onVerified
  }, [onVerified])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || capturedRef.current) return
    const context = canvas.getContext('2d')
    if (!context) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    capturedRef.current = true
    setCaptured(true)
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    intervalRef.current = null
    stopStream()
    video.srcObject = null
    onVerifiedRef.current(dataUrl)
  }, [stopStream])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setPermission('pending')
      setError(null)
      setModelStatus('loading')
      setCaptured(false)
      setFaceDetected(false)
      setResetMessage(null)
    })
    if (resetMessageTimerRef.current !== null) window.clearTimeout(resetMessageTimerRef.current)
    resetMessageTimerRef.current = null
    capturedRef.current = false
    lastTimestampRef.current = 0
    const options = challengeOverrides()
    stateRef.current = getLivenessState(options)
    setChallengeState(stateRef.current)

    async function start() {
      const md = navigator.mediaDevices
      if (!md?.getUserMedia) {
        setPermission('denied')
        setError(
          !window.isSecureContext
            ? 'Camera access requires HTTPS (or http://localhost). A live camera photo is required to continue.'
            : 'Camera API is not available in this browser. A live camera photo is required to continue.',
        )
        return
      }
      if (!window.isSecureContext) {
        setPermission('denied')
        setError('Camera access requires HTTPS (or http://localhost). A live camera photo is required to continue.')
        return
      }

      try {
        const detector = await getFaceLandmarker()
        if (cancelled) return
        detectorRef.current = detector
        setModelStatus('ready')
      } catch {
        if (!cancelled) {
          setModelStatus('error')
          setError('Face detector failed to load. Retry to initialize live face verification again.')
        }
        return
      }

      try {
        const stream = await md.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.muted = true
          video.playsInline = true
          try {
            await video.play()
          } catch {
            setError('Could not start video preview. Reload the page or try Chrome.')
            setPermission('denied')
            stopStream()
            return
          }
        }
        setPermission('granted')
      } catch (cause) {
        setPermission('denied')
        const name = cause instanceof DOMException ? cause.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Camera access was denied. Allow camera for this site in your browser settings and reload.')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera was found. Connect a camera or try another device.')
        } else {
          setError('Camera access is required for live face verification.')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      intervalRef.current = null
      stopStream()
      detectorRef.current = null
      if (resetMessageTimerRef.current !== null) window.clearTimeout(resetMessageTimerRef.current)
      resetMessageTimerRef.current = null
    }
  }, [resetKey, retryCount, stopStream])

  useEffect(() => {
    if (permission !== 'granted' || modelStatus !== 'ready' || captured) return
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector) return

    intervalRef.current = window.setInterval(() => {
      if (!video.videoWidth || capturedRef.current) return
      const timestamp = Math.max(performance.now(), lastTimestampRef.current + 1)
      lastTimestampRef.current = timestamp
      let result: ReturnType<FaceLandmarker['detectForVideo']>
      try {
        result = detector.detectForVideo(video, timestamp)
      } catch {
        setError('Could not analyze the camera frame. Retry live face verification.')
        return
      }

      const faces = result.faceLandmarks
      const landmarks = faces[0]
      let frame: Parameters<typeof advanceLivenessChallenge>[1] = {
        t: timestamp,
        faceCount: faces.length,
      }
      if (landmarks) {
        const left = landmarks[234]
        const nose = landmarks[1]
        const right = landmarks[454]
        const denominator = right && left ? right.x - left.x : 0
        const yawRatio = left && nose && denominator !== 0
          ? (nose.x - left.x) / denominator
          : undefined
        const xCoordinates = landmarks.map((point) => point.x)
        const width = Math.max(...xCoordinates) - Math.min(...xCoordinates)
        frame = {
          ...frame,
          box: { wFrac: width },
          yawRatio,
          blinkL: getBlendshapeScore(result, 'eyeBlinkLeft'),
          blinkR: getBlendshapeScore(result, 'eyeBlinkRight'),
        }
      }

      const transition = advanceLivenessChallenge(stateRef.current, frame)
      stateRef.current = transition.state
      setChallengeState(transition.state)
      setFaceDetected(faces.length === 1)
      if (transition.resetMessage) {
        setResetMessage(transition.resetMessage)
        if (resetMessageTimerRef.current !== null) window.clearTimeout(resetMessageTimerRef.current)
        resetMessageTimerRef.current = window.setTimeout(() => setResetMessage(null), 2500)
      }
      if (transition.captureNow) captureCurrentFrame()
    }, SAMPLE_MS)

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [captureCurrentFrame, captured, modelStatus, permission])

  const insecureContext =
    typeof window !== 'undefined' && typeof window.isSecureContext !== 'undefined' && !window.isSecureContext
  const turnLabel = challengeState.turnDirection.toUpperCase()
  const aligned = challengeState.phase !== 'align'
  const checklist = [
    { label: 'Face aligned', done: aligned },
    { label: 'Blink twice', done: challengeState.completed.blink },
    { label: `Turn ${turnLabel}`, done: challengeState.completed.turn },
    { label: 'Look straight', done: challengeState.phase === 'captured' },
  ]

  return (
    <div className="space-y-3">
      {insecureContext ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100"
        >
          <p className="font-semibold text-amber-50">Camera is blocked in this browser</p>
          <p className="mt-1 text-amber-100/90">
            Pages opened as <code className="rounded bg-black/30 px-1">http://your-ip:port</code> are not a secure
            context. Use <strong>HTTPS</strong> (or <code className="rounded bg-black/30 px-1">http://localhost</code> for
            testing). A live camera photo is required to continue.
          </p>
        </div>
      ) : null}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-black/80">
        {permission === 'granted' ? (
          <video
            ref={videoRef}
            className="h-full w-full scale-x-[-1] object-cover"
            playsInline
            muted
            autoPlay
          />
        ) : (
          <div className="flex h-full min-h-full w-full flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
            <p className="text-sm font-semibold text-white/95">
              {insecureContext ? 'Live camera unavailable on plain HTTP' : 'Live camera required'}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-white/70">
              {permission === 'pending' ? 'Initializing live face verification…' : 'Allow camera access to take your live photo.'}
            </p>
          </div>
        )}
        {permission === 'granted' && !captured ? (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[76%] w-[58%] rounded-[50%] border-2 border-white/75 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14">
              <p className="text-center text-lg font-semibold leading-tight text-white">{challengeState.instruction}</p>
              <p className={`mt-1 text-center text-xs ${faceDetected ? 'text-emerald-300' : 'text-white/70'}`}>
                {faceDetected ? 'Face detected' : 'Waiting for a face'}
              </p>
            </div>
          </>
        ) : null}
        {captured ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full border border-[#00c46a]/50 bg-[#00c46a]/20 px-4 py-2 font-(--font-mono) text-xs font-semibold text-[#00c46a]">
              Photo captured
            </span>
          </div>
        ) : null}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--portal-muted)]">
        {checklist.map((step) => (
          <div key={step.label} className="flex items-center gap-2">
            <span className={step.done ? 'text-[#00c46a]' : 'text-white/40'} aria-hidden>
              {step.done ? '✓' : '○'}
            </span>
            <span className={step.done ? 'text-[var(--sr-heading)]' : ''}>{step.label}</span>
          </div>
        ))}
      </div>

      {resetMessage ? (
        <p className="text-sm font-semibold text-[#f05b4d]" role="alert">
          {resetMessage}
        </p>
      ) : null}
      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-[#fca5a5]" role="alert">{error}</p>
          {modelStatus === 'error' ? (
            <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="sr-btn-ghost text-xs">
              Retry
            </button>
          ) : null}
        </div>
      ) : permission === 'denied' && !insecureContext ? (
        <p className="text-sm text-[#fca5a5]" role="alert">
          Allow camera access in your browser settings and reload. A live camera photo is required.
        </p>
      ) : null}
    </div>
  )
}
