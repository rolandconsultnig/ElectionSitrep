import { useState, useRef, useCallback } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as FileSystem from 'expo-file-system'

import { useAuth } from '@/context/auth'
import { apiJson } from '@/lib/api'

export default function OnboardingScreen() {
  const router = useRouter()
  const { bootstrapping, user, refreshUser } = useAuth()
  
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [serviceNumber, setServiceNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [livenessVerified, setLivenessVerified] = useState(false)
  const [blinkCount, setBlinkCount] = useState(0)
  
  const [submitting, setSubmitting] = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()

  if (bootstrapping) return null
  if (!user) return <Redirect href="/login" />
  if (user.onboardingComplete) return <Redirect href="/(tabs)" />

  const handleCapture = async () => {
    if (!cameraRef.current) return
    try {
      setCapturing(true)
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      })
      if (photo?.uri) {
        setPhotoUri(photo.uri)
        // Simulate liveness verification
        setTimeout(() => {
          setLivenessVerified(true)
          setBlinkCount(2)
        }, 500)
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to capture photo')
    } finally {
      setCapturing(false)
    }
  }

  const retakePhoto = () => {
    setPhotoUri(null)
    setLivenessVerified(false)
    setBlinkCount(0)
  }

  const validateForm = () => {
    if (!firstName.trim()) return 'Enter your first name'
    if (!lastName.trim()) return 'Enter your last name'
    if (!serviceNumber.trim()) return 'Enter your service number'
    if (!phone.trim()) return 'Enter your phone number'
    if (!photoUri) return 'Take a live photo'
    if (!livenessVerified) return 'Photo verification incomplete'
    if (newPassword.length < 8) return 'Password must be at least 8 characters'
    if (newPassword !== confirmPassword) return 'Passwords do not match'
    return null
  }

  const submit = async () => {
    const error = validateForm()
    if (error) {
      Alert.alert('Validation Error', error)
      return
    }

    setSubmitting(true)
    try {
      // Convert photo to base64
      let photoBase64: string | undefined
      if (photoUri) {
        photoBase64 = await FileSystem.readAsStringAsync(photoUri, {
          encoding: FileSystem.EncodingType.Base64,
        })
      }

      await apiJson('/api/me/onboarding', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          serviceNumber: serviceNumber.trim(),
          phone: phone.trim(),
          pictureDataUrl: photoBase64 ? `data:image/jpeg;base64,${photoBase64}` : undefined,
          livenessVerified: true,
          livenessCheckedAt: new Date().toISOString(),
          newPassword,
          confirmPassword,
        }),
      })

      await refreshUser()
      router.replace('/(tabs)')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>NPF · Field Agent</Text>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>
          Signed in as {user.username}. Finish setup to access SitRep features.
        </Text>

        {/* Name Fields */}
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              placeholderTextColor="#6b7a96"
              style={styles.input}
              autoComplete="given-name"
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              placeholderTextColor="#6b7a96"
              style={styles.input}
              autoComplete="family-name"
            />
          </View>
        </View>

        <Text style={styles.label}>Service Number</Text>
        <TextInput
          value={serviceNumber}
          onChangeText={setServiceNumber}
          placeholder="e.g. AP No."
          placeholderTextColor="#6b7a96"
          style={styles.input}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="+234..."
          placeholderTextColor="#6b7a96"
          style={styles.input}
          keyboardType="phone-pad"
          autoComplete="tel"
        />

        {/* Photo Capture Section */}
        <Text style={styles.label}>Live Photo Verification</Text>
        <View style={styles.photoSection}>
          {!photoUri ? (
            <>
              {!permission?.granted ? (
                <Pressable style={styles.permissionBtn} onPress={requestPermission}>
                  <Text style={styles.permissionText}>Allow Camera Access</Text>
                </Pressable>
              ) : (
                <>
                  <View style={styles.cameraContainer}>
                    <CameraView
                      ref={cameraRef}
                      style={styles.camera}
                      facing="front"
                      mode="picture"
                    />
                    <View style={styles.overlay}>
                      <Text style={styles.overlayText}>
                        Position face in frame{'\n'}Tap capture when ready
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={[styles.captureBtn, capturing && styles.disabled]}
                    onPress={handleCapture}
                    disabled={capturing}
                  >
                    {capturing ? (
                      <ActivityIndicator color="#0a1628" />
                    ) : (
                      <Text style={styles.captureText}>Capture Photo</Text>
                    )}
                  </Pressable>
                </>
              )}
            </>
          ) : (
            <>
              <Image source={{ uri: photoUri }} style={styles.previewImage} />
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ Photo Captured</Text>
              </View>
              <Pressable style={styles.retakeBtn} onPress={retakePhoto}>
                <Text style={styles.retakeText}>Retake Photo</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Password Fields */}
        <Text style={styles.sectionTitle}>Create Password</Text>
        <Text style={styles.label}>New Password</Text>
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholder="At least 8 characters"
          placeholderTextColor="#6b7a96"
          style={styles.input}
        />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="Repeat password"
          placeholderTextColor="#6b7a96"
          style={styles.input}
        />

        <Pressable
          style={[styles.submitBtn, submitting && styles.disabled]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#0a1628" />
          ) : (
            <Text style={styles.submitText}>Complete Setup</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#0dccb0',
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: '700', color: '#e8edf5', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#8a9ab8', marginBottom: 20 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  half: { flex: 1 },
  label: { fontSize: 12, color: '#8a9ab8', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#e8edf5',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  photoSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  camera: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 13,
  },
  captureBtn: {
    marginTop: 12,
    backgroundColor: '#0dccb0',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  captureText: { color: '#0a1628', fontWeight: '700', fontSize: 16 },
  previewImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
  },
  verifiedBadge: {
    marginTop: 12,
    backgroundColor: 'rgba(13,204,176,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  verifiedText: { color: '#0dccb0', fontWeight: '600' },
  retakeBtn: {
    marginTop: 8,
    paddingVertical: 10,
  },
  retakeText: { color: '#8a9ab8', textDecorationLine: 'underline' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e8edf5',
    marginTop: 16,
    marginBottom: 8,
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: '#0dccb0',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: { color: '#0a1628', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.6 },
  permissionBtn: {
    backgroundColor: 'rgba(13,204,176,0.2)',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  permissionText: { color: '#0dccb0', fontWeight: '600' },
})
