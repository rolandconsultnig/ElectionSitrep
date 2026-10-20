import { apiFetch, fieldContextRequest } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { getApiBaseUrl } from '../lib/config'
import { isLocalSessionToken } from '../lib/local-session'
import { listPending } from '../lib/pending-queue'
import { flushPendingVoteSync } from '../lib/sync-pending'
import { colors, radii, space } from '../lib/theme'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const FIELD_MODULES = [
  { route: '/safety', icon: '🆘', label: 'Safety · SOS', hint: 'Check-in · duress PIN', tone: 'danger' },
  { route: '/sitrep', icon: '📝', label: 'Submit SitRep', hint: 'M11 · GPS-verified', tone: 'default' },
  { route: '/incident', icon: '⚠️', label: 'Report incident', hint: 'M14 · FLASH alerts', tone: 'default' },
  { route: '/violence', icon: '🚨', label: 'Violence URGENT', hint: 'M15 · one-tap', tone: 'danger' },
  { route: '/timeline', icon: '⏱', label: 'Timeline', hint: 'P2-01 · milestones', tone: 'default' },
  { route: '/ec8a', icon: '📜', label: 'EC8A evidence', hint: 'P2-02 · SHA-256 tally', tone: 'default' },
  { route: '/materials', icon: '📦', label: 'Materials log', hint: 'P2-03 · custody', tone: 'default' },
  { route: '/shifts', icon: '🔄', label: 'Shift handover', hint: 'P2-04 · relief', tone: 'default' },
  { route: '/logistics', icon: '⛽', label: 'Logistics', hint: 'P2-05 · requests', tone: 'default' },
  { route: '/turnout', icon: '📊', label: 'Voter turnout', hint: 'M13 · pulse', tone: 'default' },
  { route: '/reference', icon: '⚑', label: 'Parties ref.', hint: 'M16 · INEC register', tone: 'default' },
  { route: '/history', icon: '🕐', label: 'History', hint: 'M17 · sync queue', tone: 'default' },
] as const

export default function HomeScreen() {
  const { token, user, ready, signOut } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [syncErrors, setSyncErrors] = useState<string[]>([])
  const [bootstrapTimeout, setBootstrapTimeout] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const localMode = isLocalSessionToken(token)

  const refreshUnreadMessages = useCallback(async () => {
    if (!token || !user || localMode) return
    try {
      const [result, lastRead] = await Promise.all([
        apiFetch<{ messages: { sender_id: string; created_at: string }[] }>('/api/chat/dm/history?limit=500', { token }),
        AsyncStorage.getItem(`@command_dm_last_read_${user.id}`),
      ])
      const lastReadMs = lastRead ? new Date(lastRead).getTime() : 0
      setUnreadMessages(result.messages.filter((message) =>
        String(message.sender_id) !== String(user.id) && new Date(message.created_at).getTime() > lastReadMs).length)
    } catch {
      setUnreadMessages(0)
    }
  }, [token, user, localMode])

  useFocusEffect(useCallback(() => {
    void refreshUnreadMessages()
    const timer = setInterval(() => void refreshUnreadMessages(), 15_000)
    return () => clearInterval(timer)
  }, [refreshUnreadMessages]))

  async function refreshPendingCount() {
    const p = await listPending()
    setPendingCount(p.length)
  }

  function updateSyncState(result: { flushed: number; errors: string[] }) {
    setSyncErrors(result.errors)
    if (result.errors.length > 0) {
      setSyncStatus(`${result.flushed} queued item(s) synced, ${result.errors.length} error(s).`)
    } else if (result.flushed > 0) {
      setSyncStatus(`${result.flushed} queued item(s) synced successfully.`)
    } else {
      setSyncStatus('No queued items to send.')
    }
  }

  async function trySyncPending() {
    if (!token || localMode) return
    setSyncStatus('Checking queued sync…')
    const result = await flushPendingVoteSync(token)
    updateSyncState(result)
    await refreshPendingCount()
  }

  // Force show UI after 3 seconds even if auth context is still loading
  useEffect(() => {
    const timer = setTimeout(() => setBootstrapTimeout(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  const q = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && user?.portalId === 'field' && !localMode),
    queryFn: async () => {
      if (!token) throw new Error('no token')
      return fieldContextRequest(token)
    },
  })

  useEffect(() => {
    refreshPendingCount()
  }, [q.dataUpdatedAt])

  useEffect(() => {
    if (!token || localMode) return
    const sub = NetInfo.addEventListener((s) => {
      if (s.isConnected) {
        void trySyncPending()
      }
    })
    return () => sub()
  }, [token, localMode])

  useEffect(() => {
    if (!token || localMode) return
    void NetInfo.fetch().then((s) => {
      if (s.isConnected) void trySyncPending()
      else void refreshPendingCount()
    })
  }, [token, localMode])

  // Show loading state during bootstrap, with timeout fallback
  if (!ready && !bootstrapTimeout) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: space.md }]}>Loading...</Text>
      </SafeAreaView>
    )
  }
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.title}>Field app only</Text>
          <Text style={styles.muted}>Sign in with a Field portal account.</Text>
          <Pressable onPress={() => signOut()} style={styles.btn}>
            <Text style={styles.btnText}>Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }
  if (!user.onboardingComplete || user.passwordMustChange) return <Redirect href="/onboarding" />

  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>Local administrator</Text>
              <Text style={styles.title}>{user.profile?.name ?? 'Offline session'}</Text>
              <Text style={styles.muted}>Signed in without network. Configure the server, then sign in with a live account.</Text>
            </View>
            <Pressable onPress={() => signOut()} style={styles.signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>

          <View style={[styles.card, { borderColor: colors.primary, borderWidth: 2 }]}>
            <Text style={styles.cardTitle}>API server</Text>
          <Text style={styles.meta}>{getApiBaseUrl() ?? 'Not configured'}</Text>
            <Pressable onPress={() => router.push('/network-settings')} style={[styles.btn, { marginTop: space.md }]}>
              <Text style={styles.btnText}>Network settings</Text>
            </Pressable>
          </View>

          <Text style={styles.muted}>
            Field assignment and elections load from the server after you connect with a normal officer account.
          </Text>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (q.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.muted, { marginTop: space.md }]}>Loading assignment…</Text>
      </SafeAreaView>
    )
  }

  if (q.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.title}>Could not load data</Text>
          <Text style={styles.muted}>{q.error instanceof Error ? q.error.message : 'Network error'}</Text>
          <Pressable onPress={() => q.refetch()} style={styles.btn}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => signOut()} style={[styles.btnSecondary, { marginTop: space.sm }]}>
            <Text style={styles.btnSecondaryText}>Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const ctx = q.data!
  const assignment = ctx.assignment

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>Signed in</Text>
            <Text style={styles.title}>{ctx.officer.displayName}</Text>
            <Text style={styles.muted}>{ctx.officer.username}</Text>
          </View>
          <Pressable onPress={() => signOut()} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/messages')} style={styles.messageButton}>
          <Text style={styles.messageButtonText}>Messages from Command</Text>
          {unreadMessages > 0 ? <Text style={styles.unreadBadge}>{unreadMessages}</Text> : null}
        </Pressable>

        {(pendingCount > 0 || syncErrors.length > 0) ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {pendingCount > 0 ? `${pendingCount} queued update${pendingCount === 1 ? '' : 's'}` : 'No queued updates'}
              {syncStatus ? ` · ${syncStatus}` : ''}
            </Text>
            {syncErrors.length > 0 ? (
              <Text style={styles.bannerError} numberOfLines={2}>
                {`Sync errors: ${syncErrors.length}. ${syncErrors[0] ?? 'Tap network settings to verify server connection.'}`}
              </Text>
            ) : null}
            <Pressable onPress={() => void trySyncPending()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry sync now</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Polling unit</Text>
          {assignment ? (
            <>
              <Text style={styles.puName}>{assignment.pollingUnit.name}</Text>
              <Text style={styles.meta}>
                {assignment.pollingUnit.code} · {assignment.ward.name}, {assignment.lga.name}
              </Text>
              <Text style={styles.meta}>{assignment.state.name}</Text>
            </>
          ) : (
            <Text style={styles.warn}>No polling unit assigned yet. Ask Command to assign your PU in Admin.</Text>
          )}
        </View>

        <Text style={styles.section}>Active elections</Text>
        {ctx.activeElections.length === 0 ? (
          <Text style={styles.muted}>No active elections.</Text>
        ) : (
          ctx.activeElections.map((e) => (
            <Pressable
              key={e.slug}
              onPress={() => router.push(`/tally/${encodeURIComponent(e.slug)}`)}
              style={({ pressed }) => [styles.electionRow, pressed && { opacity: 0.9 }]}
            >
              <View>
                <Text style={styles.electionName}>{e.name}</Text>
                <Text style={styles.meta}>{e.electionDate ?? 'Date TBC'} · {e.status}</Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.section}>Field modules</Text>
        <View style={styles.moduleGrid}>
          {FIELD_MODULES.map((m) => (
            <Pressable
              key={m.route}
              onPress={() => router.push(m.route as never)}
              style={({ pressed }) => [
                styles.moduleCell,
                m.tone === 'danger' && styles.moduleCellDanger,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.moduleIcon}>{m.icon}</Text>
              <Text style={[styles.moduleLabel, m.tone === 'danger' && styles.moduleLabelDanger]}>{m.label}</Text>
              <Text style={[styles.moduleHint, m.tone === 'danger' && styles.moduleLabelDanger]}>{m.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>National pulse (submissions)</Text>
        <View style={styles.card}>
          <Text style={styles.muted}>
            Last slots: {ctx.nationalPulse.labels.slice(-4).join(', ') || '—'}
          </Text>
          <Text style={styles.meta}>
            Peak hour submissions: {Math.max(0, ...ctx.nationalPulse.submissions).toString()}
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.lg },
  kicker: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  messageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md, padding: space.md, borderRadius: radii.md, backgroundColor: colors.primary, },
  messageButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  unreadBadge: { minWidth: 24, height: 24, overflow: 'hidden', borderRadius: 12, textAlign: 'center', textAlignVertical: 'center', backgroundColor: '#fff', color: colors.primary, fontWeight: '800' },
  muted: { fontSize: 14, color: colors.muted, marginTop: 4, lineHeight: 20 },
  signOut: { paddingVertical: space.sm, paddingHorizontal: space.md },
  signOutText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  banner: {
    backgroundColor: '#fff7e6',
    borderWidth: 1,
    borderColor: '#ffe0a3',
    borderRadius: radii.md,
    padding: space.md,
    marginBottom: space.md,
  },
  bannerText: { color: colors.warn, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.lg,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: space.sm },
  puName: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, color: colors.muted, marginTop: 4 },
  warn: { color: colors.warn, fontSize: 15, lineHeight: 22 },
  section: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: space.sm, marginTop: space.sm },
  electionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  electionName: { fontSize: 16, fontWeight: '600', color: colors.text },
  chev: { fontSize: 22, color: colors.muted },
  btn: {
    marginTop: space.md,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnSecondary: { alignItems: 'center', paddingVertical: 10 },
  btnSecondaryText: { color: colors.primary, fontWeight: '600' },
  bannerError: { color: colors.danger, marginTop: space.xs, fontSize: 13, lineHeight: 18 },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  moduleCell: {
    width: '31.5%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    minHeight: 92,
  },
  moduleCellDanger: { borderColor: colors.danger, backgroundColor: '#fdecea' },
  moduleIcon: { fontSize: 20 },
  moduleLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: space.xs },
  moduleHint: { fontSize: 11, color: colors.muted, marginTop: 2 },
  moduleLabelDanger: { color: colors.danger },
  retryButton: {
    marginTop: space.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: space.md,
    borderRadius: radii.sm,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
})
