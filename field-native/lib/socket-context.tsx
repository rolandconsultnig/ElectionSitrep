import { getApiBaseUrl } from './config'
import { isLocalSessionToken } from './local-session'
import { fieldContextRequest } from './api'
import { GeofenceMonitor, GEOFENCE_RADIUS_M, type GeofenceTarget } from './geofence'
import { startGeofenceAlarm, stopGeofenceAlarm } from './geofence-alert'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
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

export type GeofenceStatus = {
  puName: string
  puCode?: string | null
  breached: boolean
  distanceM: number | null
  breachedAt?: string
}

const GEOFENCE_PU_CACHE_KEY = 'geofence:assigned_pu'

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
  geofence: GeofenceStatus | null
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
  const [geofence, setGeofence] = useState<GeofenceStatus | null>(null)
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

    // Resolve the officer's assigned polling unit for geofencing.
    // Cached to AsyncStorage so the geofence still works fully offline.
    let geofenceMonitor: GeofenceMonitor | null = null
    let lastEmittedDistance = 0
    const geofenceEventQueue: Array<Record<string, unknown>> = []
    const flushGeofenceQueue = () => {
      while (newSocket.connected && geofenceEventQueue.length) {
        const ev = geofenceEventQueue.shift()!
        newSocket.emit(ev.event as string, ev.payload)
      }
    }
    const emitGeofence = (event: string, payload: Record<string, unknown>) => {
      if (newSocket.connected) newSocket.emit(event, payload)
      else geofenceEventQueue.push({ event, payload })
    }
    newSocket.on('connect', flushGeofenceQueue)

    ;(async () => {
      let pu: GeofenceTarget | null = null
      try {
        const ctx = await fieldContextRequest(token)
        const a = ctx?.assignment?.pollingUnit
        if (a && typeof a.lat === 'number' && typeof a.lng === 'number') {
          pu = { id: String(a.id), name: a.name, code: a.code, lat: a.lat, lng: a.lng }
          await AsyncStorage.setItem(GEOFENCE_PU_CACHE_KEY, JSON.stringify(pu)).catch(() => {})
        }
      } catch {
        // Offline at boot — fall back to the last cached assignment
        try {
          const cached = await AsyncStorage.getItem(GEOFENCE_PU_CACHE_KEY)
          if (cached) {
            const p = JSON.parse(cached) as GeofenceTarget
            if (typeof p?.lat === 'number' && typeof p?.lng === 'number') pu = p
          }
        } catch { /* no cache */ }
      }
      if (!pu) return // officer has no geocoded assignment — nothing to fence
      const target = pu
      setGeofence({ puName: target.name, puCode: target.code ?? null, breached: false, distanceM: null })

      geofenceMonitor = new GeofenceMonitor(target, GEOFENCE_RADIUS_M, (event, distanceM) => {
        const now = new Date().toISOString()
        if (event === 'breach') {
          setGeofence({ puName: target.name, puCode: target.code ?? null, breached: true, distanceM, breachedAt: now })
          void startGeofenceAlarm(target.name, distanceM)
          emitGeofence('geofence_breach', {
            pollingUnitId: target.id,
            pollingUnitName: target.name,
            pollingUnitCode: target.code ?? null,
            pollingUnitCoords: { lat: target.lat, lng: target.lng },
            distanceM: Math.round(distanceM),
            radiusM: GEOFENCE_RADIUS_M,
            timestamp: now,
          })
        } else {
          setGeofence({ puName: target.name, puCode: target.code ?? null, breached: false, distanceM })
          void stopGeofenceAlarm()
          emitGeofence('geofence_return', {
            pollingUnitId: target.id,
            pollingUnitName: target.name,
            distanceM: Math.round(distanceM),
            timestamp: now,
          })
        }
      })
    })()

    // Stream GPS to command center while app is foreground
    let locationSub: Location.LocationSubscription | null = null
    let lastEmit = 0
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        locationSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 10 },
          (loc) => {
            const { latitude, longitude, accuracy } = loc.coords
            const res = geofenceMonitor?.ingestFix(latitude, longitude, accuracy ?? null)
            if (res && geofenceMonitor && !res.breached) {
              // keep distanceM fresh in context while inside the fence
              if (Math.abs(res.distanceM - lastEmittedDistance) > 25) {
                lastEmittedDistance = res.distanceM
                setGeofence((g) => (g ? { ...g, distanceM: res.distanceM } : g))
              }
            }
            const now = Date.now()
            if (now - lastEmit < 10000) return
            lastEmit = now
            newSocket.emit('gps_update', {
              lat: latitude,
              lng: longitude,
              accuracy: accuracy ?? undefined,
            })
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
      geofenceMonitor = null
      setGeofence(null)
      void stopGeofenceAlarm()
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
    geofence,
  }), [socket, connected, hqOnlineCount, messages, sendMessage, incomingCall, outgoingCall, callState, startCall, cancelCall, answerCall, rejectCall, endCall, sendWebrtcSignal, clearIncomingCall, geofence])

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
