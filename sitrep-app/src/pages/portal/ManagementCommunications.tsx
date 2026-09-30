import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Peer from 'simple-peer'
import type { Instance, SignalData } from 'simple-peer'
import { useSocket } from '../../contexts/SocketContext'
import { useAuth } from '../../contexts/AuthContext'
import { apiJson } from '../../lib/api'

const card = "rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] shadow-sm"

type CallType = 'video' | 'audio'

type HistoryRow = {
  id: number | string
  sender_id: string
  sender_username: string
  room_id: string
  content: string
  created_at: string
}

type ChatMsg = {
  id: string | number
  senderId: string
  senderUsername: string
  roomId: string
  content: string
  createdAt: string
}

type IncomingCallInfo = { callId: string; callerId: string; callerUsername: string; callType: CallType }

type OfficerLite = { userId: string; username: string }

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** Canonical persisted DM room shared by both participants (matches server). */
function dmRoomId(a: string | number, b: string | number) {
  return `dm_${[String(a), String(b)].sort().join('_')}`
}

export function ManagementCommunications() {
  const { socket, messages, sendMessage, onlineOfficers } = useSocket()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'video'>('chat')
  // Current conversation: group room or a DM with one officer
  const [target, setTarget] = useState<{ kind: 'group' } | { kind: 'dm'; officer: OfficerLite }>({ kind: 'group' })
  const roomId = target.kind === 'group' ? 'portal_management' : dmRoomId(user?.id ?? '', target.officer.userId)
  const [notice, setNotice] = useState<string | null>(null)

  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Call state
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null)
  const [outgoing, setOutgoing] = useState<{ callId: string; callType: CallType; pending: string[] } | null>(null)
  const outgoingRef = useRef<typeof outgoing>(null)

  useEffect(() => { outgoingRef.current = outgoing }, [outgoing])

  // Map of userId -> { peer, stream? }
  const [peers, setPeers] = useState<Record<string, { peer: Instance; stream?: MediaStream; callType: CallType }>>({})
  const peersRef = useRef<Record<string, { peer: Instance; stream?: MediaStream; callType: CallType }>>({})
  // WebRTC signals received before the peer object exists, keyed by sender
  const signalQueuesRef = useRef<Record<string, SignalData[]>>({})

  const myVideoRef = useRef<HTMLVideoElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const myId = String(user?.id ?? '')

  // ---- Load history for the current conversation ----
  const [historyState, setHistoryState] = useState<{ roomId: string; messages: ChatMsg[] }>({ roomId: '', messages: [] })
  useEffect(() => {
    let cancelled = false
    apiJson<{ messages: HistoryRow[] }>(`/api/chat/${roomId}?limit=100`)
      .then((res) => {
        if (cancelled) return
        setHistoryState({
          roomId,
          messages: res.messages.map((r) => ({
            id: r.id,
            senderId: String(r.sender_id),
            senderUsername: r.sender_username,
            roomId: r.room_id,
            content: r.content,
            createdAt: r.created_at,
          })),
        })
      })
      .catch(() => { /* live chat still works without history */ })
    return () => { cancelled = true }
  }, [roomId])

  // History is only displayed once it belongs to the currently selected room
  const history = useMemo(
    () => (historyState.roomId === roomId ? historyState.messages : []),
    [historyState, roomId]
  )

  const thread = useMemo(() => {
    const seen = new Set<string>()
    const merged: ChatMsg[] = []
    for (const m of [...history, ...messages.filter((m) => m.roomId === roomId)]) {
      const key = String(m.id)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(m)
    }
    return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [history, messages, roomId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread])

  // ---- Peer helpers ----
  const addPeer = useCallback((userId: string, peer: Instance, callType: CallType) => {
    peersRef.current = { ...peersRef.current, [userId]: { peer, callType } }
    setPeers(peersRef.current)
    // Flush any signals that arrived before the peer existed
    const queued = signalQueuesRef.current[userId] ?? []
    signalQueuesRef.current[userId] = []
    queued.forEach((s) => peer.signal(s))
  }, [])

  const removePeer = useCallback((userId: string, notify: boolean) => {
    const existing = peersRef.current[userId]
    if (existing) existing.peer.destroy()
    const next = { ...peersRef.current }
    delete next[userId]
    peersRef.current = next
    setPeers(next)
    delete signalQueuesRef.current[userId]
    if (notify) socket?.emit('end_call', { targetUserId: userId })
    if (Object.keys(peersRef.current).length === 0) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setStream(null)
    }
  }, [socket])

  const getMedia = async (callType: CallType) => {
    if (streamRef.current) return streamRef.current
    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true })
    streamRef.current = mediaStream
    setStream(mediaStream)
    if (myVideoRef.current) myVideoRef.current.srcObject = mediaStream
    return mediaStream
  }

  // Teardown everything on unmount
  useEffect(() => () => {
    Object.values(peersRef.current).forEach((p) => p.peer.destroy())
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // ---- Socket wiring ----
  useEffect(() => {
    if (!socket) return

    const onIncomingCall = (data: IncomingCallInfo) => {
      if (incomingCall || Object.keys(peersRef.current).length > 0 || outgoingRef.current) return
      setIncomingCall(data)
    }
    socket.on('incoming_call', onIncomingCall)

    // Another HQ screen took the call — close our modal
    const onCallTaken = (data: { callId: string }) => {
      setIncomingCall((prev) => (prev && prev.callId === data.callId ? null : prev))
    }
    socket.on('call_taken', onCallTaken)

    const onCallResponse = async (data: { callId: string; responderId: string; responderUsername: string; accepted: boolean }) => {
      const current = outgoingRef.current
      if (!current || data.callId !== current.callId) return
      const stillPending = current.pending.filter((id) => id !== data.responderId)
      if (!data.accepted) {
        setNotice(`${data.responderUsername} declined the call.`)
        if (stillPending.length === 0) setOutgoing(null)
        else setOutgoing({ ...current, pending: stillPending })
        return
      }
      try {
        const mediaStream = await getMedia(current.callType)
        // Caller is the offer-RECEIVER: the acceptor initiates the WebRTC offer
        const peer = new Peer({ initiator: false, trickle: false, stream: mediaStream })
        peer.on('signal', (signal) => {
          socket.emit('webrtc_signal', { targetId: data.responderId, signal })
        })
        peer.on('stream', (remoteStream) => {
          const entry = peersRef.current[data.responderId]
          if (entry) {
            peersRef.current = { ...peersRef.current, [data.responderId]: { ...entry, stream: remoteStream } }
            setPeers(peersRef.current)
          }
        })
        peer.on('close', () => removePeer(data.responderId, false))
        peer.on('error', () => removePeer(data.responderId, false))
        addPeer(data.responderId, peer, current.callType)
        setActiveTab('video')
        if (stillPending.length === 0) setOutgoing(null)
        else setOutgoing({ ...current, pending: stillPending })
      } catch {
        socket.emit('end_call', { targetUserId: data.responderId })
        setNotice('Could not access camera/microphone.')
        if (stillPending.length === 0) setOutgoing(null)
        else setOutgoing({ ...current, pending: stillPending })
      }
    }
    socket.on('call_response', onCallResponse)

    const onCallCancelled = (data: { callId: string }) => {
      setIncomingCall((prev) => (prev && prev.callId === data.callId ? null : prev))
    }
    socket.on('call_cancelled', onCallCancelled)

    const onCallEnded = (data: { byUsername?: string }) => {
      // Remote hung up; removePeer resolves which peer closed via 'close' event
      setNotice(data.byUsername ? `${data.byUsername} ended the call.` : 'Call ended.')
    }
    socket.on('call_ended', onCallEnded)

    const onSignal = (data: { senderId: string; signal: SignalData }) => {
      const { senderId, signal } = data
      const existing = peersRef.current[senderId]
      if (existing) {
        existing.peer.signal(signal)
      } else {
        signalQueuesRef.current[senderId] = [...(signalQueuesRef.current[senderId] ?? []), signal]
      }
    }
    socket.on('webrtc_signal', onSignal)

    return () => {
      socket.off('incoming_call', onIncomingCall)
      socket.off('call_taken', onCallTaken)
      socket.off('call_response', onCallResponse)
      socket.off('call_cancelled', onCallCancelled)
      socket.off('call_ended', onCallEnded)
      socket.off('webrtc_signal', onSignal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // ---- Call actions ----
  const startCall = async (userIds: string[], callType: CallType) => {
    if (userIds.length === 0) return
    const callId = `${myId}-${Date.now()}`
    setOutgoing({ callId, callType, pending: [...userIds] })
    setNotice(null)
    userIds.forEach((id) => {
      socket?.emit('call_user', { targetUserId: id, callType, callId })
    })
    setActiveTab('video')
  }

  const answerIncoming = async () => {
    if (!incomingCall) return
    const call = incomingCall
    setIncomingCall(null)
    try {
      const mediaStream = await getMedia(call.callType)
      // Acceptor creates the offer (server convention)
      const peer = new Peer({ initiator: true, trickle: false, stream: mediaStream })
      peer.on('signal', (signal) => {
        socket?.emit('webrtc_signal', { targetId: call.callerId, signal })
      })
      peer.on('stream', (remoteStream) => {
        const entry = peersRef.current[call.callerId]
        if (entry) {
          peersRef.current = { ...peersRef.current, [call.callerId]: { ...entry, stream: remoteStream } }
          setPeers(peersRef.current)
        }
      })
      peer.on('close', () => removePeer(call.callerId, false))
      peer.on('error', () => removePeer(call.callerId, false))
      addPeer(call.callerId, peer, call.callType)
      setActiveTab('video')
      socket?.emit('call_response', { callId: call.callId, callerId: call.callerId, accepted: true })
    } catch {
      socket?.emit('call_response', { callId: call.callId, callerId: call.callerId, accepted: false })
      setNotice('Could not access camera/microphone.')
    }
  }

  const declineIncoming = () => {
    if (incomingCall) {
      socket?.emit('call_response', { callId: incomingCall.callId, callerId: incomingCall.callerId, accepted: false })
    }
    setIncomingCall(null)
  }

  const endCallWith = (userId: string) => removePeer(userId, true)

  const endAllCalls = () => {
    Object.keys(peersRef.current).forEach((id) => removePeer(id, true))
    setOutgoing(null)
  }

  // ---- Chat ----
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    // Sending to `user_<officerId>` persists under the canonical dm_ room server-side
    sendMessage(target.kind === 'group' ? 'portal_management' : `user_${target.officer.userId}`, input.trim())
    setInput('')
  }

  const selectDm = (officer: OfficerLite) => {
    setTarget({ kind: 'dm', officer })
    setActiveTab('chat')
  }

  const onlineList = Object.values(onlineOfficers)

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar: Online Officers */}
      <div className={`${card} w-64 flex flex-col p-4`}>
        <h2 className="font-bold text-[var(--portal-fg)] mb-4">Field Officers ({onlineList.length})</h2>
        <div className="flex-grow overflow-y-auto space-y-2">
          {onlineList.length === 0 && (
            <p className="text-xs text-[var(--portal-muted)]">No field officers online right now.</p>
          )}
          {onlineList.map((off) => (
            <div key={off.userId} className={`p-2 border rounded text-sm ${target.kind === 'dm' && target.officer.userId === off.userId ? 'border-blue-500 bg-blue-50' : 'border-[color:var(--portal-border)]'}`}>
              <div className="font-semibold text-[var(--portal-fg)]">{off.username}</div>
              {off.coords ? (
                <div className="text-[10px] text-green-600">
                  Lat: {off.coords.lat.toFixed(4)}<br />
                  Lng: {off.coords.lng.toFixed(4)}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500">Locating...</div>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => selectDm(off)}
                  className="text-blue-500 hover:underline text-xs"
                >
                  DM
                </button>
                <button
                  onClick={() => startCall([off.userId], 'video')}
                  className="text-green-500 hover:underline text-xs"
                >
                  Video
                </button>
                <button
                  onClick={() => startCall([off.userId], 'audio')}
                  className="text-green-700 hover:underline text-xs"
                >
                  Voice
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setTarget({ kind: 'group' }); setActiveTab('chat') }}
          className={`mt-4 w-full rounded py-1 text-sm font-semibold ${target.kind === 'group' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
        >
          Group Chat
        </button>
        <button
          onClick={() => startCall(onlineList.map((o) => o.userId), 'video')}
          className="mt-2 w-full rounded bg-green-600 text-white py-1 text-sm font-semibold"
          disabled={onlineList.length === 0}
        >
          Group Video Call
        </button>
      </div>

      {/* Main Content */}
      <div className={`${card} flex-grow flex flex-col p-4`}>
        {incomingCall && (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white animate-pulse">📞</span>
              <div>
                <p className="font-semibold text-green-900">Incoming {incomingCall.callType} call from {incomingCall.callerUsername}</p>
                <p className="text-xs text-green-700">Field officer is calling HQ</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={answerIncoming} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">Answer</button>
              <button onClick={declineIncoming} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Decline</button>
            </div>
          </div>
        )}

        {outgoing && (
          <div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-blue-900">Calling {outgoing.pending.length} officer(s)… ({outgoing.callType})</p>
              <p className="text-xs text-blue-700">Waiting for answers</p>
            </div>
            <button onClick={endAllCalls} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Cancel</button>
          </div>
        )}

        {notice && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 p-2 text-sm text-blue-900">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="ml-3 font-bold" aria-label="Dismiss">×</button>
          </div>
        )}

        <div className="flex gap-4 mb-4 border-b pb-2 border-[color:var(--portal-border)]">
          <button
            className={`font-semibold ${activeTab === 'chat' ? 'text-blue-600' : 'text-[var(--portal-muted)]'}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat {target.kind === 'group' ? '(All HQ)' : `(@${target.officer.username})`}
          </button>
          <button
            className={`font-semibold ${activeTab === 'video' ? 'text-blue-600' : 'text-[var(--portal-muted)]'}`}
            onClick={() => setActiveTab('video')}
          >
            Video Call {Object.keys(peers).length > 0 && `(${Object.keys(peers).length})`}
          </button>
        </div>

        {activeTab === 'chat' ? (
          <div className="flex-grow flex flex-col min-h-0">
            <div className="flex-grow overflow-y-auto space-y-3 p-2">
              {thread.length === 0 && (
                <p className="text-center text-xs text-[var(--portal-muted)] pt-8">
                  {target.kind === 'group' ? 'No group messages yet.' : `No direct messages with ${target.officer.username} yet.`}
                </p>
              )}
              {thread.map((m) => {
                const isMe = String(m.senderId) === myId
                return (
                  <div key={String(m.id)} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-[var(--portal-muted)] mb-0.5">
                      {isMe ? 'You' : m.senderUsername} · {fmtTime(m.createdAt)}
                    </span>
                    <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${isMe ? 'bg-blue-600 text-white' : 'bg-[var(--portal-input-bg)] text-[var(--portal-fg)] border border-[color:var(--portal-border)]'}`}>
                      {m.content}
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} className="mt-4 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={target.kind === 'group' ? 'Message all HQ staff…' : `Message ${target.officer.username}…`}
                className="flex-grow rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
              />
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold">Send</button>
            </form>
          </div>
        ) : (
          <div className="flex-grow flex flex-col min-h-0">
            {stream ? (
              <div className="flex-grow flex flex-col">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-grow overflow-y-auto p-2">
                  <div className="flex flex-col">
                    <span className="text-xs mb-1 font-semibold text-blue-600">HQ (You)</span>
                    <video ref={myVideoRef} autoPlay muted playsInline className="w-full bg-black rounded" />
                  </div>
                  {Object.entries(peers).map(([userId, p]) => (
                    <div key={userId} className="flex flex-col">
                      <span className="text-xs mb-1 font-semibold text-[var(--portal-fg)]">
                        {onlineOfficers[userId]?.username || (incomingCall?.callerId === userId ? incomingCall.callerUsername : 'Officer')}
                      </span>
                      {p.stream && p.callType === 'video' ? (
                        <video
                          autoPlay playsInline className="w-full bg-black rounded"
                          ref={(el) => { if (el) el.srcObject = p.stream! }}
                        />
                      ) : (
                        <div className="w-full aspect-video bg-gray-800 rounded flex flex-col items-center justify-center text-white">
                          <span className="text-3xl">{(onlineOfficers[userId]?.username || 'O').charAt(0).toUpperCase()}</span>
                          <span className="mt-1 text-[10px] text-green-400">{p.stream ? 'Voice connected' : 'Connecting...'}</span>
                        </div>
                      )}
                      <button
                        onClick={() => endCallWith(userId)}
                        className="mt-2 rounded bg-red-600 py-1 text-xs font-semibold text-white"
                      >
                        Hang up
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={endAllCalls} className="mt-4 w-full rounded bg-red-600 py-3 text-white font-bold">
                  End All Calls
                </button>
              </div>
            ) : (
              <div className="flex-grow flex items-center justify-center text-[var(--portal-muted)] text-center">
                <div>
                  <p className="mb-2">Select an officer from the sidebar to call, or start a group call.</p>
                  <p className="text-xs">Field officers can also call HQ — their incoming calls appear at the top of this page.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
