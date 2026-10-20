import {
  ApiError,
  candidatePartiesRequest,
  fieldContextRequest,
  submitEc8aRequest,
} from '../lib/api'
import { getCurrentPosition } from '../lib/location'
import { colors, radii, space } from '../lib/theme'
import {
  Card,
  FieldInput,
  FieldLabel,
  LocalSessionBlocked,
  PrimaryButton,
  SectionLabel,
  StatusNote,
  useFieldSession,
} from '../components/field-ui'
import { PhotoCapture } from '../components/PhotoCapture'
import { useQuery } from '@tanstack/react-query'
import * as Crypto from 'expo-crypto'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function toInt(s: string): number {
  const n = Math.floor(Number(s.replace(/[^\d]/g, '') || '0'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export default function Ec8aScreen() {
  const { token, user, ready, localMode } = useFieldSession()
  const [registered, setRegistered] = useState('')
  const [accredited, setAccredited] = useState('')
  const [issued, setIssued] = useState('')
  const [used, setUsed] = useState('')
  const [spoiled, setSpoiled] = useState('')
  const [rejected, setRejected] = useState('')
  const [partyVotes, setPartyVotes] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const ctxQ = useQuery({
    queryKey: ['field-context', token],
    enabled: Boolean(token && !localMode),
    queryFn: () => fieldContextRequest(token!),
    staleTime: 5 * 60_000,
  })

  const electionSlug = ctxQ.data?.activeElections?.[0]?.slug ?? ''
  const puId = ctxQ.data?.assignment?.pollingUnit.id ?? null

  const partiesQ = useQuery({
    queryKey: ['parties', electionSlug, token],
    enabled: Boolean(token && !localMode && electionSlug),
    queryFn: () => candidatePartiesRequest(token!, electionSlug),
    staleTime: 10 * 60_000,
  })

  if (!ready) return null
  if (!token || !user) return <Redirect href="/login" />
  if (user.portalId !== 'field' || !user.onboardingComplete) return <Redirect href="/" />
  if (localMode) {
    return (
      <SafeAreaView style={styles.safe}>
        <LocalSessionBlocked feature="EC8A evidence & tally" />
      </SafeAreaView>
    )
  }

  const parties = partiesQ.data?.parties ?? []
  const validVotes = parties.reduce((acc, p) => acc + toInt(partyVotes[p.abbreviation] ?? ''), 0)
  const totalCast = validVotes + toInt(rejected)

  async function onSubmit() {
    if (!token || busy) return
    if (!puId) {
      setNote({ text: 'No polling unit assigned — EC8A evidence must be tied to your PU.', tone: 'error' })
      return
    }
    if (!electionSlug) {
      setNote({ text: 'No active election found on your account.', tone: 'error' })
      return
    }
    if (validVotes === 0) {
      setNote({ text: 'Enter votes for at least one party.', tone: 'error' })
      return
    }
    setBusy(true)
    setNote(null)
    try {
      // Tamper evidence: SHA-256 of the captured JPEG payload.
      let photoHashSha256 = ''
      if (photo) {
        const base64 = photo.split(',')[1] ?? ''
        if (base64) {
          photoHashSha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64)
        }
      }
      const pos = await getCurrentPosition()
      const votes: Record<string, number> = {}
      for (const p of parties) {
        const v = toInt(partyVotes[p.abbreviation] ?? '')
        if (v > 0) votes[p.abbreviation] = v
      }
      await submitEc8aRequest(token, {
        electionSlug,
        pollingUnitId: puId,
        registeredVoters: toInt(registered),
        accreditedVoters: toInt(accredited),
        ballotPapersIssued: toInt(issued),
        ballotPapersUsed: toInt(used),
        ballotPapersSpoiled: toInt(spoiled),
        ballotPapersRejected: toInt(rejected),
        validVotes,
        totalVotesCast: totalCast,
        partyVotes: votes,
        photoHashSha256: photoHashSha256 || undefined,
        photoSource: 'police',
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      })
      setNote({
        text: 'EC8A evidence submitted — mirrored to collation. Server-side anomaly checks (over-voting, arithmetic) run automatically.',
        tone: 'success',
      })
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : 'EC8A submission failed.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionLabel>EC8A evidence & tally (P2-02)</SectionLabel>
          <Text style={styles.muted}>
            {ctxQ.data?.assignment
              ? `${ctxQ.data.assignment.pollingUnit.name} (${ctxQ.data.assignment.pollingUnit.code}) · ${ctxQ.data.activeElections?.[0]?.name ?? ''}`
              : 'No polling unit assigned.'}{' '}
            Transcribe the signed Form EC8A exactly. The photo is hashed (SHA-256) as tamper evidence.
          </Text>
        </Card>

        {partiesQ.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            <Card>
              <SectionLabel>Voters & ballots</SectionLabel>
              <FieldLabel>Registered voters</FieldLabel>
              <FieldInput value={registered} onChangeText={setRegistered} keyboardType="number-pad" placeholder="0" />
              <FieldLabel>Accredited voters</FieldLabel>
              <FieldInput value={accredited} onChangeText={setAccredited} keyboardType="number-pad" placeholder="0" />
              <FieldLabel>Ballot papers issued</FieldLabel>
              <FieldInput value={issued} onChangeText={setIssued} keyboardType="number-pad" placeholder="0" />
              <FieldLabel>Ballot papers used</FieldLabel>
              <FieldInput value={used} onChangeText={setUsed} keyboardType="number-pad" placeholder="0" />
              <FieldLabel>Spoiled ballot papers</FieldLabel>
              <FieldInput value={spoiled} onChangeText={setSpoiled} keyboardType="number-pad" placeholder="0" />
              <FieldLabel>Rejected ballots</FieldLabel>
              <FieldInput value={rejected} onChangeText={setRejected} keyboardType="number-pad" placeholder="0" />
            </Card>

            <Card>
              <SectionLabel>Party votes</SectionLabel>
              {parties.map((p) => (
                <View key={p.id} style={styles.partyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partyName}>{p.name}</Text>
                    <Text style={styles.partyAbbr}>{p.abbreviation}</Text>
                  </View>
                  <View style={{ width: 96 }}>
                    <FieldInput
                      value={partyVotes[p.abbreviation] ?? ''}
                      onChangeText={(t) => setPartyVotes((s) => ({ ...s, [p.abbreviation]: t.replace(/[^\d]/g, '') }))}
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                  </View>
                </View>
              ))}
              <Text style={styles.totals}>
                Valid votes: {validVotes.toLocaleString()} · Total cast (incl. rejected): {totalCast.toLocaleString()}
              </Text>
            </Card>

            <Card>
              <SectionLabel>Photo of the signed EC8A</SectionLabel>
              <PhotoCapture value={photo} onChange={setPhoto} label="Photograph the EC8A form" />
              {photo ? (
                <Text style={styles.mutedSmall}>Photo attached — its SHA-256 hash will be stored as tamper evidence.</Text>
              ) : null}
            </Card>

            <PrimaryButton label="Submit EC8A evidence" onPress={() => void onSubmit()} busy={busy} />
            {note ? <StatusNote text={note.text} tone={note.tone} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl * 2 },
  center: { justifyContent: 'center', alignItems: 'center', padding: space.xl },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  mutedSmall: { fontSize: 13, color: colors.muted, marginTop: space.sm },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  partyName: { fontSize: 14, fontWeight: '600', color: colors.text },
  partyAbbr: { fontSize: 12, color: colors.muted },
  totals: { marginTop: space.md, fontSize: 14, fontWeight: '700', color: colors.primary },
})
