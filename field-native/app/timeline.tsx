import { ApiError, fieldContextRequest, logMilestoneRequest, puTimelineRequest } from '../lib/api'
import { colors, radii, space } from '../lib/theme'
import { Card, fmtTime, LocalSessionBlocked, SectionLabel, StatusNote, useFieldSession } from '../components/field-ui'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const MILESTONES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'materials_received', label: 'Sensitive materials received' },
  { code: 'polls_opened', label: 'Polls opened' },
  { code: 'accreditation_started', label: 'Accreditation started' },
  { code: 'voting_closed', label: 'Voting closed' },
  { code: 'counting_started', label: 'Counting started' },
  { code: 'results_declared', label: 'Results declared at PU' },
]

export default function TimelineScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    staleTime: 5 * 60_000,
  })

  const puId = ctxQ.data?.assignment?.pollingUnit.id ?? null
  const electionSlug = ctxQ.data?.activeElections?.[0]?.slug ?? undefined

  const timelineQ = useQuery({
    queryKey: ['pu-timeline', token, puId, electionSlug],
    enabled: Boolean(token && !localMode && puId),
    queryFn: () => puTimelineRequest(token!, puId!, electionSlug),
    refetchInterval: 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="Operational timeline" />
      </SafeAreaView>
    )
  }

  async function record(code: string, label: string) {
    if (!token || !puId || busyCode) return
    setBusyCode(code)
    setNote(null)
    try {
      await logMilestoneRequest(token, { pollingUnitId: puId, milestone: code, electionSlug })
      setNote({ text: `${label} — recorded and visible to Command.`, tone: 'success' })
      await timelineQ.refetch()
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'Could not record milestone.', tone: 'error' })
    } finally {
      setBusyCode(null)
    }
  }

  const recorded = new Map((timelineQ.data?.milestones ?? []).map((m) => [m.milestone, m]))

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <SectionLabel>Operational timeline (P2-01)</SectionLabel>
          <Text style={styles.muted}>
            {ctxQ.data?.assignment
              ? `${ctxQ.data.assignment.pollingUnit.name} (${ctxQ.data.assignment.pollingUnit.code}) · ${ctxQ.data.activeElections?.[0]?.name ?? 'No active election'}`
              : 'No polling unit assigned.'}
          </Text>
        </Card>

        {!puId ? (
          <Card>
            <Text style={styles.warn}>Ask Command to assign your polling unit before logging milestones.</Text>
          </Card>
        ) : timelineQ.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          MILESTONES.map((m, i) => {
            const rec = recorded.get(m.code)
            return (
              <View key={m.code} style={styles.row}>
                <View style={[styles.dot, rec ? styles.dotDone : null]}>
                  <Text style={styles.dotText}>{rec ? '✓' : i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{m.label}</Text>
                  {rec ? (
                    <Text style={styles.meta}>
                      {fmtTime(rec.timestamp)}
                      {rec.officer_name ? ` · ${rec.officer_name}` : ''}
                    </Text>
                  ) : (
                    <Pressable
                      onPress={() => void record(m.code, m.label)}
                      disabled={busyCode !== null}
                      style={[styles.recordBtn, busyCode !== null && { opacity: 0.5 }]}
                    >
                      {busyCode === m.code ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.recordBtnText}>Record now</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            )
          })
        )}
        {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  center: { justifyContent: 'center', alignItems: 'center', padding: space.xl },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  warn: { color: colors.warn, fontSize: 15, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    alignItems: 'center',
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.success },
  dotText: { color: '#fff', fontWeight: '800' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  recordBtn: {
    marginTop: space.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 110,
    alignItems: 'center',
  },
  recordBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
