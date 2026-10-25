import { fieldContextRequest } from '../lib/api'
import { submitOrQueue } from '../lib/field-actions'
import { distanceMeters, getCurrentPosition } from '../lib/location'
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
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Severity = 'GREEN' | 'AMBER' | 'RED'
type SecurityStatus = 'Peaceful' | 'Tense' | 'Hostile'
type Observed = 'None' | 'Minor' | 'Major'

export default function SitrepScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [severity, setSeverity] = useState<Severity>('GREEN')
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>('Peaceful')
  const [observedIncident, setObservedIncident] = useState<Observed>('None')
  const [accredited, setAccredited] = useState('')
  const [narrative, setNarrative] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoGeo, setPhotoGeo] = useState<import('../components/PhotoCapture').PhotoGeo | null>(null)
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

  const assignment = ctxQ.data?.assignment ?? null

  async function onSubmit() {
    if (!token || busy) return
    setBusy(true)
    setNote(null)
    try {
      // GPS verification against the assigned polling unit (≤ 100 m)
      let gpsVerified = false
      let dist: number | null = null
      const pos = await getCurrentPosition()
      const puLat = assignment?.pollingUnit.lat
      const puLng = assignment?.pollingUnit.lng
      if (pos && puLat != null && puLng != null) {
        dist = Math.round(distanceMeters(pos.lat, pos.lng, puLat, puLng))
        gpsVerified = dist <= 100
      }

      const outcome = await submitOrQueue(token, 'sitrep', {
        severity,
        securityStatus,
        observedIncident,
        accredited: accredited.trim() === '' ? null : Math.max(0, Math.floor(Number(accredited))),
        narrative: narrative.trim() || undefined,
        photoDataUrl: photo ?? undefined,
        photoLat: photoGeo?.lat ?? null,
        photoLng: photoGeo?.lng ?? null,
        photoAccuracy: photoGeo?.accuracy ?? null,
        photoCapturedAt: photoGeo?.capturedAt ?? null,
        gpsVerified,
        distanceMeters: dist,
        puCode: assignment?.pollingUnit.code ?? null,
        puId: assignment?.pollingUnit.id ?? null,
        jurisdiction: assignment ? `${assignment.ward.name}, ${assignment.state.code}` : null,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      })

      const gpsMsg = gpsVerified
        ? `GPS verified at your PU (${dist} m).`
        : dist != null
          ? `GPS shows you ${dist} m from your assigned PU — flagged for Command review.`
          : 'No GPS fix — location unverified.'
      setNote({
        text:
          outcome === 'delivered'
            ? `SitRep delivered to Command. ${gpsMsg}`
            : `SitRep queued on device — will sync automatically when online. ${gpsMsg}`,
        tone: outcome === 'delivered' ? 'success' : 'info',
      })
      setNarrative('')
      setPhoto(null)
      setPhotoGeo(null)
      setAccredited('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>Situation report (M11)</SectionLabel>
          <Text style={styles.muted}>
            {assignment
              ? `Submitting for ${assignment.pollingUnit.name} (${assignment.pollingUnit.code}) — ${assignment.ward.name}, ${assignment.lga.name}.`
              : 'No polling unit assigned — the report will carry your account identity only.'}
          </Text>

          <FieldLabel>Severity</FieldLabel>
          <ChipGroup<Severity>
            options={[
              { value: 'GREEN', label: 'GREEN', tone: 'success' },
              { value: 'AMBER', label: 'AMBER', tone: 'warn' },
              { value: 'RED', label: 'RED', tone: 'danger' },
            ]}
            selected={severity}
            onSelect={setSeverity}
          />

          <FieldLabel>Security situation</FieldLabel>
          <ChipGroup<SecurityStatus>
            options={[
              { value: 'Peaceful', label: 'Peaceful', tone: 'success' },
              { value: 'Tense', label: 'Tense', tone: 'warn' },
              { value: 'Hostile', label: 'Hostile', tone: 'danger' },
            ]}
            selected={securityStatus}
            onSelect={setSecurityStatus}
          />

          <FieldLabel>Observed incident</FieldLabel>
          <ChipGroup<Observed>
            options={[
              { value: 'None', label: 'None' },
              { value: 'Minor', label: 'Minor', tone: 'warn' },
              { value: 'Major', label: 'Major', tone: 'danger' },
            ]}
            selected={observedIncident}
            onSelect={setObservedIncident}
          />

          <FieldLabel>Accredited voters so far (optional)</FieldLabel>
          <FieldInput
            value={accredited}
            onChangeText={(t) => setAccredited(t.replace(/[^\d]/g, ''))}
            placeholder="e.g. 150"
            keyboardType="number-pad"
          />

          <FieldLabel>Narrative (optional)</FieldLabel>
          <FieldInput
            value={narrative}
            onChangeText={setNarrative}
            placeholder="Anything Command should know — turnout mood, logistics gaps, party agent conduct…"
            multiline
          />

          <PhotoCapture value={photo} onChange={setPhoto} onGeo={setPhotoGeo} label="Attach SitRep photo" />

          <PrimaryButton label="Submit SitRep" onPress={() => void onSubmit()} busy={busy} />
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
})
