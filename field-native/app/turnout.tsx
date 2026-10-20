import { fieldContextRequest } from '../lib/api'
import { colors, radii, space } from '../lib/theme'
import { Card, LocalSessionBlocked, SectionLabel, useFieldSession } from '../components/field-ui'
import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function TurnoutScreen() {
  const { token, user, ready, localMode } = useFieldSession()

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    refetchInterval: 120_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="Voter turnout" />
      </SafeAreaView>
    )
  }

  const pulse = ctxQ.data?.nationalPulse
  const maxSubmissions = Math.max(1, ...(pulse?.submissions ?? [1]))
  const maxIncidents = Math.max(1, ...(pulse?.incidents ?? [1]))
  const totalSubmissions = (pulse?.submissions ?? []).reduce((a, b) => a + b, 0)
  const totalIncidents = (pulse?.incidents ?? []).reduce((a, b) => a + b, 0)

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <SectionLabel>Voter turnout pulse (M13)</SectionLabel>
          <Text style={styles.muted}>
            National picture of SitRep submissions and incident reports per reporting slot, as seen by Command. Your own
            accredited-voter figures feed this view through SitReps and the PU tally.
          </Text>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalSubmissions.toLocaleString()}</Text>
              <Text style={styles.statLabel}>SitRep submissions</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.danger }]}>{totalIncidents.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Incident reports</Text>
            </View>
          </View>
        </Card>

        {ctxQ.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.xl }} />
        ) : !pulse || pulse.labels.length === 0 ? (
          <Card>
            <Text style={styles.muted}>No national pulse data yet — it builds up as officers submit SitReps.</Text>
          </Card>
        ) : (
          <Card>
            <SectionLabel>Per reporting slot</SectionLabel>
            {pulse.labels.map((label, i) => {
              const subs = pulse.submissions[i] ?? 0
              const incs = pulse.incidents[i] ?? 0
              return (
                <View key={`${label}-${i}`} style={styles.barRow}>
                  <Text style={styles.barLabel}>{label}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${Math.max(2, (subs / maxSubmissions) * 100)}%` }]} />
                    {incs > 0 ? (
                      <View
                        style={[
                          styles.barFillIncident,
                          { width: `${Math.max(2, (incs / maxIncidents) * 100)}%` },
                        ]}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.barValue}>
                    {subs}
                    {incs > 0 ? ` · ⚠${incs}` : ''}
                  </Text>
                </View>
              )
            })}
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Submissions</Text>
              <View style={[styles.legendDot, { backgroundColor: colors.danger, marginLeft: space.md }]} />
              <Text style={styles.legendText}>Incidents</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  statRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  stat: {
    flex: 1,
    backgroundColor: colors.primaryMuted,
    borderRadius: radii.md,
    padding: space.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  barLabel: { width: 64, fontSize: 12, color: colors.muted, fontWeight: '600' },
  barTrack: { flex: 1, height: 14, backgroundColor: colors.border, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: 14, backgroundColor: colors.primary, borderRadius: 7 },
  barFillIncident: { height: 14, backgroundColor: colors.danger, marginTop: -14, opacity: 0.85, borderRadius: 7 },
  barValue: { width: 56, fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'right' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.muted, marginLeft: space.xs },
})
