import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'

interface VoiceCallProps {
  visible: boolean
  onClose: () => void
  callType: 'command' | 'emergency'
}

export function VoiceCall({ visible, onClose, callType }: VoiceCallProps) {
  const [status, setStatus] = useState<'connecting' | 'ringing' | 'connected' | 'ended' | 'error'>('connecting')
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulate call connection
  useEffect(() => {
    if (!visible) return

    setStatus('connecting')
    setDuration(0)

    // Simulate connecting -> ringing -> connected flow
    const connectingTimer = setTimeout(() => {
      setStatus('ringing')
      const ringingTimer = setTimeout(() => {
        setStatus('connected')
        // Start duration counter
        intervalRef.current = setInterval(() => {
          setDuration(d => d + 1)
        }, 1000)
      }, 2000)
      return () => clearTimeout(ringingTimer)
    }, 1500)

    return () => {
      clearTimeout(connectingTimer)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [visible])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  const endCall = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    setStatus('ended')
    setTimeout(() => {
      onClose()
      setStatus('connecting')
      setDuration(0)
    }, 500)
  }, [onClose])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    switch (status) {
      case 'connecting': return 'Connecting...'
      case 'ringing': return 'Ringing...'
      case 'connected': return 'Connected'
      case 'ended': return 'Call Ended'
      case 'error': return 'Connection Failed'
      default: return ''
    }
  }

  const getDisplayTitle = () => {
    return callType === 'emergency' ? 'Emergency Hotline' : 'Command Center'
  }

  const getDisplaySubtitle = () => {
    return callType === 'emergency' ? 'NPF Emergency Response' : 'SitRep Operations'
  }

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={endCall}
    >
      <View style={styles.container}>
        {/* Header / Caller Info */}
        <View style={styles.callerInfo}>
          <View style={[styles.avatar, callType === 'emergency' && styles.emergencyAvatar]}>
            <Ionicons 
              name={callType === 'emergency' ? 'alert' : 'headset'} 
              size={48} 
              color={callType === 'emergency' ? '#f05b4d' : '#0dccb0'} 
            />
          </View>
          <Text style={styles.callerName}>{getDisplayTitle()}</Text>
          <Text style={styles.callerSubtitle}>{getDisplaySubtitle()}</Text>
          <Text style={[styles.statusText, status === 'connected' && styles.connectedText]}>
            {status === 'connected' ? formatDuration(duration) : getStatusText()}
          </Text>
          
          {status === 'connecting' && (
            <ActivityIndicator color="#0dccb0" style={styles.spinner} />
          )}
        </View>

        {/* Call Controls */}
        <View style={styles.controls}>
          {/* Mute Button */}
          <Pressable 
            style={[styles.controlButton, muted && styles.controlButtonActive]} 
            onPress={() => setMuted(!muted)}
            disabled={status !== 'connected'}
          >
            <Ionicons name={muted ? 'mic-off' : 'mic'} size={28} color={muted ? '#f05b4d' : '#e8edf5'} />
            <Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>

          {/* Speaker Button */}
          <Pressable 
            style={[styles.controlButton, speakerOn && styles.controlButtonActive]} 
            onPress={() => setSpeakerOn(!speakerOn)}
            disabled={status !== 'connected'}
          >
            <Ionicons name={speakerOn ? 'volume-high' : 'volume-off'} size={28} color="#e8edf5" />
            <Text style={styles.controlLabel}>Speaker</Text>
          </Pressable>

          {/* Keypad Button */}
          <Pressable 
            style={styles.controlButton}
            disabled={status !== 'connected'}
          >
            <Ionicons name="keypad" size={28} color={status === 'connected' ? '#e8edf5' : '#6b7a96'} />
            <Text style={[styles.controlLabel, status !== 'connected' && styles.controlLabelDisabled]}>Keypad</Text>
          </Pressable>
        </View>

        {/* End Call Button */}
        <View style={styles.endCallContainer}>
          <Pressable style={styles.endCallButton} onPress={endCall}>
            <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Pressable>
          <Text style={styles.endCallText}>End Call</Text>
        </View>

        {/* Emergency Note */}
        {callType === 'emergency' && (
          <View style={styles.emergencyBanner}>
            <Ionicons name="warning" size={16} color="#f05b4d" />
            <Text style={styles.emergencyText}>Emergency services recording active</Text>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
    justifyContent: 'space-between',
    padding: 24,
  },
  callerInfo: {
    alignItems: 'center',
    marginTop: 60,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(13,204,176,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#0dccb0',
  },
  emergencyAvatar: {
    backgroundColor: 'rgba(240,91,77,0.15)',
    borderColor: '#f05b4d',
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e8edf5',
    marginBottom: 8,
  },
  callerSubtitle: {
    fontSize: 16,
    color: '#8a9ab8',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    color: '#8a9ab8',
    marginTop: 8,
  },
  connectedText: {
    color: '#0dccb0',
    fontSize: 20,
    fontWeight: '600',
  },
  spinner: {
    marginTop: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginTop: 'auto',
    marginBottom: 40,
  },
  controlButton: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    minWidth: 80,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(13,204,176,0.2)',
  },
  controlLabel: {
    color: '#e8edf5',
    fontSize: 12,
    marginTop: 8,
  },
  controlLabelDisabled: {
    color: '#6b7a96',
  },
  endCallContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  endCallButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f05b4d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  endCallText: {
    color: '#8a9ab8',
    fontSize: 14,
  },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,91,77,0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  emergencyText: {
    color: '#f05b4d',
    fontSize: 13,
  },
})
