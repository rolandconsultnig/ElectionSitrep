import { onboardingRequest } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { isLocalSessionToken } from '../lib/local-session'
import { colors, radii, space } from '../lib/theme'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImageManipulator from 'expo-image-manipulator'
import { Redirect } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function OnboardingScreen() {
  const { token, user, ready, refreshUser } = useAuth()
  const cameraRef = useRef<CameraView>(null)
  const [perm, requestPerm] = useCameraPermissions()

  const [fullName, setFullName] = useState('')
  const [serviceNumber, setServiceNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [jpegDataUrl, setJpegDataUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)

  useEffect(() => {
    const p = user?.profile
    if (!p) return
    setFullName(p.name ?? '')
    setServiceNumber(p.serviceNumber ?? '')
    setPhone(p.phone ?? '')
    if (p.pictureDataUrl?.startsWith('data:image/jpeg') || p.pictureDataUrl?.startsWith('data:image/png')) {
      setJpegDataUrl(p.pictureDataUrl)
    }
  }, [user?.id])

  if (!ready || !token) return null
  if (isLocalSessionToken(token)) return <Redirect href="/" />
  if (!user || user.portalId !== 'field') return <Redirect href="/login" />
  if (user.onboardingComplete && !user.passwordMustChange) return <Redirect href="/" />

  const needPassword = !user.onboardingComplete || user.passwordMustChange

  async function capturePhoto() {
    setError(null)
    if (!cameraRef.current) return
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.88 })
      if (!photo?.uri) throw new Error('Camera did not return an image.')
      const manip = await ImageManipulator.manipulateAsync(photo.uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      })
      if (!manip.base64) throw new Error('Could not encode photo.')
      setJpegDataUrl(`data:image/jpeg;base64,${manip.base64}`)
      setShowCamera(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo capture failed.')
    }
  }

  async function onSave() {
    setError(null)
    if (!fullName.trim() || !serviceNumber.trim() || !phone.trim()) {
      setError('Name, service number, and phone are required.')
      return
    }
    const picOk =
      jpegDataUrl &&
      (jpegDataUrl.startsWith('data:image/jpeg') || jpegDataUrl.startsWith('data:image/png'))
    if (!picOk) {
      setError('Add a profile photo (JPEG from camera, or PNG/JPEG from your existing profile).')
      return
    }
    if (needPassword) {
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters.')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    const authToken = token
    if (!authToken) return

    setBusy(true)
    try {
      await onboardingRequest(authToken, {
        fullName: fullName.trim(),
        serviceNumber: serviceNumber.trim(),
        phone: phone.trim(),
        pictureDataUrl: jpegDataUrl as string,
        livenessVerified: true,
        livenessCheckedAt: new Date().toISOString(),
        ...(needPassword ? { newPassword, confirmPassword } : {}),
      })
      await refreshUser()
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Save failed.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  if (!perm?.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Camera access</Text>
          <Text style={styles.body}>We need the camera once for your verification photo (JPEG).</Text>
          <Pressable onPress={() => requestPerm()} style={styles.btn}>
            <Text style={styles.btnText}>Allow camera</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  if (showCamera) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
        <SafeAreaView style={styles.camBar}>
          <Pressable onPress={() => setShowCamera(false)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={capturePhoto} style={styles.btn}>
            <Text style={styles.btnText}>Capture</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>One-time setup</Text>
        <Text style={styles.title}>Officer profile</Text>
        <Text style={styles.body}>Details must match your service records. Photo is stored as JPEG.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Full name</Text>
          <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />

          <Text style={[styles.label, { marginTop: space.md }]}>Service number</Text>
          <TextInput value={serviceNumber} onChangeText={setServiceNumber} style={styles.input} />

          <Text style={[styles.label, { marginTop: space.md }]}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />

          {needPassword ? (
            <>
              <Text style={[styles.label, { marginTop: space.md }]}>New password</Text>
              <TextInput
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                style={styles.input}
              />
              <Text style={[styles.label, { marginTop: space.md }]}>Confirm password</Text>
              <TextInput
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={styles.input}
              />
            </>
          ) : null}

          <Text style={[styles.label, { marginTop: space.md }]}>Verification photo</Text>
          <Pressable onPress={() => setShowCamera(true)} style={styles.photoBtn}>
            <Text style={styles.photoBtnText}>{jpegDataUrl ? 'Retake photo (JPEG)' : 'Take photo (JPEG)'}</Text>
          </Pressable>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          <Pressable onPress={onSave} disabled={busy} style={[styles.btn, busy && { opacity: 0.75 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save and continue</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl },
  center: { flex: 1, justifyContent: 'center', padding: space.lg },
  kicker: { fontSize: 13, color: colors.muted, marginBottom: space.xs, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.muted, marginTop: space.sm, marginBottom: space.lg, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: space.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fafbfc',
  },
  photoBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
  },
  photoBtnText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  err: { color: colors.danger, marginTop: space.md, fontSize: 14 },
  btn: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  camBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: '#111',
  },
  secondary: { padding: space.sm },
  secondaryText: { color: '#ccc', fontSize: 16 },
})
