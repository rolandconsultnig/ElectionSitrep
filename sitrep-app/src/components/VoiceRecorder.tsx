import { useEffect, useRef, useState } from 'react'

/**
 * Voice note recorder for field SitReps (MediaRecorder API).
 * Emits a `data:audio/...;base64,…` URL via onChange — the same envelope the
 * photo attachment uses, so it flows through the existing offline queue and
 * /api/field/sync without transport changes.
 */

const MAX_SECONDS = 120

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  '',
]

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of MIME_CANDIDATES) {
    if (m && MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

function fmtElapsed(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

export function VoiceRecorder({
  value,
  onChange,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
}) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch { /* noop */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  async function start() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stopTimer()
        setRecording(false)
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size === 0) {
          setError('Nothing was captured — try again and speak closer to the microphone.')
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') onChange(reader.result)
        }
        reader.onerror = () => setError('Could not encode the recording.')
        reader.readAsDataURL(blob)
      }
      recorder.start(1000)
      setElapsed(0)
      setRecording(true)
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_SECONDS) {
            try { recorderRef.current?.stop() } catch { /* noop */ }
            return s
          }
          return s + 1
        })
      }, 1000)
    } catch (e) {
      const msg = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        ? 'Microphone permission denied — allow mic access to record a voice SitRep.'
        : e instanceof Error
          ? e.message
          : 'Could not start the recorder.'
      setError(msg)
    }
  }

  function stop() {
    try { recorderRef.current?.stop() } catch { /* noop */ }
  }

  if (!supported) {
    return (
      <p className="mt-2 text-xs text-[var(--portal-muted)]">
        Voice notes are not supported in this browser — type the narrative instead.
      </p>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      {value && !recording ? (
        <div className="rounded-lg border border-[color:var(--portal-border)] p-2">
          <audio controls src={value} className="h-9 w-full" />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded border border-[color:var(--portal-border)] px-3 py-1 text-xs font-semibold text-[var(--portal-muted)] hover:brightness-125"
            >
              Remove voice note
            </button>
            <button
              type="button"
              onClick={() => { onChange(null); void start() }}
              className="rounded border border-[color:var(--portal-border)] px-3 py-1 text-xs font-semibold text-[var(--portal-muted)] hover:brightness-125"
            >
              Re-record
            </button>
          </div>
        </div>
      ) : recording ? (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-600" />
          </span>
          <span className="font-mono text-sm font-bold text-rose-400">{fmtElapsed(elapsed)}</span>
          <span className="text-xs text-[var(--portal-muted)]">Recording… (max {MAX_SECONDS / 60} min)</span>
          <button
            type="button"
            onClick={stop}
            className="ml-auto rounded bg-rose-600 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-500"
          >
            Stop
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          className="w-full rounded-lg border border-dashed border-[color:var(--portal-border)] px-4 py-3 text-sm font-semibold text-[var(--portal-muted)] hover:border-[var(--portal-fg)] hover:text-[var(--portal-fg)]"
        >
          🎙 Record voice SitRep
        </button>
      )}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
    </div>
  )
}
