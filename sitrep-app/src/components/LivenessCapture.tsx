import { useCallback, useEffect, useRef, useState } from 'react'

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

/** Detect if frame contains a human face using skin color detection and edge analysis */
function detectFacePresence(frame: ImageData): { hasFace: boolean; confidence: number; reason?: string } {
  const data = frame.data
  const width = frame.width
  const height = frame.height
  let skinPixels = 0
  let totalBrightness = 0
  let edgePixels = 0
  const pixelCount = width * height

  // Skin color range in YCbCr (simplified for RGB)
  // Typical skin: R > G > B, R/G ratio between 0.8 and 1.6
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    
    const brightness = (r + g + b) / 3
    totalBrightness += brightness
    
    // Skin detection: warm tones with red dominance but not too red
    const rgRatio = r / (g + 1)
    const rbRatio = r / (b + 1)
    const isSkin = rgRatio > 0.8 && rgRatio < 2.0 && rbRatio > 0.7 && rbRatio < 2.5 && 
                   r > 60 && g > 40 && b > 20 && // Not too dark
                   r < 240 && g < 220 && b < 210 // Not too bright/saturated
    
    if (isSkin) {
      skinPixels++
    }
  }

  // Edge detection (simplified Sobel)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const right = data[idx + 4]
      const down = data[(y + 1) * width * 4 + x * 4]
      
      const gradX = Math.abs(r - right)
      const gradY = Math.abs(r - down)
      
      if (gradX > 30 || gradY > 30) {
        edgePixels++
      }
    }
  }

  const skinRatio = skinPixels / pixelCount
  const avgBrightness = totalBrightness / pixelCount
  const edgeRatio = edgePixels / pixelCount

  // Anti-spoofing checks
  
  // 1. Check for uniform brightness (photos of photos often have flat lighting)
  if (avgBrightness < 40 || avgBrightness > 230) {
    return { hasFace: false, confidence: 0.1, reason: 'Poor lighting - ensure good illumination' }
  }

  // 2. Check for screen reflection patterns (uniform texture)
  if (skinRatio > 0.85) {
    return { hasFace: false, confidence: 0.2, reason: 'Possible screen detected - use natural lighting' }
  }

  // 3. Check for printed photo (too uniform, no skin texture variation)
  if (skinRatio > 0.6 && edgeRatio < 0.05) {
    return { hasFace: false, confidence: 0.3, reason: 'Flat image detected - do not use photos' }
  }

  // 4. Check for animal/non-human (wrong color distribution)
  if (skinRatio < 0.08) {
    return { hasFace: false, confidence: 0.1, reason: 'No human face detected - position your face in frame' }
  }

  // 5. Reasonable face-like structure
  if (skinRatio >= 0.15 && skinRatio <= 0.55 && edgeRatio >= 0.05) {
    return { hasFace: true, confidence: Math.min(0.9, skinRatio * 2 + edgeRatio * 3) }
  }

  // Borderline case
  if (skinRatio >= 0.1 && skinRatio <= 0.6) {
    return { hasFace: true, confidence: 0.5, reason: 'Face detected - ensure clear view' }
  }

  return { hasFace: false, confidence: 0.2, reason: 'Position face clearly in camera view' }
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
    r.onerror = () => reject(new Error('Could not read file'))
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

  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [blinkCount, setBlinkCount] = useState(0)
  const [canCapture, setCanCapture] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [livenessStatus, setLivenessStatus] = useState<'checking' | 'live' | 'spoof'>('checking')
  const [statusMessage, setStatusMessage] = useState('Position your face in the camera frame')

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

  useEffect(() => {
    setCaptured(false)
    setCanCapture(false)
    setBlinkCount(0)
    setFaceDetected(false)
    setLivenessStatus('checking')
    setStatusMessage('Position your face in the camera frame')
    blinkCountRef.current = 0
    blinksCompleteRef.current = false
    prevFrameRef.current = null
    lastSpikeRef.current = 0
    frameHistoryRef.current = []
    frameCountRef.current = 0
    setError(null)

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
      
      // Run face detection every frame
      const faceCheck = detectFacePresence(frame)
      setFaceDetected(faceCheck.hasFace)
      
      if (!faceCheck.hasFace) {
        setStatusMessage(faceCheck.reason || 'No face detected')
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
      if (faceCheck.hasFace && livenessStatus !== 'live') {
        setStatusMessage('Face detected. Blink slowly when ready.')
      }

      // Blink detection
      if (prev && faceCheck.hasFace) {
        const diff = frameDiff(frame, prev)
        const now = performance.now()
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
    if (livenessStatus === 'live') return 'text-[#00C896]'
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
            <code className="rounded bg-black/30 px-1">http://localhost</code> for testing. Otherwise use{' '}
            <strong>Upload photo</strong> below (blink checks are skipped).
          </p>
        </div>
      ) : null}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-black/80">
        {insecureContext && !captured ? (
          <div className="flex h-full min-h-full w-full flex-col items-center justify-center gap-2 bg-black/80 px-6 text-center">
            <p className="text-sm font-semibold text-white/95">Live camera unavailable on plain HTTP</p>
            <p className="max-w-sm text-xs leading-relaxed text-white/70">
              Use HTTPS (or <code className="rounded bg-black/40 px-1">http://localhost</code> for testing), or upload a
              JPEG/PNG below — onboarding works either way.
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
                <span className="rounded-full border border-[#0dccb0]/50 bg-[#0dccb0]/20 px-4 py-2 font-(--font-mono) text-xs font-semibold text-[#0dccb0]">
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
          Use when the camera preview stays blank or the browser blocks camera over HTTP. JPEG or PNG only (not WEBP).
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
              stopStream()
              if (videoRef.current?.srcObject) videoRef.current.srcObject = null
              setCaptured(true)
              setPermission('granted')
              setError(null)
              onVerified(dataUrl)
            } catch {
              setError('Could not use that image. Try another JPEG or PNG.')
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
          <span className={faceDetected ? 'text-[#00C896]' : 'text-[#f05b4d]'}>
            {faceDetected ? '✓' : '○'} Face detected
          </span>
          <span className={livenessStatus === 'live' ? 'text-[#00C896]' : livenessStatus === 'spoof' ? 'text-[#f05b4d]' : 'text-[#F59E0B]'}>
            {livenessStatus === 'live' ? '✓' : livenessStatus === 'spoof' ? '✗' : '○'} Liveness check
          </span>
        </p>
        <p>
          Anti-spoofing active: detects photos of photos, screens, and non-human subjects. 
          Ensure natural lighting and look directly at the camera.
        </p>
      </div>
    </div>
  )
}
