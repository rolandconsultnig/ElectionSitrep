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

export function LivenessCapture({ onVerified, resetKey = 0 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prevFrameRef = useRef<ImageData | null>(null)
  const lastSpikeRef = useRef(0)
  const blinkCountRef = useRef(0)
  const blinksCompleteRef = useRef(false)
  const intervalRef = useRef<number | null>(null)

  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [blinkCount, setBlinkCount] = useState(0)
  const [canCapture, setCanCapture] = useState(false)
  const [captured, setCaptured] = useState(false)

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
    blinkCountRef.current = 0
    blinksCompleteRef.current = false
    prevFrameRef.current = null
    lastSpikeRef.current = 0
    setError(null)

    let cancelled = false

    async function start() {
      const md = navigator.mediaDevices
      if (!md?.getUserMedia) {
        setPermission('denied')
        setError(
          !window.isSecureContext
            ? 'Camera is blocked: this page is not served over HTTPS. Browsers only allow camera on https:// or http://localhost. Put the app behind TLS (e.g. nginx with Let's Encrypt on a domain), then reload.'
            : 'Camera API is not available in this browser.',
        )
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
          await v.play()
        }
        setPermission('granted')
      } catch (e) {
        setPermission('denied')
        const name = e instanceof DOMException ? e.name : ''
        if (!window.isSecureContext) {
          setError(
            'Camera requires HTTPS on this host (plain HTTP from an IP is not a “secure context”). Use TLS on nginx or open via http://localhost only for local testing.',
          )
        } else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
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

    const w = 96
    const h = 72

    intervalRef.current = window.setInterval(() => {
      if (!video.videoWidth || captured || blinksCompleteRef.current) return

      canvas.width = w
      canvas.height = h
      ctx.drawImage(video, 0, 0, w, h)
      const frame = ctx.getImageData(0, 0, w, h)
      const prev = prevFrameRef.current

      if (prev) {
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

          if (blinkCountRef.current >= BLINKS_REQUIRED) {
            blinksCompleteRef.current = true
            if (intervalRef.current) window.clearInterval(intervalRef.current)
            intervalRef.current = null
            setCanCapture(true)
          }
        }
      }

      prevFrameRef.current = frame
    }, SAMPLE_MS)

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [permission, captured])

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-black/80">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
        {!captured ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-12">
            <p className="text-center font-(--font-mono) text-[11px] font-semibold text-white">
              Face the camera · Blink slowly {BLINKS_REQUIRED} times when prompted
            </p>
            <p className="mt-1 text-center font-(--font-mono) text-[10px] text-white/75">
              Detected blinks: {blinkCount} / {BLINKS_REQUIRED}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="rounded-full border border-[#0dccb0]/50 bg-[#0dccb0]/20 px-4 py-2 font-(--font-mono) text-xs font-semibold text-[#0dccb0]">
              Photo captured
            </span>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </div>

      {canCapture && !captured ? (
        <button type="button" onClick={capturePhoto} className="sr-btn-primary w-full justify-center py-3">
          Capture photo
        </button>
      ) : null}

      {permission === 'denied' || error ? (
        <p className="text-sm text-[#fca5a5]" role="alert">
          {error ?? 'Allow camera access in your browser settings and reload.'}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-[var(--portal-muted)]">
        This demo uses motion-based blink detection on your device. Production would call a certified liveness API (depth /
        texture analysis, optional challenge-response) to reduce spoofing from prints or replay.
      </p>
    </div>
  )
}
