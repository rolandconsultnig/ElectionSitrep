import { Vibration } from 'react-native'

type AudioModule = typeof import('expo-av')
type SpeechModule = typeof import('expo-speech')
type HapticsModule = typeof import('expo-haptics')

let sound: import('expo-av').Audio.Sound | null = null
let hapticsTimer: ReturnType<typeof setInterval> | null = null
let active = false

async function loadSound() {
  try {
    const { Audio }: AudioModule = await import('expo-av')
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
    })
    if (sound) return sound
    const { sound: s } = await Audio.Sound.createAsync(
      require('../assets/sounds/geofence-alert.wav'),
      { isLooping: true, volume: 1.0 },
    )
    sound = s
    return s
  } catch {
    return null
  }
}

async function speak(message: string) {
  try {
    const Speech: SpeechModule = await import('expo-speech')
    Speech.stop()
    Speech.speak(message, { rate: 0.95, pitch: 1.0 })
  } catch { /* speech unavailable */ }
}

async function buzz() {
  try {
    const Haptics: HapticsModule = await import('expo-haptics')
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  } catch {
    Vibration.vibrate([0, 400, 200, 400])
  }
}

/** Start the out-of-post alarm: looping beep + voice warning + periodic haptics. */
export async function startGeofenceAlarm(puName: string, distanceM: number) {
  if (active) return
  active = true
  const s = await loadSound()
  if (s) {
    try { await s.playAsync() } catch { /* ignore */ }
  }
  const rounded = Math.round(distanceM)
  void speak(
    `Attention officer. You have moved ${rounded} metres away from your assigned polling unit, ${puName}. Please return to your post immediately.`,
  )
  void buzz()
  hapticsTimer = setInterval(() => { void buzz() }, 30000)
}

/** Stop the alarm when the officer returns inside the geofence. */
export async function stopGeofenceAlarm() {
  if (!active) return
  active = false
  if (hapticsTimer) { clearInterval(hapticsTimer); hapticsTimer = null }
  try {
    const Speech: SpeechModule = await import('expo-speech')
    Speech.stop()
  } catch { /* ignore */ }
  if (sound) {
    try { await sound.stopAsync() } catch { /* ignore */ }
    try { await sound.unloadAsync() } catch { /* ignore */ }
    sound = null
  }
}
