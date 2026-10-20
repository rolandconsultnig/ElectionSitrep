import { partiesRequest } from '../lib/api'
import { colors, radii, space } from '../lib/theme'
import { Card, LocalSessionBlocked, SectionLabel, useFieldSession } from '../components/field-ui'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ReferenceScreen() {
  const { token, user, ready, localMode } = useFieldSession()

  const partiesQ = useQuery({
    queryKey: ['parties-ref', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => partiesRequest(token!),
    staleTime: 30 * 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="Parties & candidates reference" />
      </SafeAreaView>
    )
  }

  const parties = partiesQ.data?.parties ?? []

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <SectionLabel>Parties & candidates reference (M16)</SectionLabel>
          <Text style={styles.muted}>
            INEC-registered parties in register order. Use the abbreviation exactly as shown when transcribing Form
            EC8A or the PU tally.
          </Text>
        </Card>

        {partiesQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.xl }} />
        ) : partiesQ.isError ? (
          <Card>
            <Text style={styles.error}>Could not load parties — check your connection.</Text>
          </Card>
        ) : (
          parties.map((p, i) => (
            <View key={p.id} style={styles.row}>
              {p.logoDataUrl ? (
                <Image source={{ uri: p.logoDataUrl }} style={styles.logo} resizeMode="contain" />
              ) : (
                <View style={[styles.logo, styles.logoFallback]}>
                  <Text style={styles.logoFallbackText}>{p.abbreviation.slice(0, 3)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {i + 1}. {p.name}
                </Text>
                <Text style={styles.meta}>
                  {p.abbreviation} · INEC code {p.inecRegisterCode}
                  {p.status && p.status !== 'active' ? ` · ${p.status}` : ''}
                </Text>
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
  error: { color: colors.danger, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  logo: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.primaryMuted },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
})
