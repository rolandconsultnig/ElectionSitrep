import { myIncidentsRequest } from '../lib/api'
import { listPending, type PendingFieldBatchItem } from '../lib/pending-queue'
import { flushPendingVoteSync } from '../lib/sync-pending'
import { colors, radii, space } from '../lib/theme'
import { Card, fmtTime, LocalSessionBlocked, PrimaryButton, SectionLabel, StatusNote, useFieldSession } from '../components/field-ui'
import { useFocusEffect } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const KIND_LABEL: Record<string, string> = {
  vote_tally: 'Vote tally',
  sitrep: 'SitRep',
  incident: 'Incident report',
  violence: 'URGENT violence report',
}

function describePending(item: PendingFieldBatchItem): string {
  const p = item.payload as Record<string, unknown>
  if (item.kind === 'sitrep') return `${p.severity ?? ''} · ${p.securityStatus ?? ''}`.trim()
  if (item.kind === 'incident') return `${p.typeCode ?? ''}${p.isFlash ? ' · FLASH' : ''}`
  if (item.kind === 'violence') return 'Level: URGENT'
  if (item.kind === 'vote_tally') {
    const votes = Array.isArray(p.votes) ? p.votes.length : 0
    return `${votes} party entries · ${p.electionSlug ?? ''}`
  }
  return ''
}

export default function HistoryScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [pending, setPending] = useState<PendingFieldBatchItem[]>([])
  const [syncBusy, setSyncBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const refreshPending = useCallback(async () => {
    setPending(await listPending())
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refreshPending()
    }, [refreshPending]),
  )

  const incidentsQ = useQuery({
    queryKey: ['my-incidents', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => myIncidentsRequest(token!),
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="Submission history" />
      </SafeAreaView>
    )
  }

  async function onSyncNow() {
    if (!token || syncBusy) return
    setSyncBusy(true)
    setNote(null)
    try {
      const res = await flushPendingVoteSync(token)
      setNote({
        text:
          res.errors.length > 0
            ? `${res.flushed} synced, ${res.errors.length} failed — will retry automatically.`
            : res.flushed > 0
              ? `${res.flushed} queued item(s) delivered to Command.`
              : 'Nothing to sync — queue is clear.',
        tone: res.errors.length > 0 ? 'error' : 'success',
      })
      await refreshPending()
    } finally {
      setSyncBusy(false)
    }
  }

  const incidents = incidentsQ.data?.incidents ?? []

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <SectionLabel>Pending on this device</SectionLabel>
          <Text style={styles.muted}>
            Reports captured offline sit here until the server accepts them (idempotent — duplicates are impossible).
          </Text>
          {pending.length === 0 ? (
            <Text style={[styles.muted, { marginTop: space.sm }]}>✓ Queue empty — everything has been delivered.</Text>
          ) : (
            pending.map((p) => (
              <View key={p.clientId} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{KIND_LABEL[p.kind] ?? p.kind}</Text>
                  <Text style={styles.itemMeta}>
                    {describePending(p)} · captured {fmtTime(p.createdAt)}
                  </Text>
                </View>
                <Text style={styles.pendingBadge}>QUEUED</Text>
              </View>
            ))
          )}
          {pending.length > 0 ? <PrimaryButton label="Sync now" onPress={() => void onSyncNow()} busy={syncBusy} /> : null}
          {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
        </Card>

        <SectionLabel>My incident reports (server)</SectionLabel>
        {incidentsQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.lg }} />
        ) : incidents.length === 0 ? (
          <Text style={styles.muted}>No incident reports filed yet.</Text>
        ) : (
          incidents.map((inc) => (
            <View key={inc.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {inc.isFlash ? '⚡ ' : ''}
                  {inc.typeLabel}
                </Text>
                <Text style={styles.itemMeta}>
                  {inc.location.puCode ?? inc.location.lgaName ?? inc.location.stateName ?? '—'} ·{' '}
                  {fmtTime(inc.createdAt)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.severity,
                    inc.severity === 'critical' || inc.severity === 'high'
                      ? { color: colors.danger }
                      : inc.severity === 'medium'
                        ? { color: colors.warn }
                        : { color: colors.muted },
                  ]}
                >
                  {inc.severity.toUpperCase()}
                </Text>
                <Text style={styles.itemMeta}>{inc.status}</Text>
              </View>
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
    marginTop: space.sm,
    gap: space.sm,
  },
  itemTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pendingBadge: { fontSize: 11, fontWeight: '800', color: colors.warn },
  severity: { fontSize: 12, fontWeight: '800' },
})
