import { useCallback, useEffect, useRef, useState } from 'react'
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

type Props = {
  /** Called with a JPEG data URL after liveness passes and the user taps Capture */
  onVerified: (snapshotDataUrl: string) => void
  /** Reset key from parent to allow retake */
  resetKey?: number
}

const BLINKS_REQUIRED = 2
const SAMPLE_MS = 160
const SPIKE_THRESHOLD = 14
const COOLDOWN_MS = 450
const FACE_SCORE_THRESHOLD = 0.5
const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe-wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`

let detectorPromise: Promise<FaceDetector> | null = null
let imageDetectorPromise: Promise<FaceDetector> | null = null

/** Singleton BlazeFace detector — model + WASM are bundled under /public so it works fully offline. */
function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'VIDEO',
        minDetectionConfidence: FACE_SCORE_THRESHOLD,
      })
    })()
    detectorPromise.catch(() => {
      detectorPromise = null
    })
  }
  return detectorPromise
}

/** IMAGE-mode detector for verifying uploaded still photos — separate instance since runningMode is fixed at creation. */
function getImageFaceDetector(): Promise<FaceDetector> {
  if (!imageDetectorPromise) {
    imageDetectorPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: 'IMAGE',
        minDetectionConfidence: FACE_SCORE_THRESHOLD,
      })
    })()
    imageDetectorPromise.catch(() => {
      imageDetectorPromise = null
    })
  }
  return imageDetectorPromise
}

/** Frame difference for blink detection */
function frameDiff(a: ImageData, b: ImageData): number {
  const da = a.data
  const db = b.data
  let sum = 0
  const len = Math.min(da.length, db.length)
  for (let i = 0; i < len; i += 4) {
    sum +=
      Math.abs(da[i] - db[i]) +
      Math.abs(da[i + 1] - db[i + 1]) +
      Math.abs(da[i + 2] - db[i + 2])
  }
  return sum / (len / 4) / 3
}

/** Best detection in a frame: highest-confidence face bounding box, or null when none found. */
function bestFace(result: ReturnType<FaceDetector['detectForVideo']>) {
  let best: { score: number; boxArea: number } | null = null
  for (const d of result.detections) {
    const score = d.categories[0]?.score ?? 0
    const box = d.boundingBox
    if (!box || score < FACE_SCORE_THRESHOLD) continue
    const boxArea = box.width * box.height
    if (!best || score > best.score) best = { score, boxArea }
  }
  return best
}

/** Analyze texture to detect printed photos vs real skin */
function analyzeTexture(frames: ImageData[]): { isLive: boolean; confidence: number; reason?: string } {
  if (frames.length < 3) return { isLive: false, confidence: 0, reason: 'Analyzing...' }

  // Calculate temporal variance (real faces have micro-movements)
  const variances: number[] = []
  
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1].data
    const curr = frames[i].data
    let sumSqDiff = 0
    const sampleStep = 16 // Sample every 4th pixel for performance
    
    for (let j = 0; j < prev.length; j += sampleStep) {
      const diff = (prev[j] + prev[j+1] + prev[j+2]) / 3 - (curr[j] + curr[j+1] + curr[j+2]) / 3
      sumSqDiff += diff * diff
    }
    
    const variance = sumSqDiff / (prev.length / sampleStep)
    variances.push(variance)
  }

  const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length
  const maxVariance = Math.max(...variances)
  
  // Printed photos have very low temporal variance
  if (avgVariance < 5 && maxVariance < 15) {
    return { isLive: false, confidence: 0.1, reason: 'Static image detected - please use live camera' }
  }

  // Screens may have flicker patterns (high frequency)
  const varianceOfVariances = variances.reduce((sum, v) => sum + Math.pow(v - avgVariance, 2), 0) / variances.length
  if (varianceOfVariances > 500 && avgVariance > 50) {
    return { isLive: false, confidence: 0.3, reason: 'Screen flicker detected - avoid screens' }
  }

  // Natural live face has moderate variance
  if (avgVariance > 8 && avgVariance < 200) {
    return { isLive: true, confidence: Math.min(0.85, avgVariance / 100) }
  }

  return { isLive: avgVariance > 5, confidence: 0.4, reason: 'Keep face steady and well-lit' }
}



function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('Failed to read file'))
    r.readAsDataURL(file)
  })
}

export function LivenessCapture({ onVerified, resetKey = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prevFrameRef = useRef<ImageData | null>(null)
  const lastSpikeRef = useRef(0)
  const blinkCountRef = useRef(0)
  const blinksCompleteRef = useRef(false)
  const intervalRef = useRef<number | null>(null)
  const frameHistoryRef = useRef<ImageData[]>([])
  const frameCountRef = useRef(0)
  const detectorRef = useRef<FaceDetector | null>(null)
  const lastDetectTsRef = useRef(-1)

  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [blinkCount, setBlinkCount] = useState(0)
  const [canCapture, setCanCapture] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [livenessStatus, setLivenessStatus] = useState<'checking' | 'live' | 'spoof'>('checking')
  const [statusMessage, setStatusMessage] = useState('Position your face in the camera frame')
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !canCapture || captured) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !video.videoWidth) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const snap = canvas.toDataURL('image/jpeg', 0.92)
    setCaptured(true)
    setCanCapture(false)
    stopStream()
    if (video.srcObject) video.srcObject = null
    onVerified(snap)
  }, [canCapture, captured, onVerified, stopStream])

  const [prevResetKey, setPrevResetKey] = useState(resetKey)

  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setCaptured(false)
    setCanCapture(false)
    setBlinkCount(0)
    setFaceDetected(false)
    setLivenessStatus('checking')
    setStatusMessage('Position your face in the camera frame')
    setError(null)
  }

  useEffect(() => {
    blinkCountRef.current = 0
    blinksCompleteRef.current = false
    prevFrameRef.current = null
    lastSpikeRef.current = 0
    frameHistoryRef.current = []
    frameCountRef.current = 0

    let cancelled = false

    async function start() {
      const md = navigator.mediaDevices
      if (!md?.getUserMedia) {
        setPermission('denied')
        setError(
          !window.isSecureContext
            ? "Camera is blocked: this page is not served over HTTPS. Browsers only allow camera on https:// or http://localhost. Put the app behind TLS (e.g. nginx with Let's Encrypt on a domain), then reload."
            : 'Camera API is not available in this browser.',
        )
        return
      }
      // Non-localhost HTTP is never a secure context — getUserMedia will fail; skip to avoid errors and use upload.
      if (!window.isSecureContext) {
        setPermission('denied')
        setError(null)
        return
      }
      try {
        const stream = await md.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.muted = true
          v.playsInline = true
          try {
            await v.play()
          } catch {
            setError(
              'Could not start video preview. Tap anywhere on the page and reload, or try another browser (Chrome recommended).',
            )
            setPermission('denied')
            stream.getTracks().forEach((t) => t.stop())
            return
          }
        }
        setPermission('granted')
      } catch (e) {
        setPermission('denied')
        const name = e instanceof DOMException ? e.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('Camera access was denied. Allow camera for this site in your browser settings and reload.')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('No camera was found. Connect a camera or try another device.')
        } else {
          setError('Camera access is required for live face verification.')
        }
      }

      try {
        const detector = await getFaceDetector()
        if (!cancelled) {
          detectorRef.current = detector
          setModelStatus('ready')
        }
      } catch {
        if (!cancelled) {
          setModelStatus('error')
          setError('Face detector failed to load. Check your connection and reload, or use Upload photo.')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      stopStream()
    }
  }, [resetKey, stopStream])

  useEffect(() => {
    if (permission !== 'granted' || captured) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const w = 128
    const h = 96

    intervalRef.current = window.setInterval(() => {
      if (!video.videoWidth || captured || blinksCompleteRef.current) return

      canvas.width = w
      canvas.height = h
      ctx.drawImage(video, 0, 0, w, h)
      const frame = ctx.getImageData(0, 0, w, h)
      const prev = prevFrameRef.current

      // Face detection and anti-spoofing
      frameCountRef.current++

      const detector = detectorRef.current
      if (!detector) {
        setStatusMessage('Loading face detector…')
        prevFrameRef.current = frame
        return
      }

      const now = performance.now()
      let face: { score: number; boxArea: number } | null = null
      if (now > lastDetectTsRef.current) {
        lastDetectTsRef.current = now
        try {
          face = bestFace(detector.detectForVideo(video, now))
        } catch {
          face = null
        }
      }

      // Require a face covering a reasonable part of the frame — objects, hands, and
      // background never produce a bounding box, so this rejects non-human subjects.
      const frameArea = video.videoWidth * video.videoHeight
      const hasFace = !!face && face.boxArea / frameArea >= 0.02
      setFaceDetected(hasFace)

      if (!hasFace) {
        setStatusMessage(
          face ? 'Move closer — your face is too small in frame' : 'No human face detected — position your face in frame',
        )
        setLivenessStatus('checking')
        prevFrameRef.current = frame
        return
      }

      // Collect frames for texture analysis
      if (frameCountRef.current % 3 === 0) {
        frameHistoryRef.current.push(frame)
        if (frameHistoryRef.current.length > 10) {
          frameHistoryRef.current.shift()
        }
      }

      // Run texture analysis periodically
      if (frameCountRef.current % 6 === 0 && frameHistoryRef.current.length >= 5) {
        const textureCheck = analyzeTexture(frameHistoryRef.current)
        
        if (!textureCheck.isLive) {
          setStatusMessage(textureCheck.reason || 'Possible spoof detected')
          setLivenessStatus('spoof')
          prevFrameRef.current = frame
          return
        }
        
        setLivenessStatus('live')
      }

      // Update status message based on progress
      if (livenessStatus !== 'live') {
        setStatusMessage('Face detected. Blink slowly when ready.')
      }

      // Blink detection — only while a real face is confirmed and not flagged as spoof
      if (prev && livenessStatus !== 'spoof') {
        const diff = frameDiff(frame, prev)
        if (
          diff > SPIKE_THRESHOLD &&
          now - lastSpikeRef.current > COOLDOWN_MS &&
          blinkCountRef.current < BLINKS_REQUIRED
        ) {
          lastSpikeRef.current = now
          blinkCountRef.current += 1
          setBlinkCount(blinkCountRef.current)
          setStatusMessage(`Blinks: ${blinkCountRef.current} / ${BLINKS_REQUIRED}`)

          if (blinkCountRef.current >= BLINKS_REQUIRED) {
            blinksCompleteRef.current = true
            if (intervalRef.current) window.clearInterval(intervalRef.current)
            intervalRef.current = null
            setCanCapture(true)
            setStatusMessage('Verification complete! Tap Capture photo')
          }
        }
      }

      prevFrameRef.current = frame
    }, SAMPLE_MS)

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [permission, captured, livenessStatus])

  const getStatusColor = () => {
    if (livenessStatus === 'spoof') return 'text-[#f05b4d]'
    if (livenessStatus === 'live') return 'text-[#d9b64a]'
    return 'text-white'
  }

  const insecureContext =
    typeof window !== 'undefined' && typeof window.isSecureContext !== 'undefined' && !window.isSecureContext

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
            context. Use <strong>HTTPS</strong> (nginx + Let&apos;s Encrypt on a domain), or{' '}
            <code className="rounded bg-black/30 px-1">http://localhost</code> for testing. Live face verification is strictly required.
          </p>
        </div>
      ) : null}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-black/80">
        {insecureContext && !captured ? (
          <div className="flex h-full min-h-full w-full flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
            <p className="text-sm font-semibold text-white/95">Live camera unavailable on plain HTTP</p>
            <p className="max-w-sm text-xs leading-relaxed text-white/70">
              Use HTTPS (or <code className="rounded bg-black/40 px-1">http://localhost</code> for testing). Live face verification is required to proceed.
            </p>
          </div>
        ) : (
          <>
            {!(insecureContext && captured) ? (
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
                autoPlay
              />
            ) : null}
            {!captured ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-12">
                <p className={`text-center font-(--font-mono) text-[11px] font-semibold ${getStatusColor()}`}>
                  {statusMessage}
                </p>
                {faceDetected && livenessStatus !== 'spoof' && (
                  <p className="mt-1 text-center font-(--font-mono) text-[10px] text-white/75">
                    Detected blinks: {blinkCount} / {BLINKS_REQUIRED}
                  </p>
                )}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="rounded-full border border-[#00c46a]/50 bg-[#00c46a]/20 px-4 py-2 font-(--font-mono) text-xs font-semibold text-[#00c46a]">
                  Photo captured
                </span>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>

      {canCapture && !captured ? (
        <button type="button" onClick={capturePhoto} className="sr-btn-primary w-full justify-center py-3">
          Capture photo
        </button>
      ) : null}

      {error ? (
        <p className="text-sm text-[#fca5a5]" role="alert">
          {error}
        </p>
      ) : permission === 'denied' && !insecureContext ? (
        <p className="text-sm text-[#fca5a5]" role="alert">
          Allow camera access in your browser settings and reload.
        </p>
      ) : null}

      <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--sr-panel)]/40 p-4">
        <p className="sr-label mb-2">Upload photo (fallback)</p>
        <p className="mb-3 text-xs text-[var(--portal-muted)]">
          Use when the camera preview stays blank or the browser blocks camera over HTTP. JPEG or PNG only (not WEBP)
          — the photo must show a real face, which is checked automatically.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={async (ev) => {
            const file = ev.target.files?.[0]
            ev.target.value = ''
            if (!file) return
            const t = file.type.toLowerCase()
            if (t !== 'image/jpeg' && t !== 'image/png') {
              setError('Choose a JPEG or PNG image.')
              return
            }
            try {
              let dataUrl = await readFileAsDataUrl(file)
              if (dataUrl.startsWith('data:image/png')) {
                const img = new Image()
                await new Promise<void>((resolve, reject) => {
                  img.onload = () => resolve()
                  img.onerror = () => reject(new Error('Invalid image'))
                  img.src = dataUrl
                })
                const c = document.createElement('canvas')
                c.width = img.naturalWidth
                c.height = img.naturalHeight
                const cx = c.getContext('2d')
                if (!cx) throw new Error('Canvas error')
                cx.drawImage(img, 0, 0)
                dataUrl = c.toDataURL('image/jpeg', 0.92)
              }

              // Verify the uploaded photo actually contains a real human face —
              // the upload path bypasses the live camera, so without this check
              // any image (object, screen, logo) would pass.
              const detector = await getImageFaceDetector()
              const imgEl = new Image()
              await new Promise<void>((resolve, reject) => {
                imgEl.onload = () => resolve()
                imgEl.onerror = () => reject(new Error('Invalid image'))
                imgEl.src = dataUrl
              })
              const result = detector.detect(imgEl)
              const imgArea = imgEl.naturalWidth * imgEl.naturalHeight
              const faces = result.detections.filter((d) => {
                const score = d.categories[0]?.score ?? 0
                const box = d.boundingBox
                return box && score >= FACE_SCORE_THRESHOLD && box.width * box.height / imgArea >= 0.01
              })
              if (faces.length === 0) {
                throw new Error('No human face detected in that photo — upload a clear face photo or use the camera.')
              }
              if (faces.length > 1) {
                throw new Error('More than one face detected — upload a photo of a single face.')
              }

              stopStream()
              if (videoRef.current?.srcObject) videoRef.current.srcObject = null
              setCaptured(true)
              setPermission('granted')
              setError(null)
              onVerified(dataUrl)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not use that image. Try another JPEG or PNG.')
            }
          }}
        />
        <button
          type="button"
          className="sr-btn-ghost w-full justify-center border border-[color:var(--portal-border)] py-2.5 text-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Upload photo (JPEG / PNG)
        </button>
      </div>

      <div className="space-y-1 text-xs leading-relaxed text-[var(--portal-muted)]">
        <p className="flex items-center gap-2">
          <span className={faceDetected ? 'text-[#d9b64a]' : 'text-[#f05b4d]'}>
            {faceDetected ? '✓' : '○'} Face detected
          </span>
          <span className={livenessStatus === 'live' ? 'text-[#d9b64a]' : livenessStatus === 'spoof' ? 'text-[#f05b4d]' : 'text-[#F59E0B]'}>
            {livenessStatus === 'live' ? '✓' : livenessStatus === 'spoof' ? '✗' : '○'} Liveness check
          </span>
        </p>
        <p>
          {modelStatus === 'loading'
            ? 'Face detector is loading…'
            : modelStatus === 'error'
              ? 'Face detector unavailable — use Upload photo or reload.'
              : 'Real face detection active: objects, hands and screens are rejected. Ensure natural lighting and look directly at the camera.'}
        </p>
      </div>
    </div>
  )
}
