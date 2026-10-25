import { tactical as t, mono } from '../../lib/theme'
import { useSocket } from '../../lib/socket-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { MediaStream, RTCPeerConnection } from 'react-native-webrtc'

// Lazy-require react-native-webrtc so a native-module load failure can never
// block app startup (module init throws at import time would freeze the splash).
// The module is first touched when a call UI becomes visible or media is needed.
type WebrtcModule = typeof import('react-native-webrtc')
let webrtcCache: WebrtcModule | null = null
function webrtc(): WebrtcModule {
  if (!webrtcCache) webrtcCache = require('react-native-webrtc')
  return webrtcCache!
}

function RTCView(props: { streamURL: string; style?: object; objectFit?: 'contain' | 'cover'; mirror?: boolean; zOrder?: number }) {
  const V = (webrtc().RTCView as unknown as React.ComponentType<typeof props>)
  return <V {...props} />
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

type CallMode = 'video' | 'audio'

/**
 * Full-screen call overlay rendered above the rest of the app while a call is
 * active (incoming, outgoing, or in-call). Uses react-native-webrtc with
 * addStream (RN API) and addEventListener for events.
 */
export function CallOverlay() {
  const { callState, incomingCall, outgoingCall, endCall, answerCall, rejectCall, cancelCall, sendWebrtcSignal, socket } = useSocket()
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreamURL, setRemoteStreamURL] = useState<string>('')
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const signalQueueRef = useRef<unknown[]>([])

  const callType: CallMode = incomingCall?.callType ?? outgoingCall?.callType ?? 'video'
  const remoteName = incomingCall?.callerUsername ?? 'HQ'
  const peerId = incomingCall?.callerId ?? null

  const visible = callState !== 'idle' || incomingCall !== null

  useEffect(() => {
    if (!socket) return
    const onSignal = (data: { senderId: string; signal: unknown }) => {
      const pc = pcRef.current
      if (!pc) {
        signalQueueRef.current.push(data.signal)
        return
      }
      applySignal(pc, data.signal)
    }
    socket.on('webrtc_signal', onSignal)
    return () => { socket.off('webrtc_signal', onSignal) }
  }, [socket])

  function applySignal(pc: RTCPeerConnection, signal: unknown) {
    try {
      const s = signal as { sdp?: string; type?: string | null; candidate?: unknown }
      if (s.sdp && s.type) {
        void pc.setRemoteDescription(new (webrtc().RTCSessionDescription)({ type: s.type as never, sdp: s.sdp }))
      } else if (s.candidate) {
        void pc.addIceCandidate(new (webrtc().RTCIceCandidate)(s.candidate as RTCIceCandidateInit))
      }
    } catch { /* ignore malformed signals */ }
  }

  function flushQueue(pc: RTCPeerConnection) {
    signalQueueRef.current.forEach((s) => applySignal(pc, s))
    signalQueueRef.current = []
  }

  async function getMedia(type: CallMode): Promise<MediaStream> {
    const constraints = { video: type === 'video', audio: true }
    const stream = await webrtc().mediaDevices.getUserMedia(constraints)
    setLocalStream(stream)
    return stream
  }

  function teardownPeer() {
    pcRef.current?.close()
    pcRef.current = null
    if (localStream) localStream.release(true)
    setLocalStream(null)
    setRemoteStreamURL('')
    setMuted(false)
    setVideoOff(false)
    signalQueueRef.current = []
  }

  useEffect(() => {
    if (callState !== 'in-call') return
    let cancelled = false

    async function setupPeer() {
      try {
        const stream = await getMedia(callType)
        if (cancelled) { stream.release(true); return }
        const pc = new (webrtc().RTCPeerConnection)({ iceServers: ICE_SERVERS })
        pcRef.current = pc

        // react-native-webrtc uses addStream (not addTrack)
        pc.addStream(stream)

        // Events via addEventListener (event-target-shim). Types are loose; cast to any.
        const pcAny = pc as unknown as {
          addEventListener: (type: string, listener: (event: unknown) => void) => void
        }
        pcAny.addEventListener('addstream', (event: unknown) => {
          const e = event as { stream: MediaStream }
          if (e.stream) setRemoteStreamURL(e.stream.toURL())
        })
        pcAny.addEventListener('icecandidate', (event: unknown) => {
          const e = event as { candidate: RTCIceCandidate | null }
          if (e.candidate && peerId) {
            sendWebrtcSignal(peerId, { candidate: e.candidate })
          }
        })

        // Per server convention: the side that ACCEPTS the call creates the offer.
        if (incomingCall) {
          const offer = await pc.createOffer({}) as unknown as { sdp: string; type: string }
          if (cancelled) return
          await pc.setLocalDescription(new (webrtc().RTCSessionDescription)({ type: offer.type as never, sdp: offer.sdp }))
          if (peerId) sendWebrtcSignal(peerId, { sdp: offer.sdp, type: offer.type })
        }
        // For outgoing calls, we wait for HQ's offer to arrive via webrtc_signal

        flushQueue(pc)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not access camera/microphone')
      }
    }
    void setupPeer()
    return () => {
      cancelled = true
      teardownPeer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState])

  useEffect(() => {
    if (callState === 'idle') teardownPeer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState])

  function toggleMute() {
    const s = localStream
    if (!s) return
    const audio = s.getAudioTracks()[0]
    if (audio) {
      audio.enabled = muted
      setMuted(!muted)
    }
  }

  function toggleVideo() {
    if (callType !== 'video') return
    const s = localStream
    if (!s) return
    const video = s.getVideoTracks()[0]
    if (video) {
      video.enabled = videoOff
      setVideoOff(!videoOff)
    }
  }

  function onAnswer() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
    answerCall()
  }

  function onEnd() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
    endCall()
  }

  if (!visible) return null

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onEnd} statusBarTranslucent>
      <View style={styles.root}>
        <SafeAreaView style={styles.container}>
          {callType === 'video' && remoteStreamURL ? (
            <RTCView streamURL={remoteStreamURL} style={styles.remoteVideo} objectFit="cover" />
          ) : (
            <View style={styles.remoteAvatar}>
              <Text style={styles.avatarLetter}>{(remoteName || 'H').charAt(0).toUpperCase()}</Text>
              <Text style={styles.avatarName}>{remoteName || 'HQ'}</Text>
              <View style={styles.liveDot}>
                <View style={styles.liveDotInner} />
              </View>
            </View>
          )}

          {callType === 'video' && localStream ? (
            <View style={styles.pip}>
              <RTCView streamURL={localStream.toURL()} style={styles.pipVideo} objectFit="cover" mirror />
              {videoOff ? <View style={styles.pipOff}><Ionicons name="videocam-off" size={18} color="#fff" /></View> : null}
            </View>
          ) : null}

          <View style={styles.topBar}>
            <Text style={styles.callType}>
              {callType === 'video' ? 'VIDEO CALL' : 'VOICE CALL'} · {callState === 'outgoing' ? 'Calling…' : callState === 'incoming' ? 'Incoming' : 'Connected'}
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.controls}>
            {callState === 'incoming' ? (
              <>
                <CallButton icon="call" label="Answer" tone="success" onPress={onAnswer} />
                <CallButton icon="close" label="Decline" tone="danger" onPress={rejectCall} />
              </>
            ) : callState === 'outgoing' ? (
              <CallButton icon="close" label="Cancel" tone="danger" onPress={cancelCall} />
            ) : (
              <>
                <CallButton icon={muted ? 'mic-off' : 'mic'} label={muted ? 'Unmute' : 'Mute'} tone="neutral" onPress={toggleMute} />
                {callType === 'video' ? (
                  <CallButton icon={videoOff ? 'videocam-off' : 'videocam'} label={videoOff ? 'Camera on' : 'Camera off'} tone="neutral" onPress={toggleVideo} />
                ) : null}
                <CallButton icon="call" label="End" tone="danger" onPress={onEnd} />
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

function CallButton({ icon, label, tone, onPress }: { icon: string; label: string; tone: 'success' | 'danger' | 'neutral'; onPress: () => void }) {
  const bg = tone === 'success' ? t.success : tone === 'danger' ? t.danger : '#1A2A40'
  return (
    <Pressable onPress={onPress} style={styles.callBtn}>
      <View style={[styles.callBtnIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as never} size={24} color="#fff" />
      </View>
      <Text style={styles.callBtnLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#04080F' },
  container: { flex: 1, position: 'relative' },
  remoteVideo: { flex: 1, backgroundColor: '#000' },
  remoteAvatar: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A1424' },
  avatarLetter: { fontSize: 96, fontWeight: '900', color: t.cyan, letterSpacing: -2 },
  avatarName: { fontSize: 22, fontWeight: '700', color: t.text, marginTop: 12 },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.success },
  pip: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: t.borderStrong,
    backgroundColor: '#000',
    zIndex: 10,
  },
  pipVideo: { flex: 1 },
  pipOff: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  topBar: { position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' },
  callType: { fontFamily: mono, fontSize: 11, fontWeight: '700', color: t.cyan, letterSpacing: 1.5, textTransform: 'uppercase', backgroundColor: 'rgba(10,20,36,0.7)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  error: { position: 'absolute', top: 100, left: 20, right: 20, textAlign: 'center', color: t.danger, fontSize: 13, backgroundColor: 'rgba(244,63,94,0.15)', padding: 10, borderRadius: 10 },
  controls: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 28, paddingBottom: 20 },
  callBtn: { alignItems: 'center', gap: 8 },
  callBtnIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  callBtnLabel: { fontSize: 12, fontWeight: '600', color: t.text },
})
