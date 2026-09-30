import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { getAuthToken } from '../lib/api'

interface ChatMessage {
  id: string
  senderId: string
  senderUsername: string
  roomId: string
  content: string
  createdAt: string
}

interface SocketContextValue {
  socket: Socket | null
  connected: boolean
  messages: ChatMessage[]
  sendMessage: (roomId: string, content: string) => void
  onlineOfficers: Record<string, { userId: string; username: string; socketId: string; coords?: { lat: number; lng: number } }>
  /** Number of HQ (management portal) users currently online; -1 = unknown */
  hqOnlineCount: number
  activeSosAlerts: Array<{ officerId: string; officerUsername: string; timestamp: string; coords?: { lat: number; lng: number }; notes: string }>
  flashDirectives: Array<{ id: string; title: string; priority: string; issuedBy: string; issuedAt: string }>
  sendPanicSos: (notes?: string) => void
  sendOfficerCheckin: (status?: string) => void
  emitWallSync: (syncState: any) => void
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const authToken = getAuthToken()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineOfficers, setOnlineOfficers] = useState<Record<string, { userId: string; username: string; socketId: string; coords?: { lat: number; lng: number } }>>({})
  const [hqOnlineCount, setHqOnlineCount] = useState(-1)
  const [activeSosAlerts, setActiveSosAlerts] = useState<Array<{ officerId: string; officerUsername: string; timestamp: string; coords?: { lat: number; lng: number }; notes: string }>>([])
  const [flashDirectives, setFlashDirectives] = useState<Array<{ id: string; title: string; priority: string; issuedBy: string; issuedAt: string }>>([])
  const lastCoords = useRef<{ lat: number; lng: number } | null>(null)
  
  // To avoid constant re-renders taking down the stream
  const watchId = useRef<number | null>(null)

  // When the session ends, reset socket state during render (React-endorsed
  // "adjust state during render" pattern) instead of inside the effect body.
  const sessionKey = user && authToken ? String((user as { id?: string | number }).id ?? authToken.slice(-8)) : null
  const [prevSessionKey, setPrevSessionKey] = useState<string | null>(sessionKey)
  if (prevSessionKey !== sessionKey) {
    setPrevSessionKey(sessionKey)
    if (!sessionKey) {
      setSocket(null)
      setConnected(false)
    }
  }

  useEffect(() => {
    if (!user || !authToken) {
      return
    }

    // Connect to same origin in production, or localhost in dev
    const url = import.meta.env.DEV ? 'http://localhost:5530' : window.location.origin
    
    const newSocket = io(url, {
      auth: { token: authToken },
    })

    newSocket.on('connect', () => setConnected(true))
    newSocket.on('disconnect', () => setConnected(false))

    newSocket.on('chat_message', (msg: ChatMessage) => {
      setMessages((prev: ChatMessage[]) => [...prev, msg])
    })

    // Panic SOS alerts
    newSocket.on('panic_sos_alert', (alertData: any) => {
      setActiveSosAlerts((prev) => [alertData, ...prev])
    })

    // Flash Command Directives
    newSocket.on('flash_directive_received', (dirData: any) => {
      setFlashDirectives((prev) => [dirData, ...prev])
    })

    // Management portal specific events
    newSocket.on('initial_active_officers', (officers: Array<{ userId: string; username: string; socketId: string }>) => {
      setOnlineOfficers((prev) => {
        const next = { ...prev }
        officers.forEach(o => {
          next[o.userId] = { ...o }
        })
        return next
      })
    })

    newSocket.on('field_officer_online', (data: { userId: string; username: string; socketId: string }) => {
      setOnlineOfficers((prev) => ({
        ...prev,
        [data.userId]: { userId: data.userId, username: data.username, socketId: data.socketId }
      }))
    })

    newSocket.on('field_officer_offline', (data: { userId: string }) => {
      setOnlineOfficers((prev) => {
        const next = { ...prev }
        delete next[data.userId]
        return next
      })
    })

    newSocket.on('field_officer_location', (data: { userId: string; coords: { lat: number; lng: number } }) => {
      setOnlineOfficers((prev) => ({
        ...prev,
        [data.userId]: { ...prev[data.userId], ...data }
      }))
    })

    // HQ presence for field officers
    newSocket.on('hq_presence', (data: { count: number }) => {
      setHqOnlineCount(typeof data?.count === 'number' ? data.count : 0)
    })

    // eslint-disable-next-line react-hooks/set-state-in-effect -- storing the newly created socket handle is the standard socket.io + React pattern; the socket is created by this effect and must be shared via context
    setSocket(newSocket)

    // Start tracking GPS if user is field
    if (user.portalId === 'field' && navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          lastCoords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          newSocket.emit('gps_update', {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: pos.timestamp
          })
        },
        console.error,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      )
    }

    return () => {
      newSocket.disconnect()
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current)
      }
    }
  }, [user, authToken])

  const sendMessage = (roomId: string, content: string) => {
    if (socket && connected) {
      socket.emit('send_chat_message', { roomId, content })
    }
  }

  const sendPanicSos = (notes?: string) => {
    if (socket && connected) {
      socket.emit('emit_panic_sos', {
        coords: lastCoords.current,
        notes: notes || 'EMERGENCY SILENT PANIC TRIGGERED BY OFFICER'
      })
    }
  }

  const sendOfficerCheckin = (status = 'OK') => {
    if (socket && connected) {
      socket.emit('emit_officer_checkin', { status })
    }
  }

  const emitWallSync = (syncState: any) => {
    if (socket && connected) {
      socket.emit('emit_wall_sync', syncState)
    }
  }

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      messages,
      sendMessage,
      onlineOfficers,
      hqOnlineCount,
      activeSosAlerts,
      flashDirectives,
      sendPanicSos,
      sendOfficerCheckin,
      emitWallSync
    }}>
      {children}
    </SocketContext.Provider>
  )
}

/* eslint-disable react-refresh/only-export-components */
export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
