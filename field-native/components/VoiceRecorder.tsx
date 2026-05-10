import { useState, useCallback } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

interface VoiceRecorderProps {
  onRecordingComplete: (uri: string, duration: number) => void
  maxDuration?: number // in seconds
}

export function VoiceRecorder({ onRecordingComplete, maxDuration = 60 }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [processing, setProcessing] = useState(false)

  // Simulated recording for now - in production would use expo-av
  const startRecording = useCallback(() => {
    setRecording(true)
    setDuration(0)
    
    // Simulate recording duration counter
    const interval = setInterval(() => {
      setDuration((d) => {
        if (d >= maxDuration) {
          clearInterval(interval)
          stopRecording()
          return d
        }
        return d + 1
      })
    }, 1000)
  }, [maxDuration])

  const stopRecording = useCallback(() => {
    setRecording(false)
    setProcessing(true)
    
    // Simulate processing
    setTimeout(() => {
      setProcessing(false)
      // Generate a fake URI for demo
      const fakeUri = `file:///tmp/voice_${Date.now()}.m4a`
      onRecordingComplete(fakeUri, duration)
      setDuration(0)
    }, 500)
  }, [duration, onRecordingComplete])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <View style={styles.container}>
      {processing ? (
        <View style={styles.processing}>
          <ActivityIndicator color="#0dccb0" />
          <Text style={styles.processingText}>Processing...</Text>
        </View>
      ) : recording ? (
        <View style={styles.recording}>
          <View style={styles.waveform}>
            <View style={[styles.bar, { height: 20 }]} />
            <View style={[styles.bar, { height: 30 }]} />
            <View style={[styles.bar, { height: 25 }]} />
            <View style={[styles.bar, { height: 35 }]} />
            <View style={[styles.bar, { height: 28 }]} />
            <View style={[styles.bar, { height: 32 }]} />
            <View style={[styles.bar, { height: 22 }]} />
            <View style={[styles.bar, { height: 30 }]} />
            <View style={[styles.bar, { height: 26 }]} />
            <View style={[styles.bar, { height: 34 }]} />
          </View>
          <Text style={styles.duration}>{formatTime(duration)}</Text>
          <Pressable style={styles.stopButton} onPress={stopRecording}>
            <View style={styles.stopIcon} />
          </Pressable>
          <Text style={styles.hint}>Tap to stop recording</Text>
        </View>
      ) : (
        <Pressable style={styles.recordButton} onPress={startRecording}>
          <View style={styles.micIcon}>
            <Text style={styles.micText}>🎤</Text>
          </View>
          <Text style={styles.recordText}>Hold to Record Voice</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  recordButton: {
    alignItems: 'center',
    padding: 20,
  },
  micIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(13,204,176,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#0dccb0',
  },
  micText: {
    fontSize: 32,
  },
  recordText: {
    color: '#8a9ab8',
    fontSize: 14,
  },
  recording: {
    alignItems: 'center',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
    height: 40,
  },
  bar: {
    width: 4,
    backgroundColor: '#0dccb0',
    borderRadius: 2,
  },
  duration: {
    color: '#e8edf5',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
  },
  stopButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f05b4d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 20,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  hint: {
    color: '#8a9ab8',
    fontSize: 12,
    marginTop: 12,
  },
  processing: {
    alignItems: 'center',
  },
  processingText: {
    color: '#8a9ab8',
    marginTop: 12,
  },
})
