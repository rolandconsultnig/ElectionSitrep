import { fieldContextRequest } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { flushPendingVoteSync } from '../lib/sync-pending'
import { listPending } from '../lib/pending-queue'
import { colors, radii, space } from '../lib/theme'
import { useQuery } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { Redirect, router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HomeScreen() {
  const { token, user, ready, signOut } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)

  const q = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && user?.portalId === 'field'),
    queryFn: async () => {
      if (!token) throw new Error('no token')
      return fieldContextRequest(token)
    },
  })

  useEffect(() => {
    listPending().then((p) => setPendingCount(p.length))
  }, [q.dataUpdatedAt])

  useEffect(() => {
    if (!token) return
    const sub = NetInfo.addEventListener((s) => {
      if (s.isConnected) {
        flushPendingVoteSync(token).then(() => listPending().then((p) => setPendingCount(p.length)))
      }
    })
    return () => sub()
  }, [token])

  useEffect(() => {
    if (!token) return
    NetInfo.fetch().then((s) => {
      if (s.isConnected) flushPendingVoteSync(token)
    })
  }, [token])

  if (!ready) return null
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

        {pendingCount > 0 ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              {pendingCount} tally update(s) queued — will send when online.
            </Text>
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
})
