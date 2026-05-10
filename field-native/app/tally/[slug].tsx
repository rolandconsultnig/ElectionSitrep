import { ApiError, candidatePartiesRequest, submitVotesRequest } from '../../lib/api'
import { useAuth } from '../../lib/auth-context'
import { isLocalSessionToken } from '../../lib/local-session'
import { enqueueVoteTally } from '../../lib/pending-queue'
import { colors, radii, space } from '../../lib/theme'
import { useQuery } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TallyScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>()
  const slug = rawSlug ? decodeURIComponent(String(rawSlug)) : ''
  const router = useRouter()
  const { token, user, ready } = useAuth()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const partiesQ = useQuery({
    queryKey: ['parties', slug, token],
    enabled: Boolean(slug && token && !isLocalSessionToken(token)),
    queryFn: async () => {
      if (!token) throw new Error('no token')
      return candidatePartiesRequest(token, slug)
    },
  })

  const rows = useMemo(() => {
    return partiesQ.data?.parties ?? []
  }, [partiesQ.data])

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (isLocalSessionToken(token)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: space.lg }}>
          <Text style={styles.blocked}>PU tally requires a connected officer account. Sign out and use your issued credentials.</Text>
          <Pressable onPress={() => router.back()} style={styles.btn}>
            <Text style={styles.btnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  function setVote(partyId: string, text: string) {
    const cleaned = text.replace(/[^\d]/g, '')
    setCounts((c) => ({ ...c, [partyId]: cleaned }))
  }

  async function onSubmit() {
    if (!token || !slug) return
    const votes = rows
      .map((p) => ({
        partyId: p.id,
        votes: Math.max(0, Math.floor(Number(counts[p.id] || 0))),
      }))
      .filter((v) => v.votes > 0)

    if (votes.length === 0) {
      Alert.alert('Tally', 'Enter at least one non-zero vote count.')
      return
    }

    setSaving(true)
    try {
      const net = await NetInfo.fetch()
      if (!net.isConnected) {
        await enqueueVoteTally(slug, votes)
        Alert.alert('Queued', 'You are offline — tally saved on device for later sync.', [
          { text: 'OK', onPress: () => router.back() },
        ])
        return
      }
      await submitVotesRequest(token, slug, votes)
      Alert.alert('Saved', 'Tally submitted for your polling unit.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (e) {
      const net = await NetInfo.fetch()
      const serverUnavailable = e instanceof ApiError && e.status >= 500
      if (!net.isConnected || serverUnavailable) {
        try {
          await enqueueVoteTally(slug, votes)
          Alert.alert('Queued', 'Will retry when the server is reachable.', [
            { text: 'OK', onPress: () => router.back() },
          ])
        } catch {
          Alert.alert('Error', e instanceof ApiError ? e.message : 'Could not save tally')
        }
      } else {
        Alert.alert('Error', e instanceof ApiError ? e.message : 'Submit failed')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!slug) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.muted}>Missing election.</Text>
      </SafeAreaView>
    )
  }

  if (partiesQ.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    )
  }

  if (partiesQ.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.card}>
          <Text style={styles.title}>Could not load parties</Text>
          <Pressable onPress={() => partiesQ.refetch()} style={styles.btn}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          Enter votes for each party at your assigned PU. Leave blank or zero where applicable.
        </Text>

        {rows.map((p) => (
          <View key={p.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.partyName}>{p.name}</Text>
              <Text style={styles.meta}>{p.abbreviation}</Text>
            </View>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="0"
              value={counts[p.id] ?? ''}
              onChangeText={(t) => setVote(p.id, t)}
            />
          </View>
        ))}

        <Pressable onPress={onSubmit} disabled={saving || rows.length === 0} style={styles.btn}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Submit tally</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  hint: { fontSize: 14, color: colors.muted, marginBottom: space.lg, lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
    gap: space.md,
  },
  partyName: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  input: {
    width: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    paddingHorizontal: 10,
    fontSize: 18,
    textAlign: 'right',
    color: colors.text,
    backgroundColor: '#fafbfc',
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, padding: space.lg },
  card: { padding: space.lg },
  btn: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  blocked: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: space.lg },
})
