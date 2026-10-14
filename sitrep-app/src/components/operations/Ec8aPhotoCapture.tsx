import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  onCaptured: (dataUrl: string) => void
  /** Existing photo (data URL) to show as the current capture. */
  currentPhoto?: string
  onClear?: () => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function downscaleForUpload(dataUrl: string, maxDim = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width || 1280
      let h = img.height || 960
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
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/**
 * Rear-camera document capture for the EC8A result sheet, with a file-upload
 * fallback for browsers/devices without camera access. Mirrors the secure-
 * context handling of LivenessCapture.
 */
export function Ec8aPhotoCapture({ onCaptured, currentPhoto, onClear }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopStream(), [stopStream])

  const openCamera = useCallback(async () => {
    setError(null)
    const md = navigator.mediaDevices
    if (!md?.getUserMedia) {
      setError(
        !window.isSecureContext
          ? 'Camera requires HTTPS (or localhost). Upload a photo of the sheet instead.'
          : 'Camera is not available in this browser. Upload a photo of the sheet instead.',
      )
      return
    }
    try {
      const stream = await md.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()
      setCameraOpen(true)
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera access was denied. Allow camera or upload a photo instead.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera detected on this device. Upload a photo instead.')
      } else {
        setError('Camera unavailable. Upload a photo instead.')
      }
    }
  }, [])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    stopStream()
    setCameraOpen(false)
    const dataUrl = await downscaleForUpload(canvas.toDataURL('image/jpeg', 0.92))
    onCaptured(dataUrl)
  }, [onCaptured, stopStream])

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      try {
        const raw = await readFileAsDataUrl(file)
        const dataUrl = await downscaleForUpload(raw)
        onCaptured(dataUrl)
      } catch {
        setError('Could not read the selected image.')
      }
    },
    [onCaptured],
  )

  return (
    <div className="space-y-2">
      {currentPhoto && !cameraOpen ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border border-[color:var(--portal-border)]">
            <img src={currentPhoto} alt="EC8A result sheet" className="max-h-64 w-full object-contain bg-black/40" />
            <span className="absolute right-2 top-2 rounded-full border border-[#00c46a]/50 bg-[#00c46a]/20 px-2.5 py-1 font-(--font-mono) text-[10px] font-bold text-[#00c46a]">
              ✓ Sheet captured
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { onClear?.() }} className="sr-btn-ghost px-3 py-1.5 text-xs">
              🗑 Remove photo
            </button>
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border border-[color:var(--portal-border)] bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" playsInline muted autoPlay />
            <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-dashed border-[#00c46a]/70" />
            <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-center text-xs text-white/90">
              Fill the frame with the result sheet — all figures legible, no glare
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={capture} className="sr-btn-primary flex-1 justify-center py-2 text-xs font-semibold">
              📸 Capture Sheet
            </button>
            <button
              type="button"
              onClick={() => { stopStream(); setCameraOpen(false) }}
              className="sr-btn-ghost px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : !currentPhoto ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openCamera} className="sr-btn-primary px-4 py-2 text-xs font-semibold">
            📷 Capture EC8A Sheet Photo
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="sr-btn-ghost px-4 py-2 text-xs">
            📁 Upload Photo
          </button>
        </div>
      ) : (
        <button type="button" onClick={openCamera} className="sr-btn-ghost px-4 py-2 text-xs">
          📷 Retake photo
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {error ? (
        <p className="text-xs text-[#fca5a5]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
