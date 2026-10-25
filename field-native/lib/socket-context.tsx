import { getApiBaseUrl } from './config'
import { isLocalSessionToken } from './local-session'
import * as Location from 'expo-location'
import NetInfo from '@react-native-community/netinfo'
import { io, type Socket } from 'socket.io-client'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'

export type ChatMessage = {
  id: string | number
  senderId: string
  senderUsername: string
  roomId: string
  content: string
  createdAt: string
}

export type IncomingCallInfo = {
  callId: string
  callerId: string
  callerUsername: string
  callType: 'video' | 'audio'
}

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'in-call'

type SocketContextValue = {
  socket: Socket | null
  connected: boolean
  hqOnlineCount: number
  messages: ChatMessage[]
  sendMessage: (roomId: string, content: string) => Promise<boolean>
  incomingCall: IncomingCallInfo | null
  outgoingCall: { callId: string; callType: 'video' | 'audio' } | null
  callState: CallState
  startCall: (type: 'video' | 'audio') => void
  cancelCall: () => void
  answerCall: () => void
  rejectCall: () => void
  endCall: () => void
  sendWebrtcSignal: (targetId: string, signal: unknown) => void
  clearIncomingCall: () => void
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children, token, userId, username }: {
  children: React.ReactNode
  token: string | null
  userId: string | number | null
  username: string | null
}) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [hqOnlineCount, setHqOnlineCount] = useState(-1)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null)
  const [outgoingCall, setOutgoingCall] = useState<{ callId: string; callType: 'video' | 'audio' } | null>(null)
  const [callState, setCallState] = useState<CallState>('idle')
  const callPeerIdRef = useRef<string | null>(null)
  const outgoingRef = useRef<typeof outgoingCall>(null)

  useEffect(() => { outgoingRef.current = outgoingCall }, [outgoingCall])

  const isLocal = isLocalSessionToken(token)

  useEffect(() => {
    if (!token || isLocal || !userId || !username) {
      setSocket(null)
      setConnected(false)
      return
    }
    const base = getApiBaseUrl()
    if (!base) return

    // Strip http(s):// for socket.io, use ws:// or wss://
    const wsUrl = base.replace(/^http/, 'ws').replace(/\/+$/, '')
    const newSocket = io(wsUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: Infinity,
      timeout: 15000,
    })

    newSocket.on('connect', () => setConnected(true))
    newSocket.on('disconnect', () => setConnected(false))
    newSocket.on('hq_presence', (data: { count: number }) => {
      setHqOnlineCount(typeof data?.count === 'number' ? data.count : 0)
    })
    newSocket.on('chat_message', (msg: ChatMessage) => {
      setMessages((prev) => prev.some((m) => String(m.id) === String(msg.id)) ? prev : [...prev, msg])
    })
    newSocket.on('incoming_call', (data: IncomingCallInfo) => {
      if (callPeerIdRef.current || outgoingRef.current) return
      setIncomingCall(data)
      setCallState('incoming')
    })
    newSocket.on('call_response', (data: { callId: string; responderId: string; responderUsername: string; accepted: boolean }) => {
      const outgoing = outgoingRef.current
      if (!outgoing || data.callId !== outgoing.callId) return
      setOutgoingCall(null)
      if (!data.accepted) {
        setCallState('idle')
        return
      }
      callPeerIdRef.current = data.responderId
      setCallState('in-call')
    })
    newSocket.on('call_unavailable', () => {
      setOutgoingCall(null)
      setCallState('idle')
    })
    newSocket.on('call_ended', () => {
      setIncomingCall(null)
      setOutgoingCall(null)
      callPeerIdRef.current = null
      setCallState('idle')
    })
    newSocket.on('call_taken', () => {
      setOutgoingCall(null)
      setCallState('idle')
    })

    setSocket(newSocket)

    // Stream GPS to command center while app is foreground
    let locationSub: Location.LocationSubscription | null = null
    let lastEmit = 0
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        locationSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 20 },
          (loc) => {
            const now = Date.now()
            if (now - lastEmit < 10000) return
            lastEmit = now
            newSocket.emit('gps_update', { lat: loc.coords.latitude, lng: loc.coords.longitude })
          },
        )
      } catch { /* permission denied — silent */ }
    })()

    // Auto-reconnect on network restoration
    const netSub = NetInfo.addEventListener((state) => {
      if (state.isConnected && !newSocket.connected) newSocket.connect()
    })

    // Pause/resume socket on app background to save battery
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (!newSocket.connected) newSocket.connect()
      } else if (state === 'background') {
        // Keep socket alive in background for safety/SOS — only disconnect on inactive
      }
    })

    return () => {
      newSocket.disconnect()
      setSocket(null)
      setConnected(false)
      locationSub?.remove()
      netSub()
      appSub.remove()
    }
  }, [token, isLocal, userId, username])

  const sendMessage = useCallback(async (roomId: string, content: string): Promise<boolean> => {
    if (!socket || !connected) return false
    return new Promise((resolve) => {
      socket.emit('send_chat_message', { roomId, content }, (result: { ok?: boolean }) => {
        resolve(Boolean(result?.ok))
      })
    })
  }, [socket, connected])

  const startCall = useCallback((type: 'video' | 'audio') => {
    if (!socket || !connected) return
    const callId = `${userId}-${Date.now()}`
    setOutgoingCall({ callId, callType: type })
    setCallState('outgoing')
    socket.emit('initiate_call', { callType: type, callId })
  }, [socket, connected, userId])

  const cancelCall = useCallback(() => {
    if (outgoingCall) socket?.emit('cancel_call', { callId: outgoingCall.callId })
    setOutgoingCall(null)
    setCallState('idle')
  }, [outgoingCall, socket])

  const answerCall = useCallback(() => {
    if (!incomingCall || !socket) return
    const call = incomingCall
    callPeerIdRef.current = call.callerId
    setIncomingCall(null)
    setCallState('in-call')
    socket.emit('call_response', { callId: call.callId, callerId: call.callerId, accepted: true })
  }, [incomingCall, socket])

  const rejectCall = useCallback(() => {
    if (incomingCall) socket?.emit('call_response', { callId: incomingCall.callId, callerId: incomingCall.callerId, accepted: false })
    setIncomingCall(null)
    setCallState('idle')
  }, [incomingCall, socket])

  const endCall = useCallback(() => {
    if (callPeerIdRef.current) socket?.emit('end_call', { targetUserId: callPeerIdRef.current })
    callPeerIdRef.current = null
    setIncomingCall(null)
    setOutgoingCall(null)
    setCallState('idle')
  }, [socket])

  const sendWebrtcSignal = useCallback((targetId: string, signal: unknown) => {
    socket?.emit('webrtc_signal', { targetId, signal })
  }, [socket])

  const clearIncomingCall = useCallback(() => setIncomingCall(null), [])

  const value = useMemo<SocketContextValue>(() => ({
    socket,
    connected,
    hqOnlineCount,
    messages,
    sendMessage,
    incomingCall,
    outgoingCall,
    callState,
    startCall,
    cancelCall,
    answerCall,
    rejectCall,
    endCall,
    sendWebrtcSignal,
    clearIncomingCall,
  }), [socket, connected, hqOnlineCount, messages, sendMessage, incomingCall, outgoingCall, callState, startCall, cancelCall, answerCall, rejectCall, endCall, sendWebrtcSignal, clearIncomingCall])

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
