import { useCallback, useEffect, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

import { getApiBaseUrl } from '@/lib/config'
import { apiJson } from '@/lib/api'
import { pendingCount } from '@/lib/offline-queue'

type FieldContext = {
  officer: { displayName: string; serviceNumber: string | null }
  assignment: {
    pollingUnit: { code: string; name: string }
    ward: { name: string }
    lga: { name: string }
    state: { code: string; name: string }
  } | null
  geography: { pollingUnits: number }
  activeElections: { name: string }[]
}

export default function DashboardScreen() {
  const [baseOk, setBaseOk] = useState(() => Boolean(getApiBaseUrl()))
  useFocusEffect(
    useCallback(() => {
      setBaseOk(Boolean(getApiBaseUrl()))
    }, []),
  )
  const q = useQuery({
    queryKey: ['field-context'],
    queryFn: () => apiJson<FieldContext>('/api/field/context'),
    enabled: baseOk,
  })
  const [pending, setPending] = useState(0)

  const refreshPending = useCallback(() => {
    void pendingCount().then(setPending)
  }, [])

  useEffect(() => {
    refreshPending()
    const t = setInterval(refreshPending, 2000)
    return () => clearInterval(t)
  }, [refreshPending])

  const assign = q.data?.assignment

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.inner}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => void q.refetch()} tintColor="#0dccb0" />}
    >
      {!baseOk ? (
        <Text style={styles.warn}>Configure EXPO_PUBLIC_API_BASE_URL to load live context.</Text>
      ) : null}
      <Text style={styles.h1}>Field dashboard</Text>
      <Text style={styles.sub}>{q.data?.officer.displayName ?? '—'}</Text>
      <Text style={styles.meta}>
        {assign
          ? `${assign.pollingUnit.code} · ${assign.ward.name}, ${assign.lga.name}, ${assign.state.name}`
          : 'No PU assigned — ask admin to link your account.'}
      </Text>

      <View style={styles.grid}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>National PUs</Text>
          <Text style={styles.statVal}>{q.data ? q.data.geography.pollingUnits.toLocaleString() : '—'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Active elections</Text>
          <Text style={styles.statVal}>{q.data ? String(q.data.activeElections.length) : '—'}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Pending sync</Text>
          <Text style={[styles.statVal, styles.warnVal]}>{pending}</Text>
        </View>
      </View>

      <Text style={styles.footer}>Offline captures are stored on device and upload automatically when you reconnect.</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a1628' },
  inner: { padding: 20, paddingBottom: 40 },
  h1: { fontSize: 24, fontWeight: '700', color: '#e8edf5' },
  sub: { marginTop: 6, fontSize: 16, color: '#0dccb0', fontWeight: '600' },
  meta: { marginTop: 8, fontSize: 14, color: '#8a9ab8', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  stat: {
    flexGrow: 1,
    minWidth: '42%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: { fontSize: 11, color: '#6b7a96', textTransform: 'uppercase', letterSpacing: 0.6 },
  statVal: { marginTop: 8, fontSize: 22, fontWeight: '700', color: '#e8edf5' },
  warnVal: { color: '#f59e0b' },
  footer: { marginTop: 28, fontSize: 13, color: '#6b7a96', lineHeight: 18 },
  warn: { color: '#fbbf24', marginBottom: 12, fontSize: 13 },
})
