import {
  ApiError,
  fieldContextRequest,
  materialsRequest,
} from '../lib/api'
import { submitWithOffline } from '../lib/submit-with-offline'
import { getCurrentPosition } from '../lib/location'
import { colors, radii, space } from '../lib/theme'
import {
  Card,
  ChipGroup,
  FieldInput,
  FieldLabel,
  fmtTime,
  PrimaryButton,
  SectionLabel,
  StatusNote,
  useFieldSession,
} from '../components/field-ui'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const MATERIAL_TYPES = [
  { value: 'bvas', label: 'BVAS' },
  { value: 'ballot_box', label: 'Ballot box' },
  { value: 'ec8a_sheet', label: 'EC8A sheets' },
  { value: 'ballot_papers', label: 'Ballot papers' },
  { value: 'stamp_and_ink', label: 'Stamp & ink' },
] as const

type MaterialType = (typeof MATERIAL_TYPES)[number]['value']

const SCAN_STATUSES = [
  { value: 'issued', label: 'Issued' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'at_pu', label: 'At PU' },
  { value: 'in_use', label: 'In use' },
  { value: 'returned', label: 'Returned' },
] as const

type ScanStatus = (typeof SCAN_STATUSES)[number]['value']

export default function MaterialsScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [mode, setMode] = useState<'register' | 'scan'>('register')
  const [materialType, setMaterialType] = useState<MaterialType>('bvas')
  const [serial, setSerial] = useState('')
  const [scanStatus, setScanStatus] = useState<ScanStatus>('at_pu')
  const [sealIntact, setSealIntact] = useState(true)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    staleTime: 5 * 60_000,
  })

  const electionSlug = ctxQ.data?.activeElections?.[0]?.slug ?? undefined
  const puId = ctxQ.data?.assignment?.pollingUnit.id ?? null

  const listQ = useQuery({
    queryKey: ['materials', token, electionSlug],
    enabled: Boolean(token && !localMode),
    queryFn: () => materialsRequest(token!, electionSlug),
    refetchInterval: 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />

  const myMaterials = (listQ.data?.materials ?? []).filter(
    (m) => puId == null || m.pu_id == null || String(m.pu_id) === String(puId),
  )

  async function onSubmit() {
    if (!token || busy) return
    if (!serial.trim()) {
      setNote({ text: 'Serial / barcode is required.', tone: 'error' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      if (mode === 'register') {
        const body = {
          electionSlug,
          materialType,
          serialOrBarcode: serial.trim(),
          pollingUnitId: puId,
          status: 'issued',
          tamperSealIntact: sealIntact,
          notes: notes.trim() || undefined,
        }
        const { outcome } = await submitWithOffline(token!, 'POST', '/api/operations/materials', body, 'Material register')
        setNote({
          text:
            outcome === 'delivered'
              ? 'Material registered — custody now tracked under your name.'
              : 'Material registration queued — will sync when back online.',
          tone: outcome === 'delivered' ? 'success' : 'info',
        })
      } else {
        const pos = await getCurrentPosition()
        const body = {
          serialOrBarcode: serial.trim(),
          status: scanStatus,
          tamperSealIntact: sealIntact,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
          notes: notes.trim() || undefined,
        }
        const { outcome } = await submitWithOffline(token!, 'POST', '/api/operations/materials/scan', body, 'Material scan')
        setNote({
          text:
            outcome === 'delivered'
              ? 'Custody scan recorded with your GPS position.'
              : 'Custody scan queued — will sync when back online.',
          tone: outcome === 'delivered' ? 'success' : 'info',
        })
      }
      setSerial('')
      setNotes('')
      await listQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Operation failed.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>Sensitive materials log (P2-03)</SectionLabel>
          <Text style={styles.muted}>
            Chain of custody for BVAS, ballot boxes, EC8A sheets, ballot papers and stamp/ink. Every scan is stamped
            with your identity, time and GPS.
          </Text>
          <FieldLabel>Mode</FieldLabel>
          <ChipGroup
            options={[
              { value: 'register' as const, label: 'Register new item' },
              { value: 'scan' as const, label: 'Scan / move custody' },
            ]}
            selected={mode}
            onSelect={setMode}
          />

          {mode === 'register' ? (
            <>
              <FieldLabel>Material type</FieldLabel>
              <ChipGroup options={MATERIAL_TYPES} selected={materialType} onSelect={setMaterialType} />
            </>
          ) : (
            <>
              <FieldLabel>New status</FieldLabel>
              <ChipGroup options={SCAN_STATUSES} selected={scanStatus} onSelect={setScanStatus} />
            </>
          )}

          <FieldLabel>Serial / barcode</FieldLabel>
          <FieldInput value={serial} onChangeText={setSerial} placeholder="e.g. BVAS-EK-0042" />

          <FieldLabel>Tamper seal</FieldLabel>
          <ChipGroup
            options={[
              { value: 'intact' as const, label: 'Intact', tone: 'success' },
              { value: 'broken' as const, label: 'Broken / missing', tone: 'danger' },
            ]}
            selected={sealIntact ? ('intact' as const) : ('broken' as const)}
            onSelect={(v) => setSealIntact(v === 'intact')}
          />

          <FieldLabel>Notes (optional)</FieldLabel>
          <FieldInput value={notes} onChangeText={setNotes} placeholder="Condition, escort, anomalies…" multiline />

          <PrimaryButton
            label={mode === 'register' ? 'Register material' : 'Record custody scan'}
            onPress={() => void onSubmit()}
            busy={busy}
          />
          {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
        </Card>

        <SectionLabel>Recent items in your area</SectionLabel>
        {listQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.lg }} />
        ) : myMaterials.length === 0 ? (
          <Text style={styles.muted}>No materials recorded yet.</Text>
        ) : (
          myMaterials.slice(0, 30).map((m) => (
            <View key={m.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {m.material_type.replace(/_/g, ' ')} · {m.serial_or_barcode}
                </Text>
                <Text style={styles.itemMeta}>
                  {m.status.replace(/_/g, ' ')}
                  {m.pu_code ? ` · ${m.pu_code}` : ''} · {fmtTime(m.last_scanned_at)}
                </Text>
              </View>
              <Text style={[styles.seal, { color: m.tamper_seal_intact === false ? colors.danger : colors.success }]}>
                {m.tamper_seal_intact === false ? 'SEAL BROKEN' : 'sealed'}
              </Text>
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
  seal: { fontSize: 12, fontWeight: '800' },
})
