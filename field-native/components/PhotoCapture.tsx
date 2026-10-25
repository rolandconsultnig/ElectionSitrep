import { colors, radii, space } from '../lib/theme'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImageManipulator from 'expo-image-manipulator'
import * as Location from 'expo-location'
import { useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'

export type PhotoGeo = {
  lat: number
  lng: number
  accuracy: number | null
  capturedAt: string
}

/**
 * Evidence photo capture. Renders either a trigger button, a live camera, or a
 * preview of the captured JPEG. Calls onChange with a `data:image/jpeg;base64,…`
 * URL (or null when cleared) — the same payload shape the web portal sends.
 * Every capture is geotagged: GPS is read at shutter time and reported via onGeo.
 */
export function PhotoCapture({
  value,
  onChange,
  onGeo,
  label = 'Attach photo evidence',
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
  onGeo?: (geo: PhotoGeo | null) => void
  label?: string
}) {
  const cameraRef = useRef<CameraView>(null)
  const [perm, requestPerm] = useCameraPermissions()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geo, setGeo] = useState<PhotoGeo | null>(null)

  async function openCamera() {
    setError(null)
    if (!perm?.granted) {
      const req = await requestPerm()
      if (!req.granted) {
        setError('Camera permission denied — cannot attach evidence photo.')
        return
      }
    }
    setOpen(true)
  }

  async function capture() {
    if (!cameraRef.current || busy) return
    setBusy(true)
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: false })
      if (!photo?.uri) throw new Error('Camera did not return an image.')
      const manip = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 1280 } }], {
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      })
      if (!manip.base64) throw new Error('Could not encode photo.')
      // Geotag: read GPS at shutter time; a denied/failed fix still attaches the photo.
      let g: PhotoGeo | null = null
      try {
        const perm = await Location.getForegroundPermissionsAsync()
        if (perm.granted) {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          g = {
            lat: fix.coords.latitude,
            lng: fix.coords.longitude,
            accuracy: fix.coords.accuracy ?? null,
            capturedAt: new Date(fix.timestamp).toISOString(),
          }
        }
      } catch { /* geotag optional — never block the photo */ }
      setGeo(g)
      onChange(`data:image/jpeg;base64,${manip.base64}`)
      onGeo?.(g)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Photo capture failed.')
    } finally {
      setBusy(false)
    }
  }

  if (open) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" animateShutter={false} />
        <View style={styles.cameraBar}>
          <Pressable onPress={() => setOpen(false)} style={styles.cameraBtn}>
            <Text style={styles.cameraBtnText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={capture} style={[styles.cameraBtn, styles.cameraBtnPrimary]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.cameraBtnText}>Capture</Text>}
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    )
  }

  if (value) {
    return (
      <View style={{ marginTop: space.sm }}>
        <Image source={{ uri: value }} style={styles.preview} resizeMode="cover" />
        {geo ? (
          <Text style={styles.geoTag}>
            📍 {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}{geo.accuracy != null ? ` · ±${Math.round(geo.accuracy)}m` : ''}
          </Text>
        ) : (
          <Text style={[styles.geoTag, { color: colors.danger }]}>No GPS fix — photo not geotagged</Text>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <Pressable onPress={openCamera} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Retake</Text>
          </Pressable>
          <Pressable onPress={() => { onChange(null); onGeo?.(null); setGeo(null) }} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={{ marginTop: space.sm }}>
      <Pressable onPress={openCamera} style={styles.attachBtn}>
        <Text style={styles.attachBtnText}>📷 {label}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  cameraWrap: { marginTop: space.sm, borderRadius: radii.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  camera: { height: 320 },
  cameraBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: space.md,
    backgroundColor: colors.surface,
    gap: space.md,
  },
  cameraBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radii.sm, backgroundColor: colors.border },
  cameraBtnPrimary: { backgroundColor: colors.primary },
  cameraBtnText: { color: '#fff', fontWeight: '700' },
  preview: { width: '100%', height: 200, borderRadius: radii.md, backgroundColor: colors.border },
  smallBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  smallBtnText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  attachBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
  },
  attachBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, marginTop: space.sm, fontSize: 13 },
  geoTag: { color: colors.success, marginTop: 6, fontSize: 12, fontWeight: '600' },
})
