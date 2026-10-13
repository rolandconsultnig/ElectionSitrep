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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const rawUrl = String(reader.result || '')
      if (!rawUrl) {
        reject(new Error('Failed to read image file'))
        return
      }
      const img = new Image()
      img.onload = () => {
        try {
          const maxDim = 800
          let w = img.width || 640
          let h = img.height || 480
          if (w > maxDim || h > maxDim) {
            if (w >= h) {
              h = Math.round((h * maxDim) / w)
              w = maxDim
            } else {
              w = Math.round((w * maxDim) / h)
              h = maxDim
            }
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(rawUrl)
            return
          }
          ctx.drawImage(img, 0, 0, w, h)
          const jpegUrl = canvas.toDataURL('image/jpeg', 0.88)
          resolve(jpegUrl)
        } catch {
          resolve(rawUrl)
        }
      }
      img.onerror = () => {
        resolve(rawUrl)
      }
      img.src = rawUrl
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 2,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
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
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const [isUploadedPhoto, setIsUploadedPhoto] = useState(false)
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
    if (!video || !canvas || capturedRef.current) return
    const w = video.videoWidth || 640
    const h = video.videoHeight || 480
    const context = canvas.getContext('2d')
    if (!context) return
    canvas.width = w
    canvas.height = h
    context.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    capturedRef.current = true
    setIsUploadedPhoto(false)
    setCaptured(true)
    setPreviewPhoto(dataUrl)
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
      setIsUploadedPhoto(false)
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
            ? 'Camera access requires HTTPS (or http://localhost). You can upload an officer photo below.'
            : 'Camera API is not available in this browser. You can upload an officer photo below.',
        )
        return
      }

      // Start camera stream first so preview is immediately visible
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
        if (!video) {
          setError('Camera preview is unavailable. Reload the page or upload a photo below.')
          setPermission('denied')
          stopStream()
          return
        }
        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        try {
          await video.play()
        } catch {
          // Playback failed
          setError('Could not start video stream. Reload the page or upload a photo below.')
          setPermission('denied')
          stopStream()
          return
        }
        setPermission('granted')
      } catch (cause) {
        setPermission('denied')
        const name = cause instanceof DOMException ? cause.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Camera access was denied. Allow camera in your browser settings or upload an officer photo below.')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera detected on this device. Upload an officer photo below.')
        } else {
          setError('Camera unavailable. You can upload an officer photo below.')
        }
        return
      }

      // Load face landmarker in background for automated head-turn/blink challenge
      try {
        const detector = await getFaceLandmarker()
        if (cancelled) return
        detectorRef.current = detector
        setModelStatus('ready')
      } catch {
        if (!cancelled) {
          setModelStatus('error')
          // Keep the flow usable: tell the officer why the automated challenge
          // is not progressing and point at the manual capture fallback.
          setError(
            'Automated face challenge could not start (vision model failed to load — check your connection). ' +
              'You can still capture your photo with the button below, or upload a photo.',
          )
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
      {insecureContext && permission !== 'granted' ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100"
        >
          <p className="font-semibold text-amber-50">Camera unavailable on plain HTTP</p>
          <p className="mt-1 text-amber-100/90 text-xs">
            Webcam access requires <strong>HTTPS</strong>. You can upload an officer photo directly using the button below.
          </p>
        </div>
      ) : null}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-black/80">
        {captured && previewPhoto ? (
          <img
            src={previewPhoto}
            alt="Captured officer"
            className={`h-full w-full object-cover ${isUploadedPhoto ? '' : 'scale-x-[-1]'}`}
          />
        ) : (
          <video
            ref={videoRef}
            className={`h-full w-full scale-x-[-1] object-cover ${permission === 'granted' ? '' : 'invisible'}`}
            playsInline
            muted
            autoPlay
          />
        )}
        {permission !== 'granted' && !captured ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
            <p className="text-sm font-semibold text-white/95">
              Live Camera Verification
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-white/70">
              {permission === 'pending'
                ? 'Initializing live camera preview…'
                : 'Allow camera access or upload an officer photo to continue.'}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 rounded-full border border-[#00c46a]/40 bg-[#00c46a]/15 px-4 py-2 font-(--font-mono) text-xs font-semibold text-[#00c46a] hover:bg-[#00c46a]/25 transition"
            >
              📁 Upload Officer Photo Instead
            </button>
          </div>
        ) : null}
        {permission === 'granted' && !captured ? (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[76%] w-[58%] rounded-[50%] border-2 border-white/75 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-4 pt-14">
              <p className="text-center text-lg font-semibold leading-tight text-white">{challengeState.instruction}</p>
              <p className={`mt-1 text-center text-xs ${faceDetected ? 'text-emerald-300' : 'text-white/70'}`}>
                {faceDetected ? 'Face detected — look straight ahead or click Capture' : 'Align face in oval'}
              </p>
            </div>
          </>
        ) : null}
        {captured ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[2px]">
            <span className="rounded-full border border-[#00c46a]/50 bg-[#00c46a]/25 px-4 py-2 font-(--font-mono) text-xs font-bold text-[#00c46a] shadow-[0_0_20px_rgba(0,196,106,0.3)]">
              ✓ Photo Verified
            </span>
          </div>
        ) : null}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          aria-hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              const url = await readFileAsDataUrl(file)
              setPreviewPhoto(url)
              setIsUploadedPhoto(true)
              capturedRef.current = true
              setCaptured(true)
              stopStream()
              onVerifiedRef.current(url)
            } catch {
              setError('Could not process selected image file')
            }
          }}
        />
      </div>

      {permission === 'granted' && !captured ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={captureCurrentFrame}
            className="sr-btn-primary flex-1 justify-center py-2.5 text-xs font-semibold shadow-[0_4px_16px_rgba(0,196,106,0.3)]"
          >
            📸 Capture Live Photo Now
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="sr-btn-ghost py-2.5 text-xs"
          >
            Upload File
          </button>
        </div>
      ) : null}

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
          <div className="flex gap-2">
            {modelStatus === 'error' ? (
              <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="sr-btn-ghost text-xs">
                Retry Camera
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="sr-btn-ghost text-xs text-[#00c46a]"
            >
              Upload Photo Instead
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
