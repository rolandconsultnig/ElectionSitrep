import {
  acknowledgeShiftRequest,
  ApiError,
  fieldContextRequest,
  handoverShiftRequest,
  shiftsRequest,
} from '../lib/api'
import { colors, radii, space } from '../lib/theme'
import {
  Card,
  ChipGroup,
  FieldInput,
  FieldLabel,
  fmtTime,
  LocalSessionBlocked,
  PrimaryButton,
  SectionLabel,
  StatusNote,
  useFieldSession,
} from '../components/field-ui'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const SHIFTS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'night', label: 'Night' },
  { value: 'collation', label: 'Collation' },
] as const

type ShiftName = (typeof SHIFTS)[number]['value']

const CROWD = [
  { value: 'calm', label: 'Calm', tone: 'success' as const },
  { value: 'tense', label: 'Tense', tone: 'warn' as const },
  { value: 'rowdy', label: 'Rowdy', tone: 'warn' as const },
  { value: 'volatile', label: 'Volatile', tone: 'danger' as const },
  { value: 'dispersed', label: 'Dispersed' },
] as const

type CrowdAssessment = (typeof CROWD)[number]['value']

export default function ShiftsScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [shiftName, setShiftName] = useState<ShiftName>('morning')
  const [incomingName, setIncomingName] = useState('')
  const [situationLog, setSituationLog] = useState('')
  const [materialsStatus, setMaterialsStatus] = useState('All sensitive materials accounted for')
  const [crowd, setCrowd] = useState<CrowdAssessment>('calm')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [ackBusy, setAckBusy] = useState<number | null>(null)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    staleTime: 5 * 60_000,
  })

  const puId = ctxQ.data?.assignment?.pollingUnit.id ?? null
  const electionSlug = ctxQ.data?.activeElections?.[0]?.slug ?? undefined

  const shiftsQ = useQuery({
    queryKey: ['shifts', token, puId],
    enabled: Boolean(token && !localMode && puId),
    queryFn: () => shiftsRequest(token!, puId!),
    refetchInterval: 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="Relief & shift handover" />
      </SafeAreaView>
    )
  }

  async function onHandover() {
    if (!token || busy) return
    if (situationLog.trim().length < 5) {
      setNote({ text: 'A running situation log is required — the incoming officer depends on it.', tone: 'error' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      await handoverShiftRequest(token, {
        electionSlug,
        pollingUnitId: puId,
        shiftName,
        incomingOfficerName: incomingName.trim() || undefined,
        runningSituationLog: situationLog.trim(),
        materialsStatus: materialsStatus.trim() || undefined,
        crowdAssessment: crowd,
        notes: notes.trim() || undefined,
      })
      setNote({ text: 'Handover recorded and signed. Command has been notified.', tone: 'success' })
      setSituationLog('')
      setNotes('')
      setIncomingName('')
      await shiftsQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Handover failed.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function onAcknowledge(id: number) {
    if (!token || ackBusy) return
    setAckBusy(id)
    try {
      await acknowledgeShiftRequest(token, id)
      setNote({ text: 'Handover acknowledged — you are now the officer on record.', tone: 'success' })
      await shiftsQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Acknowledge failed.', tone: 'error' })
    } finally {
      setAckBusy(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>Relief & shift handover (P2-04)</SectionLabel>
          <Text style={styles.muted}>
            {ctxQ.data?.assignment
              ? `${ctxQ.data.assignment.pollingUnit.name} (${ctxQ.data.assignment.pollingUnit.code})`
              : 'No polling unit assigned.'}{' '}
            The outgoing officer signs this log; the incoming officer acknowledges receipt.
          </Text>

          <FieldLabel>Shift</FieldLabel>
          <ChipGroup options={SHIFTS} selected={shiftName} onSelect={setShiftName} />

          <FieldLabel>Incoming officer (name / service no.)</FieldLabel>
          <FieldInput value={incomingName} onChangeText={setIncomingName} placeholder="e.g. Sgt. A. Musa, AP 245111" />

          <FieldLabel>Running situation log (required)</FieldLabel>
          <FieldInput
            value={situationLog}
            onChangeText={setSituationLog}
            placeholder="Incidents so far, crowd behaviour, VIPS present, outstanding issues…"
            multiline
          />

          <FieldLabel>Materials status</FieldLabel>
          <FieldInput value={materialsStatus} onChangeText={setMaterialsStatus} />

          <FieldLabel>Crowd assessment</FieldLabel>
          <ChipGroup options={CROWD} selected={crowd} onSelect={setCrowd} />

          <FieldLabel>Notes (optional)</FieldLabel>
          <FieldInput value={notes} onChangeText={setNotes} multiline />

          <PrimaryButton label="Sign handover" onPress={() => void onHandover()} busy={busy} />
          {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
        </Card>

        <SectionLabel>Handover history</SectionLabel>
        {shiftsQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.lg }} />
        ) : (shiftsQ.data?.shifts ?? []).length === 0 ? (
          <Text style={styles.muted}>No handovers recorded for this polling unit yet.</Text>
        ) : (
          (shiftsQ.data?.shifts ?? []).map((s) => (
            <View key={s.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {s.shift_name} shift · {fmtTime(s.handover_signed_at)}
                </Text>
                <Text style={styles.itemMeta}>
                  {s.outgoing_name ?? '—'} → {s.incoming_officer_name || s.incoming_name || '—'}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={2}>
                  {s.running_situation_log}
                </Text>
                <Text style={[styles.itemMeta, { fontWeight: '700' }]}>
                  Crowd: {s.crowd_assessment ?? '—'} · {s.incoming_acknowledged_at ? '✓ acknowledged' : 'awaiting acknowledgement'}
                </Text>
              </View>
              {!s.incoming_acknowledged_at ? (
                <Pressable
                  onPress={() => void onAcknowledge(s.id)}
                  disabled={ackBusy !== null}
                  style={[styles.ackBtn, ackBusy !== null && { opacity: 0.5 }]}
                >
                  {ackBusy === s.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ackBtnText}>Acknowledge</Text>}
                </Pressable>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.sm,
  },
  itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  ackBtn: {
    backgroundColor: colors.success,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  ackBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
