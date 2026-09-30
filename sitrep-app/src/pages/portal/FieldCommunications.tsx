import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Peer from 'simple-peer'
import type { Instance, SignalData } from 'simple-peer'
import { useSocket } from '../../contexts/SocketContext'
import { useAuth } from '../../contexts/AuthContext'
import { apiJson } from '../../lib/api'
import { FieldOfflineBanner } from './FieldPortalPages'

const card = "rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-4 shadow-sm"

type CallType = 'video' | 'audio'

type HistoryRow = {
  id: number | string
  sender_id: string
  sender_username: string
  room_id: string
  content: string
  created_at: string
}

type PendingMessage = { tempId: string; content: string }

type IncomingCallInfo = { callId: string; callerId: string; callerUsername: string; callType: CallType }

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** A message belongs on this officer's HQ thread if it is group traffic or a DM involving this officer. */
const isThreadMessage = (roomId: string) => roomId === 'portal_management' || roomId.startsWith('dm_')

export function FieldCommunications() {
  const { socket, connected, messages, sendMessage, hqOnlineCount } = useSocket()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<ReturnType<typeof toChatMessage>[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  // Call state
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null)
  const [outgoingCall, setOutgoingCall] = useState<{ callId: string; callType: CallType } | null>(null)
  const [inCall, setInCall] = useState(false)
  const [remoteName, setRemoteName] = useState('')
  const [callType, setCallType] = useState<CallType>('video')
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const myVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<Instance | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const signalQueueRef = useRef<SignalData[]>([])
  /** user id of the peer we are signaling with during a call */
  const callPeerIdRef = useRef<string | null>(null)
  const outgoingRef = useRef<{ callId: string; callType: CallType } | null>(null)
  const connectedRef = useRef(connected)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { connectedRef.current = connected }, [connected])
  useEffect(() => { outgoingRef.current = outgoingCall }, [outgoingCall])

  // Scroll chat to bottom when the thread grows
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, messages, pending])

  // ---- Load persisted history (group room + my DM rooms) ----
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [group, dms] = await Promise.all([
          apiJson<{ messages: HistoryRow[] }>('/api/chat/portal_management?limit=100'),
          apiJson<{ messages: HistoryRow[] }>('/api/chat/dm/history?limit=100').catch(() => ({ messages: [] as HistoryRow[] })),
        ])
        if (cancelled) return
        setHistory([...group.messages, ...dms.messages].map(toChatMessage).sort(byTime))
      } catch {
        /* history is best-effort; live chat still works */
      } finally {
        if (!cancelled) setHistoryLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ---- Merge history + live messages (dedupe by id) ----
  const thread = useMemo(() => {
    const seen = new Set<string>()
    const merged: ReturnType<typeof toChatMessage>[] = []
    for (const m of [...history, ...messages.filter((m) => isThreadMessage(m.roomId))]) {
      const key = String(m.id)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(m)
    }
    return merged.sort(byTime)
  }, [history, messages])

  // ---- Flush queued messages when the socket reconnects ----
  useEffect(() => {
    if (!socket) return
    const onConnect = () => {
      setPending((prev) => {
        if (prev.length === 0) return prev
        prev.forEach((q) => sendMessage('portal_management', q.content))
        return []
      })
    }
    socket.on('connect', onConnect)
    return () => { socket.off('connect', onConnect) }
  }, [socket, sendMessage])

  // ---- Media helpers ----
  const getMedia = async (type: CallType) => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true })
    streamRef.current = mediaStream
    if (myVideoRef.current) myVideoRef.current.srcObject = mediaStream
    return mediaStream
  }

  const teardownCall = useCallback((notifyPeer: boolean) => {
    if (notifyPeer && callPeerIdRef.current) {
      socket?.emit('end_call', { targetUserId: callPeerIdRef.current })
    }
    peerRef.current?.destroy()
    peerRef.current = null
    signalQueueRef.current = []
    callPeerIdRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setRemoteStream(null)
    setInCall(false)
    setMuted(false)
    setVideoOff(false)
  }, [socket])

  // Teardown on unmount
  useEffect(() => () => teardownCall(false), [teardownCall])

  // Wire the remote stream into the video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream, inCall])

  // ---- Socket event wiring ----
  useEffect(() => {
    if (!socket) return

    const flushSignals = (peer: Instance) => {
      signalQueueRef.current.forEach((s) => peer.signal(s))
      signalQueueRef.current = []
    }

    const onIncomingCall = (data: IncomingCallInfo) => {
      // Only ring when idle; ignore if we are already in a call or placing one
      if (peerRef.current || outgoingRef.current) return
      setIncomingCall(data)
    }
    socket.on('incoming_call', onIncomingCall)

    const onCallResponse = async (data: { callId: string; responderId: string; responderUsername: string; accepted: boolean }) => {
      const outgoing = outgoingRef.current
      if (!outgoing || data.callId !== outgoing.callId) return
      setOutgoingCall(null)
      if (!data.accepted) {
        setNotice(`Call declined by ${data.responderUsername}.`)
        return
      }
      try {
        const mediaStream = await getMedia(outgoing.callType)
        setCallType(outgoing.callType)
        setRemoteName(data.responderUsername)
        callPeerIdRef.current = data.responderId
        const peer = new Peer({ initiator: false, trickle: false, stream: mediaStream })
        peer.on('signal', (signal) => {
          socket.emit('webrtc_signal', { targetId: callPeerIdRef.current, signal })
        })
        peer.on('stream', (s) => setRemoteStream(s))
        peer.on('close', () => teardownCall(false))
        peer.on('error', () => teardownCall(false))
        peerRef.current = peer
        flushSignals(peer)
        setInCall(true)
      } catch {
        socket.emit('end_call', { targetUserId: data.responderId })
        setNotice('Could not access camera/microphone.')
      }
    }
    socket.on('call_response', onCallResponse)

    const onCallUnavailable = () => {
      if (outgoingRef.current) {
        setOutgoingCall(null)
        setNotice('No HQ staff online right now — try again shortly or leave a message below.')
      }
    }
    socket.on('call_unavailable', onCallUnavailable)

    const onCallEnded = () => {
      setIncomingCall(null)
      setOutgoingCall(null)
      teardownCall(false)
      setNotice('The other party ended the call.')
    }
    socket.on('call_ended', onCallEnded)

    // In-call WebRTC signaling; buffer anything that arrives before our peer exists
    const onSignal = (data: { senderId: string; signal: SignalData }) => {
      if (!peerRef.current) {
        signalQueueRef.current.push(data.signal)
        return
      }
      peerRef.current.signal(data.signal)
    }
    socket.on('webrtc_signal', onSignal)

    return () => {
      socket.off('incoming_call', onIncomingCall)
      socket.off('call_response', onCallResponse)
      socket.off('call_unavailable', onCallUnavailable)
      socket.off('call_ended', onCallEnded)
      socket.off('webrtc_signal', onSignal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // ---- Call actions ----
  const startCall = (type: CallType) => {
    if (!socket || !connected) {
      setNotice('You are offline — reconnect before placing a call.')
      return
    }
    if (hqOnlineCount === 0) {
      setNotice('No HQ staff online right now — leave a message instead.')
      return
    }
    const callId = `${user?.id ?? 'me'}-${Date.now()}`
    setCallType(type)
    setOutgoingCall({ callId, callType: type })
    setNotice(null)
    socket.emit('initiate_call', { callType: type, callId })
  }

  const cancelCall = () => {
    if (outgoingCall) socket?.emit('cancel_call', { callId: outgoingCall.callId })
    setOutgoingCall(null)
  }

  const answerCall = async () => {
    if (!incomingCall) return
    const call = incomingCall
    setIncomingCall(null)
    try {
      const mediaStream = await getMedia(call.callType)
      setCallType(call.callType)
      setRemoteName(call.callerUsername)
      callPeerIdRef.current = call.callerId
      // Acceptor creates the offer (see server convention)
      const peer = new Peer({ initiator: true, trickle: false, stream: mediaStream })
      peer.on('signal', (signal) => {
        socket?.emit('webrtc_signal', { targetId: call.callerId, signal })
      })
      peer.on('stream', (s) => setRemoteStream(s))
      peer.on('close', () => teardownCall(false))
      peer.on('error', () => teardownCall(false))
      peerRef.current = peer
      flushQueued()
      setInCall(true)
      socket?.emit('call_response', { callId: call.callId, callerId: call.callerId, accepted: true })
    } catch {
      socket?.emit('call_response', { callId: call.callId, callerId: call.callerId, accepted: false })
      setNotice('Could not access camera/microphone.')
    }
  }

  const flushQueued = () => {
    const peer = peerRef.current
    if (!peer) return
    signalQueueRef.current.forEach((s) => peer.signal(s))
    signalQueueRef.current = []
  }

  const rejectCall = () => {
    if (incomingCall) {
      socket?.emit('call_response', { callId: incomingCall.callId, callerId: incomingCall.callerId, accepted: false })
    }
    setIncomingCall(null)
  }

  const endCall = () => teardownCall(true)

  const toggleMute = () => {
    const s = streamRef.current
    if (!s) return
    const audio = s.getAudioTracks()[0]
    if (audio) {
      audio.enabled = muted
      setMuted(!muted)
    }
  }

  const toggleVideo = () => {
    if (callType !== 'video') return
    const s = streamRef.current
    if (!s) return
    const video = s.getVideoTracks()[0]
    if (video) {
      video.enabled = videoOff
      setVideoOff(!videoOff)
    }
  }

  // ---- Chat actions ----
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    if (!connected) {
      setPending((prev) => [...prev, { tempId: crypto.randomUUID(), content }])
    } else {
      sendMessage('portal_management', content)
    }
    setInput('')
  }

  const myId = String(user?.id ?? '')

  return (
    <div className="space-y-4 flex flex-col h-full">
      <FieldOfflineBanner />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">HQ Communications</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">Live chat and voice/video coordination with the Situation Room</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${hqOnlineCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
            <span className={`h-2 w-2 rounded-full ${hqOnlineCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {hqOnlineCount < 0 ? 'HQ: checking…' : hqOnlineCount > 0 ? `HQ online (${hqOnlineCount})` : 'HQ offline'}
          </span>
          <button
            onClick={() => startCall('audio')}
            disabled={!!outgoingCall || !!incomingCall || inCall}
            className="rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--portal-fg)] disabled:opacity-50"
            title="Voice call HQ"
          >
            📞 Voice
          </button>
          <button
            onClick={() => startCall('video')}
            disabled={!!outgoingCall || !!incomingCall || inCall}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            title="Video call HQ"
          >
            🎥 Video
          </button>
        </div>
      </header>

      {!connected && (
        <div className="rounded-lg bg-yellow-100 border border-yellow-300 p-2 text-sm text-yellow-900">
          Reconnecting to HQ… messages you send are queued and delivered automatically.
        </div>
      )}

      {notice && (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 p-2 text-sm text-blue-900">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-3 font-bold" aria-label="Dismiss">×</button>
        </div>
      )}

      {outgoingCall && (
        <div className={`${card} border-blue-300 bg-blue-50`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white animate-pulse">📞</span>
              <div>
                <p className="font-semibold text-blue-900">Calling HQ… ({outgoingCall.callType})</p>
                <p className="text-xs text-blue-700">Waiting for the Situation Room to answer</p>
              </div>
            </div>
            <button onClick={cancelCall} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Cancel</button>
          </div>
        </div>
      )}

      {incomingCall && (
        <div className={`${card} border-green-300 bg-green-50`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white animate-pulse">{incomingCall.callType === 'video' ? '🎥' : '📞'}</span>
              <div>
                <p className="font-semibold text-green-900">Incoming {incomingCall.callType} call from {incomingCall.callerUsername}</p>
                <p className="text-xs text-green-700">Situation Room is calling you</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={answerCall} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Answer</button>
              <button onClick={rejectCall} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Decline</button>
            </div>
          </div>
        </div>
      )}

      {inCall && (
        <div className={card}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[var(--portal-muted)] mb-1">{remoteName || 'HQ'} {callType === 'audio' && '· voice'}</p>
              {callType === 'video' ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-48 bg-black rounded-lg object-cover" />
              ) : (
                <div className="w-full h-48 rounded-lg bg-gray-800 flex flex-col items-center justify-center text-white">
                  <span className="text-4xl">{(remoteName || 'H').charAt(0).toUpperCase()}</span>
                  <span className="mt-2 flex items-center gap-1 text-xs text-green-400"><span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />Connected</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-[var(--portal-muted)] mb-1">You {videoOff && callType === 'video' ? '· camera off' : ''} {muted ? '· muted' : ''}</p>
              {callType === 'video' ? (
                <video ref={myVideoRef} autoPlay muted playsInline className={`w-full h-48 bg-black rounded-lg object-cover ${videoOff ? 'opacity-30' : ''}`} />
              ) : (
                <div className="w-full h-48 rounded-lg bg-gray-700 flex items-center justify-center text-white text-4xl">
                  {(user?.username ?? 'Y').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button onClick={toggleMute} className={`rounded-lg px-4 py-2 text-sm font-semibold ${muted ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}`}>
              {muted ? '🔇 Unmute' : '🎙️ Mute'}
            </button>
            {callType === 'video' && (
              <button onClick={toggleVideo} className={`rounded-lg px-4 py-2 text-sm font-semibold ${videoOff ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-800'}`}>
                {videoOff ? '📷 Camera on' : '📷 Camera off'}
              </button>
            )}
            <button onClick={endCall} className="rounded-lg bg-red-600 px-6 py-2 text-sm font-semibold text-white">End call</button>
          </div>
        </div>
      )}

      <div className={`${card} flex-grow flex flex-col min-h-[400px]`}>
        <div className="flex-grow overflow-y-auto p-2 space-y-3">
          {!historyLoaded && <p className="text-center text-xs text-[var(--portal-muted)]">Loading conversation history…</p>}
          {historyLoaded && thread.length === 0 && pending.length === 0 && (
            <p className="text-center text-xs text-[var(--portal-muted)] pt-8">
              No messages yet. Say hello to the Situation Room — or place a voice/video call above.
            </p>
          )}
          {thread.map((m) => {
            const isMe = String(m.senderId) === myId
            const dm = m.roomId.startsWith('dm_')
            return (
              <div key={String(m.id)} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-[var(--portal-muted)] mb-0.5">
                  {isMe ? 'You' : m.senderUsername}{dm && !isMe ? ' · direct' : ''} · {fmtTime(m.createdAt)}
                </span>
                <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${isMe ? 'bg-blue-600 text-white' : 'bg-[var(--portal-input-bg)] text-[var(--portal-fg)] border border-[color:var(--portal-border)]'}`}>
                  {m.content}
                </div>
              </div>
            )
          })}
          {pending.map((q) => (
            <div key={q.tempId} className="flex flex-col items-end">
              <span className="text-[10px] text-yellow-700 mb-0.5">Queued — sends when reconnected</span>
              <div className="px-3 py-2 rounded-lg max-w-[85%] text-sm bg-blue-200 text-blue-900 italic">{q.content}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSend} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connected ? 'Message HQ…' : 'Offline — message will be queued'}
            className="flex-grow rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold">Send</button>
        </form>
      </div>
    </div>
  )
}

function toChatMessage(row: HistoryRow) {
  return {
    id: row.id,
    senderId: String(row.sender_id),
    senderUsername: row.sender_username,
    roomId: row.room_id,
    content: row.content,
    createdAt: row.created_at,
  }
}

function byTime(a: { createdAt: string }, b: { createdAt: string }) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}
