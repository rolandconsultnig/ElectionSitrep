import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'

import { apiJson } from '@/lib/api'
import { captureOffline } from '@/lib/capture'

type Election = { slug: string; name: string; status: string }
type Party = { id: string; abbreviation: string; name: string; inecRegisterCode: string }

export default function VotingScreen() {
  const electionsQ = useQuery({
    queryKey: ['field-elections'],
    queryFn: () => apiJson<{ elections: Election[] }>('/api/field/elections'),
  })
  const [slug, setSlug] = useState('')
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const list = electionsQ.data?.elections
    if (!list?.length) return
    setSlug((s) => (s && list.some((e) => e.slug === s) ? s : list[0].slug))
  }, [electionsQ.data?.elections])

  const candQ = useQuery({
    queryKey: ['field-candidates', slug],
    queryFn: () =>
      apiJson<{ parties: Party[] }>(`/api/field/elections/${encodeURIComponent(slug)}/candidate-parties`),
    enabled: Boolean(slug),
  })

  const parties = candQ.data?.parties ?? []

  useEffect(() => {
    setVotes({})
  }, [slug])

  const payloadVotes = useMemo(
    () =>
      parties.map((p) => ({
        partyId: p.id,
        votes: Math.max(0, Math.floor(Number(votes[p.id]) || 0)),
      })),
    [parties, votes],
  )

  async function submit() {
    if (!slug) return
    setBusy(true)
    try {
      await captureOffline('vote_tally', {
        electionSlug: slug,
        votes: payloadVotes,
      })
      Alert.alert('Saved', 'Vote tally queued for sync when online.')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>Vote tally</Text>
      <Text style={styles.label}>Election</Text>
      <View style={styles.pick}>
        {(electionsQ.data?.elections ?? []).map((e) => (
          <Pressable key={e.slug} onPress={() => setSlug(e.slug)} style={[styles.opt, slug === e.slug && styles.optOn]}>
            <Text style={[styles.optTxt, slug === e.slug && styles.optTxtOn]}>{e.name}</Text>
          </Pressable>
        ))}
      </View>
      {!electionsQ.data?.elections?.length ? (
        <Text style={styles.muted}>No elections available.</Text>
      ) : null}
      {candQ.isLoading ? <Text style={styles.muted}>Loading candidates…</Text> : null}
      {parties.map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={styles.pname}>
            {p.abbreviation || p.name}{' '}
            <Text style={styles.pcode}>({p.inecRegisterCode})</Text>
          </Text>
          <TextInput
            keyboardType="number-pad"
            style={styles.num}
            value={votes[p.id] ?? ''}
            onChangeText={(t) => setVotes((prev) => ({ ...prev, [p.id]: t }))}
            placeholder="0"
            placeholderTextColor="#6b7a96"
          />
        </View>
      ))}
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy || !parties.length} onPress={submit}>
        <Text style={styles.btnText}>Save & queue sync</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1628' },
  inner: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#e8edf5', marginBottom: 16 },
  label: { fontSize: 12, color: '#8a9ab8', marginBottom: 8 },
  pick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  opt: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  optOn: { borderColor: '#0dccb0', backgroundColor: 'rgba(13,204,176,0.12)' },
  optTxt: { color: '#8a9ab8', fontSize: 13 },
  optTxtOn: { color: '#0dccb0', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  pname: { flex: 1, color: '#e8edf5', fontSize: 14 },
  pcode: { color: '#6b7a96', fontSize: 12 },
  num: {
    width: 88,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: 10,
    color: '#e8edf5',
    textAlign: 'right',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btn: { marginTop: 16, backgroundColor: '#0dccb0', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  btnText: { color: '#0a1628', fontWeight: '700' },
  muted: { color: '#6b7a96', marginBottom: 12 },
})
