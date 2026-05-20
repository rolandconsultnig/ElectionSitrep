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
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const authToken = getAuthToken()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineOfficers, setOnlineOfficers] = useState<Record<string, any>>({})
  
  // To avoid constant re-renders taking down the stream
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    if (!user || !authToken) {
      if (socket) {
        socket.disconnect()
        setSocket(null)
        setConnected(false)
      }
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

    // Management portal specific events
    newSocket.on('field_officer_online', (data: any) => {
      setOnlineOfficers((prev: any) => ({ ...prev, [data.userId]: { ...prev[data.userId], ...data } }))
    })

    newSocket.on('field_officer_offline', (data: any) => {
      setOnlineOfficers((prev: any) => {
        const next = { ...prev }
        delete next[data.userId]
        return next
      })
    })

    newSocket.on('field_officer_location', (data: any) => {
      setOnlineOfficers((prev: any) => ({
        ...prev,
        [data.userId]: { ...prev[data.userId], ...data }
      }))
    })

    setSocket(newSocket)

    // Start tracking GPS if user is field
    if (user.portalId === 'field' && navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
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
  }, [user?.id, authToken])

  const sendMessage = (roomId: string, content: string) => {
    if (socket && connected) {
      socket.emit('send_chat_message', { roomId, content })
    }
  }

  return (
    <SocketContext.Provider value={{ socket, connected, messages, sendMessage, onlineOfficers }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
