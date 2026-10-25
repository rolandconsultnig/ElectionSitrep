import {
  ApiError,
  fieldContextRequest,
  logisticsListRequest,
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

const CATEGORIES = [
  { value: 'fuel', label: '⛽ Fuel' },
  { value: 'vehicle', label: '🚙 Vehicle' },
  { value: 'reinforcement', label: '👮 Reinforcement' },
  { value: 'feeding', label: '🍲 Feeding' },
  { value: 'comms_battery', label: '🔋 Comms / battery' },
  { value: 'medical', label: '⛑ Medical' },
  { value: 'other', label: 'Other' },
] as const

type Category = (typeof CATEGORIES)[number]['value']

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'urgent', label: 'Urgent', tone: 'warn' as const },
  { value: 'critical', label: 'Critical', tone: 'danger' as const },
] as const

type Priority = (typeof PRIORITIES)[number]['value']

export default function LogisticsScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [category, setCategory] = useState<Category>('fuel')
  const [priority, setPriority] = useState<Priority>('medium')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    staleTime: 5 * 60_000,
  })

  const puId = ctxQ.data?.assignment?.pollingUnit.id ?? null
  const electionSlug = ctxQ.data?.activeElections?.[0]?.slug ?? undefined

  const listQ = useQuery({
    queryKey: ['logistics', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => logisticsListRequest(token!),
    refetchInterval: 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />

  async function onSubmit() {
    if (!token || busy) return
    if (description.trim().length < 3) {
      setNote({ text: 'Describe what you need and how much (e.g. "20 litres PMS for patrol generator").', tone: 'error' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      const pos = await getCurrentPosition()
      const body = {
        electionSlug,
        category,
        priority,
        quantityDescription: description.trim(),
        pollingUnitId: puId,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      }
      const { outcome } = await submitWithOffline(token!, 'POST', '/api/operations/logistics', body, 'Logistics request')
      setNote({
        text:
          outcome === 'delivered'
            ? 'Request sent — Command logistics desk will action it.'
            : 'Request queued on device — will sync when back online.',
        tone: outcome === 'delivered' ? 'success' : 'info',
      })
      setDescription('')
      await listQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Request failed.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const requests = listQ.data?.requests ?? []

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>Logistics request (P2-05)</SectionLabel>
          <Text style={styles.muted}>
            Request fuel, vehicles, reinforcement, feeding, comms power or medical support. Your PU and GPS are attached
            automatically.
          </Text>

          <FieldLabel>Category</FieldLabel>
          <ChipGroup options={CATEGORIES} selected={category} onSelect={setCategory} />

          <FieldLabel>Priority</FieldLabel>
          <ChipGroup options={PRIORITIES} selected={priority} onSelect={setPriority} />

          <FieldLabel>What do you need?</FieldLabel>
          <FieldInput
            value={description}
            onChangeText={setDescription}
            placeholder='e.g. "20 litres PMS for patrol generator" or "1 extra patrol team until close of polls"'
            multiline
          />

          <PrimaryButton label="Send request" onPress={() => void onSubmit()} busy={busy} />
          {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
        </Card>

        <SectionLabel>Requests in your jurisdiction</SectionLabel>
        {listQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.lg }} />
        ) : requests.length === 0 ? (
          <Text style={styles.muted}>No logistics requests yet.</Text>
        ) : (
          requests.slice(0, 30).map((r) => (
            <View key={r.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {r.category.replace(/_/g, ' ')} · <Text style={{ textTransform: 'capitalize' }}>{r.priority}</Text>
                </Text>
                <Text style={styles.itemMeta} numberOfLines={2}>
                  {r.quantity_description}
                </Text>
                <Text style={styles.itemMeta}>
                  {r.pu_code ?? r.ward_name ?? r.lga_name ?? '—'} · {fmtTime(r.created_at)}
                </Text>
              </View>
              <Text
                style={[
                  styles.status,
                  r.status === 'pending'
                    ? { color: colors.warn }
                    : r.status === 'approved' || r.status === 'fulfilled'
                      ? { color: colors.success }
                      : { color: colors.muted },
                ]}
              >
                {r.status}
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
  status: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
})
