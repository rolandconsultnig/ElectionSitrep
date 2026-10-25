import { fieldContextRequest } from '../lib/api'
import { submitOrQueue } from '../lib/field-actions'
import { getCurrentPosition } from '../lib/location'
import { colors, radii, space } from '../lib/theme'
import { StatusNote, useFieldSession } from '../components/field-ui'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ViolenceScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    staleTime: 5 * 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />

  function onUrgent() {
    Alert.alert(
      'URGENT violence report?',
      'This alerts the CP, DIG and IGP duty desk immediately. A fatality triggers mandatory Force HQ escalation. Confirm voice escalation per SOP as well.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'SEND URGENT', style: 'destructive', onPress: () => void send() },
      ],
    )
  }

  async function send() {
    if (!token || busy) return
    setBusy(true)
    setNote(null)
    try {
      const assignment = ctxQ.data?.assignment
      const pos = await getCurrentPosition()
      const outcome = await submitOrQueue(token, 'violence', {
        level: 'URGENT',
        puCode: assignment?.pollingUnit.code ?? null,
        puId: assignment?.pollingUnit.id ?? null,
        jurisdiction: assignment ? `${assignment.ward.name}, ${assignment.state.code}` : null,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      })
      setNote({
        text:
          outcome === 'delivered'
            ? 'URGENT violence report delivered — CP / HQ dashboards alerted. Confirm voice escalation per SOP.'
            : 'Violence report queued locally (no network) — confirm voice escalation per SOP; it will sync automatically when online.',
        tone: outcome === 'delivered' ? 'success' : 'info',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.title}>Violence & disturbance log</Text>
          <Text style={styles.muted}>
            Fatality triggers mandatory Force HQ escalation · URGENT alert to CP, DIG, IGP duty desk (§M15). One tap —
            your assignment and GPS are attached automatically.
          </Text>
          <Pressable onPress={onUrgent} disabled={busy} style={[styles.urgentBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.urgentBtnText}>URGENT — Violence report</Text>}
          </Pressable>
        </View>
        {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
    borderWidth: 2,
    borderColor: colors.danger,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.danger },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20, marginTop: space.sm },
  urgentBtn: {
    marginTop: space.lg,
    backgroundColor: '#ef4444',
    borderRadius: radii.md,
    paddingVertical: 18,
    alignItems: 'center',
  },
  urgentBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
})
