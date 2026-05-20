import React, { useState, useEffect, useRef } from 'react'
import Peer from 'simple-peer'
import type { Instance } from 'simple-peer'
import { useSocket } from '../../contexts/SocketContext'
import { useAuth } from '../../contexts/AuthContext'

const card = "rounded-xl border border-[color:var(--portal-border)] bg-[var(--portal-card-bg)] shadow-sm"

export function ManagementCommunications() {
  const { socket, messages, sendMessage, onlineOfficers } = useSocket()
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'video'>('chat')
  const [targetId, setTargetId] = useState<string>('portal_management') // default global room
  
  const [stream, setStream] = useState<MediaStream | null>(null)
  const myVideoRef = useRef<HTMLVideoElement>(null)
  
  // Map of userId -> { peer: Instance, stream: MediaStream }
  const [peers, setPeers] = useState<Record<string, { peer: Instance, stream?: MediaStream }>>({})
  const peersRef = useRef<Record<string, { peer: Instance, stream?: MediaStream }>>({})
  
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!socket) return

    const handleSignal = (data: any) => {
      const { senderId, signal } = data
      const existing = peersRef.current[senderId]
      
      if (existing && existing.peer) {
        existing.peer.signal(signal)
      } else if (signal.type === 'answer') {
        // We sent an offer, they answered
        console.log('Received answer without existing peer, ignoring.')
      } else {
        console.log('Unhandled signal:', signal)
      }
    }

    socket.on('webrtc_signal', handleSignal)

    return () => {
      socket.off('webrtc_signal', handleSignal)
    }
  }, [socket])

  const startCall = async (userIds: string[]) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      setStream(mediaStream)
      if (myVideoRef.current) myVideoRef.current.srcObject = mediaStream

      const newPeers = { ...peersRef.current }

      userIds.forEach(id => {
        const peer = new Peer({
          initiator: true,
          trickle: false,
          stream: mediaStream
        })

        peer.on('signal', (signal) => {
          socket?.emit('webrtc_signal', { targetId: id, signal })
        })

        peer.on('stream', (remoteStream) => {
          setPeers(prev => ({
            ...prev,
            [id]: { ...prev[id], stream: remoteStream }
          }))
        })

        peer.on('close', () => {
          setPeers(prev => {
            const next = { ...prev }
            delete next[id]
            return next
          })
          delete peersRef.current[id]
        })

        newPeers[id] = { peer }
      })

      peersRef.current = newPeers
      setPeers(newPeers)
      setActiveTab('video')
      
    } catch (e) {
      alert('Could not access camera/mic.')
    }
  }

  const endAllCalls = () => {
    Object.values(peersRef.current).forEach(p => p.peer.destroy())
    peersRef.current = {}
    setPeers({})
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    // targetId is either 'portal_management' (broadcast) or `user_ID` (direct message)
    sendMessage(targetId, input.trim())
    setInput('')
  }

  const onlineList = Object.values(onlineOfficers)

  return (
    <div className="flex h-full gap-4">
      {/* Sidebar: Online Officers */}
      <div className={`${card} w-64 flex flex-col p-4`}>
        <h2 className="font-bold text-[var(--portal-fg)] mb-4">Field Officers ({onlineList.length})</h2>
        <div className="flex-grow overflow-y-auto space-y-2">
          {onlineList.map((off: any) => (
            <div key={off.userId} className="p-2 border rounded border-[color:var(--portal-border)] text-sm">
              <div className="font-semibold text-[var(--portal-fg)]">{off.username}</div>
              {off.coords ? (
                <div className="text-[10px] text-green-600">
                  Lat: {off.coords.lat.toFixed(4)}<br/>
                  Lng: {off.coords.lng.toFixed(4)}
                </div>
              ) : (
                <div className="text-[10px] text-gray-500">Locating...</div>
              )}
              <div className="mt-2 flex gap-2">
                <button 
                  onClick={() => { setTargetId(`user_${off.userId}`); setActiveTab('chat') }}
                  className="text-blue-500 hover:underline text-xs"
                >
                  DM
                </button>
                <button 
                  onClick={() => startCall([off.userId])}
                  className="text-green-500 hover:underline text-xs"
                >
                  Call
                </button>
              </div>
            </div>
          ))}
        </div>
        <button 
          onClick={() => { setTargetId('portal_management'); setActiveTab('chat') }}
          className="mt-4 w-full rounded bg-gray-200 text-gray-800 py-1 text-sm font-semibold"
        >
          Group Chat
        </button>
        <button 
          onClick={() => startCall(onlineList.map((o: any) => o.userId))}
          className="mt-2 w-full rounded bg-green-600 text-white py-1 text-sm font-semibold"
          disabled={onlineList.length === 0}
        >
          Group Video Call
        </button>
      </div>

      {/* Main Content */}
      <div className={`${card} flex-grow flex flex-col p-4`}>
        <div className="flex gap-4 mb-4 border-b pb-2 border-[color:var(--portal-border)]">
          <button 
            className={`font-semibold ${activeTab === 'chat' ? 'text-blue-600' : 'text-[var(--portal-muted)]'}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat {targetId === 'portal_management' ? '(All)' : '(Direct)'}
          </button>
          <button 
            className={`font-semibold ${activeTab === 'video' ? 'text-blue-600' : 'text-[var(--portal-muted)]'}`}
            onClick={() => setActiveTab('video')}
          >
            Video Call
          </button>
        </div>

        {activeTab === 'chat' ? (
          <div className="flex-grow flex flex-col min-h-0">
            <div className="flex-grow overflow-y-auto space-y-3 p-2">
              {messages.filter((m: any) => targetId === 'portal_management' ? m.roomId === 'portal_management' : (m.roomId === targetId || m.roomId === `user_${user?.id}`)).map((m: any) => {
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
                placeholder="Type a message..."
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
                      <span className="text-xs mb-1 font-semibold text-[var(--portal-fg)]">{onlineOfficers[userId]?.username || 'Officer'}</span>
                      {p.stream ? (
                        <video 
                          autoPlay playsInline className="w-full bg-black rounded"
                          ref={el => { if (el) el.srcObject = p.stream! }}
                        />
                      ) : (
                        <div className="w-full aspect-video bg-gray-800 rounded flex items-center justify-center text-white text-xs">Connecting...</div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={endAllCalls} className="mt-4 w-full rounded bg-red-600 py-3 text-white font-bold">
                  End All Calls
                </button>
              </div>
            ) : (
              <div className="flex-grow flex items-center justify-center text-[var(--portal-muted)]">
                Select an officer from the sidebar to call, or start a group call.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
