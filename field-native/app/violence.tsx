import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import { captureOffline } from '@/lib/capture'

export default function ViolenceModal() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function urgent() {
    setBusy(true)
    try {
      await captureOffline('violence', { level: 'URGENT', reportedAt: new Date().toISOString() })
      Alert.alert('Queued', 'Report saved locally and will sync when network is available.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.note}>
        URGENT pathway — also notify chain of command per SOP (voice/radio). This app stores an audit record when online.
      </Text>
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={urgent}>
        <Text style={styles.btnText}>URGENT — Violence / disturbance</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1628', padding: 20, justifyContent: 'center' },
  note: { color: '#8a9ab8', fontSize: 14, lineHeight: 20, marginBottom: 24, textAlign: 'center' },
  btn: { backgroundColor: '#dc2626', paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
})
