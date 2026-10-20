import {
  ApiError,
  duressPinStatusRequest,
  mySosRequest,
  raiseSosRequest,
  safetyCheckinRequest,
  safetyStatusRequest,
  setDuressPinRequest,
  sosLocationRequest,
} from '../lib/api'
import { getCurrentPosition } from '../lib/location'
import { colors, radii, space } from '../lib/theme'
import { Card, FieldInput, FieldLabel, fmtTime, LocalSessionBlocked, PrimaryButton, SectionLabel, StatusNote, useFieldSession } from '../components/field-ui'
import NetInfo from '@react-native-community/netinfo'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function SafetyScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)
  const [pin, setPin] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const sosPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const statusQ = useQuery({
    queryKey: ['safety-status', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => safetyStatusRequest(token!),
    refetchInterval: 60_000,
  })

  const sosQ = useQuery({
    queryKey: ['sos-mine', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => mySosRequest(token!),
    refetchInterval: 30_000,
  })

  const pinQ = useQuery({
    queryKey: ['duress-pin', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => duressPinStatusRequest(token!),
  })

  const activeSosId = sosQ.data?.activeId ?? null

  // While an SOS is active, stream location updates to command every 30 seconds.
  useEffect(() => {
    if (!token || !activeSosId) {
      if (sosPollRef.current) clearInterval(sosPollRef.current)
      sosPollRef.current = null
      return
    }
    const send = async () => {
      const pos = await getCurrentPosition()
      if (!pos) return
      try {
        const res = await sosLocationRequest(token, activeSosId, {
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
        })
        if (!res.active) qc.invalidateQueries({ queryKey: ['sos-mine', token] })
      } catch {
        // transient — next tick retries
      }
    }
    void send()
    sosPollRef.current = setInterval(() => void send(), 30_000)
    return () => {
      if (sosPollRef.current) clearInterval(sosPollRef.current)
      sosPollRef.current = null
    }
  }, [token, activeSosId, qc])

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="Safety & SOS" />
      </SafeAreaView>
    )
  }

  async function onCheckIn() {
    if (!token || busy) return
    setBusy(true)
    setNote(null)
    try {
      const [pos, net] = await Promise.all([getCurrentPosition(), NetInfo.fetch()])
      await safetyCheckinRequest(token, {
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        network: net.type ?? null,
      })
      setNote({ text: 'Check-in recorded — Command can see you are OK.', tone: 'success' })
      await statusQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Check-in failed — retry when you have signal.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function onPanic() {
    Alert.alert(
      'Send SOS?',
      'This immediately alerts Command and all senior officers with your live location. Use only in a real emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'SEND SOS',
          style: 'destructive',
          onPress: () => void sendPanic(),
        },
      ],
    )
  }

  async function sendPanic() {
    if (!token) return
    setBusy(true)
    setNote(null)
    try {
      const pos = await getCurrentPosition()
      await raiseSosRequest(token, {
        kind: 'panic',
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        accuracy: pos?.accuracy ?? null,
      })
      setNote({
        text: 'SOS ACTIVE — Command and senior officers have been alerted. Your location is being shared every 30 seconds. Only Command can stand this down.',
        tone: 'error',
      })
      await sosQ.refetch()
    } catch (e) {
      setNote({
        text: `${e instanceof ApiError ? e.message : 'SOS failed'} — if you have no signal, use voice radio / phone escalation per SOP.`,
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  async function onSetPin() {
    if (!token || pinBusy) return
    setPinBusy(true)
    try {
      await setDuressPinRequest(token, pin.trim())
      setNote({ text: pin.trim() ? 'Duress PIN saved.' : 'Duress PIN removed.', tone: 'success' })
      setPin('')
      await pinQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Could not save duress PIN.', tone: 'error' })
    } finally {
      setPinBusy(false)
    }
  }

  const status = statusQ.data

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {activeSosId ? (
          <View style={styles.sosBanner}>
            <Text style={styles.sosBannerTitle}>🆘 SOS ACTIVE</Text>
            <Text style={styles.sosBannerText}>
              Command has been alerted and is tracking your live location. Stay on the line — only Command can stand
              this down.
            </Text>
          </View>
        ) : null}

        <Card>
          <SectionLabel>Check-in</SectionLabel>
          <Text style={styles.muted}>
            Scheduled check-in every {status?.intervalMinutes ?? '…'} minutes. Missed check-ins flag you on the Command
            safety board.
          </Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusItem}>Last OK: {fmtTime(status?.lastOkAt)}</Text>
            <Text style={styles.statusItem}>Next due: {fmtTime(status?.nextDueAt)}</Text>
          </View>
          {status?.missed ? (
            <Text style={styles.missed}>⚠ Your last check-in was missed — check in now to clear the flag.</Text>
          ) : null}
          <PrimaryButton label="✓ Check in — I am OK" tone="success" onPress={onCheckIn} busy={busy} />
        </Card>

        <Card>
          <SectionLabel>Emergency SOS</SectionLabel>
          <Text style={styles.muted}>
            One tap alerts Force HQ, your CP and all commands with your live GPS. Location updates continue until
            Command resolves the alert.
          </Text>
          <PrimaryButton label="🆘 SOS — PANIC" tone="danger" onPress={onPanic} busy={busy} disabled={Boolean(activeSosId)} />
        </Card>

        <Card>
          <SectionLabel>Duress PIN</SectionLabel>
          <Text style={styles.muted}>
            {pinQ.data?.enabled ? 'Status: enabled. ' : 'Status: not set. '}
            If you are ever forced to unlock the app, sign in with this PIN instead of your password — it opens normally
            but silently raises a duress alert at Command.
          </Text>
          <FieldLabel>New PIN (min 6 characters, different from your password)</FieldLabel>
          <FieldInput value={pin} onChangeText={setPin} placeholder="Enter duress PIN" secureTextEntry />
          <PrimaryButton label={pin.trim() ? 'Save duress PIN' : 'Remove duress PIN'} onPress={onSetPin} busy={pinBusy} />
        </Card>

        {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  statusRow: { marginTop: space.md, gap: space.xs },
  statusItem: { fontSize: 14, color: colors.text, fontWeight: '600' },
  missed: { marginTop: space.sm, color: colors.warn, fontWeight: '600', fontSize: 14 },
  sosBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radii.lg,
    padding: space.lg,
    marginBottom: space.md,
  },
  sosBannerTitle: { color: colors.danger, fontWeight: '800', fontSize: 18 },
  sosBannerText: { color: colors.danger, marginTop: space.xs, lineHeight: 20 },
})
