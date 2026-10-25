import { incidentTypesRequest, type IncidentType } from '../lib/api'
import { submitOrQueue } from '../lib/field-actions'
import { getCurrentPosition } from '../lib/location'
import { colors, space } from '../lib/theme'
import {
  Card,
  ChipGroup,
  FieldInput,
  FieldLabel,
  PrimaryButton,
  SectionLabel,
  StatusNote,
  useFieldSession,
} from '../components/field-ui'
import { PhotoCapture } from '../components/PhotoCapture'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Severity = 'low' | 'medium' | 'high' | 'critical'

const SEVERITY_OPTIONS: ReadonlyArray<{ value: Severity; label: string; tone?: 'default' | 'warn' | 'danger' }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium', tone: 'warn' },
  { value: 'high', label: 'High', tone: 'danger' },
  { value: 'critical', label: 'Critical', tone: 'danger' },
]

export default function IncidentScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [typeCode, setTypeCode] = useState('')
  const [severity, setSeverity] = useState<Severity | ''>('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const typesQ = useQuery({
    queryKey: ['incident-types', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => incidentTypesRequest(token!),
    staleTime: 10 * 60_000,
  })

  const types = useMemo(() => typesQ.data?.types ?? [], [typesQ.data])
  const selectedType: IncidentType | undefined = types.find((t) => t.code === typeCode)
  const effectiveSeverity: Severity = (severity || (selectedType?.defaultSeverity as Severity) || 'medium') as Severity

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />

  async function send(isFlash: boolean) {
    if (!token || busy) return
    const code = isFlash && !typeCode ? 'other' : typeCode
    if (!code) {
      setNote({ text: 'Choose an incident type first.', tone: 'error' })
      return
    }
    if (!isFlash && effectiveSeverity !== 'low' && description.trim().length < 5) {
      setNote({ text: 'Description (min 5 characters) is required for medium/high/critical incidents.', tone: 'error' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const pos = await getCurrentPosition()
      const outcome = await submitOrQueue(token, 'incident', {
        typeCode: code,
        severity: isFlash ? 'critical' : effectiveSeverity,
        isFlash,
        description: description.trim(),
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        photoDataUrl: photo ?? undefined,
      })
      if (isFlash) {
        setNote({
          text:
            outcome === 'delivered'
              ? '⚡ FLASH sent — Force HQ and all commands alerted.'
              : '⚡ FLASH queued on device (no network) — it will send automatically. Use voice escalation per SOP.',
          tone: outcome === 'delivered' ? 'success' : 'info',
        })
      } else {
        setNote({
          text:
            outcome === 'delivered'
              ? 'Incident delivered to Command.'
              : 'Incident queued on device — it will sync automatically when you are online.',
          tone: outcome === 'delivered' ? 'success' : 'info',
        })
      }
      setDescription('')
      setPhoto(null)
    } finally {
      setBusy(false)
    }
  }

  function onFlash() {
    Alert.alert(
      'Send FLASH alert?',
      'FLASH is for grave, happening-now emergencies (armed attack, life threat). It alerts Force HQ and every command instantly and overrides severity to CRITICAL.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'SEND FLASH', style: 'destructive', onPress: () => void send(true) },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {typesQ.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : typesQ.isError ? (
          <Card>
            <Text style={styles.errorText}>Could not load incident types — check your connection and retry.</Text>
            <PrimaryButton label="Retry" onPress={() => typesQ.refetch()} />
          </Card>
        ) : (
          <>
            <Card>
              <SectionLabel>Incident type</SectionLabel>
              <View style={styles.typeGrid}>
                {types.map((t) => {
                  const active = typeCode === t.code
                  return (
                    <Text
                      key={t.code}
                      onPress={() => setTypeCode(t.code)}
                      style={[styles.typeChip, active && styles.typeChipActive]}
                    >
                      {t.label}
                    </Text>
                  )
                })}
              </View>

              <FieldLabel>Severity {selectedType ? `(default: ${selectedType.defaultSeverity})` : ''}</FieldLabel>
              <ChipGroup options={SEVERITY_OPTIONS} selected={effectiveSeverity} onSelect={(v) => setSeverity(v)} />

              <FieldLabel>Description</FieldLabel>
              <FieldInput
                value={description}
                onChangeText={setDescription}
                placeholder="What happened, who is involved, current situation…"
                multiline
              />

              <PhotoCapture value={photo} onChange={setPhoto} />

              <PrimaryButton label="Submit incident & escalate" onPress={() => void send(false)} busy={busy} />
            </Card>

            <Card style={styles.flashCard}>
              <SectionLabel>⚡ FLASH — grave emergency only</SectionLabel>
              <Text style={styles.muted}>
                For armed attack, life threat or situation collapsing right now. Alerts Force HQ and all commands
                instantly. No description needed.
              </Text>
              <PrimaryButton label="⚡ SEND FLASH" tone="danger" onPress={onFlash} busy={busy} />
            </Card>

            {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  center: { justifyContent: 'center', alignItems: 'center', paddingTop: space.xl * 2 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary, color: '#fff' },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  errorText: { color: colors.danger, fontSize: 14 },
  flashCard: { borderColor: colors.danger, borderWidth: 2 },
})
