import React, { useState, useEffect, useRef } from 'react'
import Peer from 'simple-peer'
import type { Instance } from 'simple-peer'
import { useSocket } from '../../contexts/SocketContext'
import { useAuth } from '../../contexts/AuthContext'
import { FieldOfflineBanner } from './FieldPortalPages'

const card = "rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] p-4 shadow-sm"

export function FieldCommunications() {
  const { socket, connected, messages, sendMessage } = useSocket()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [incomingCall, setIncomingCall] = useState<{ senderUsername: string; signal: any } | null>(null)
  const [inCall, setInCall] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  
  const myVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<Instance | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!socket) return

    socket.on('webrtc_signal', (data: any) => {
      if (!inCall && !peerRef.current && data.signal.type === 'offer') {
        setIncomingCall({ senderUsername: data.senderUsername, signal: data.signal })
      } else if (peerRef.current) {
        peerRef.current.signal(data.signal)
      }
    })

    return () => {
      socket.off('webrtc_signal')
    }
  }, [socket, inCall])

  const answerCall = async () => {
    if (!incomingCall) return
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setStream(mediaStream)
      if (myVideoRef.current) myVideoRef.current.srcObject = mediaStream

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: mediaStream,
      })

      peer.on('signal', (signal) => {
        socket?.emit('webrtc_signal', { targetId: 'management', signal }) // We assume it came from management
      })

      peer.on('stream', (remoteStream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      })

      peer.on('close', endCall)

      peer.signal(incomingCall.signal)
      peerRef.current = peer
      setInCall(true)
      setIncomingCall(null)
    } catch (e) {
      alert('Could not access camera/mic.')
      setIncomingCall(null)
    }
  }

  const rejectCall = () => {
    setIncomingCall(null)
  }

  const endCall = () => {
    peerRef.current?.destroy()
    peerRef.current = null
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setInCall(false)
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    // Send to portal_management room
    sendMessage('portal_management', input.trim())
    setInput('')
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      <FieldOfflineBanner />
      <header>
        <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">HQ Communications</h1>
        <p className="mt-1 text-sm text-[var(--portal-muted)]">Live chat and video coordination with Situation Room</p>
      </header>
      
      {!connected && (
        <div className="rounded bg-yellow-100 p-2 text-sm text-yellow-800">
          Reconnecting to HQ...
        </div>
      )}

      {incomingCall && (
        <div className="rounded bg-blue-100 p-4 border border-blue-200">
          <p className="font-semibold text-blue-900">Incoming video call from {incomingCall.senderUsername}</p>
          <div className="mt-3 flex gap-3">
            <button onClick={answerCall} className="rounded bg-green-600 px-4 py-2 text-white font-semibold">Answer</button>
            <button onClick={rejectCall} className="rounded bg-red-600 px-4 py-2 text-white font-semibold">Decline</button>
          </div>
        </div>
      )}

      {inCall && (
        <div className={card}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-[var(--portal-muted)] mb-1">HQ Video</p>
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-48 bg-black rounded" />
            </div>
            <div>
              <p className="text-xs text-[var(--portal-muted)] mb-1">Your Video</p>
              <video ref={myVideoRef} autoPlay muted playsInline className="w-full h-48 bg-black rounded" />
            </div>
          </div>
          <button onClick={endCall} className="mt-4 w-full rounded bg-red-600 py-2 text-white font-semibold">End Call</button>
        </div>
      )}

      <div className={`${card} flex-grow flex flex-col min-h-[400px]`}>
        <div className="flex-grow overflow-y-auto p-2 space-y-3">
          {messages.map((m: any) => {
            const isMe = m.senderId === user?.id
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-[var(--portal-muted)] mb-0.5">{m.senderUsername}</span>
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
            onChange={e => setInput(e.target.value)}
            placeholder="Message HQ..."
            className="flex-grow rounded-lg border border-[color:var(--portal-border)] bg-[var(--portal-input-bg)] px-3 py-2 text-[var(--portal-fg)]"
          />
          <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold">Send</button>
        </form>
      </div>
    </div>
  )
}
