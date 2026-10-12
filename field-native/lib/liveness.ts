import FaceDetection, { type FaceDetectionOptions } from '@react-native-ml-kit/face-detection'
import { Image } from 'react-native'

export type FrameSample = {
  uri: string
  faceCount: number
  minEyeOpen: number | null
  rotationY: number | null
  faceWidthFraction: number | null
}

const DETECTION_OPTS: FaceDetectionOptions = {
  performanceMode: 'fast',
  classificationMode: 'all',
  minFaceSize: 0.15,
}

function getImageWidth(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width) => resolve(width),
      () => resolve(null),
    )
  })
}

export async function sampleFrame(uri: string): Promise<FrameSample> {
  const faces = (await FaceDetection.detect(uri, DETECTION_OPTS)) ?? []
  if (faces.length !== 1) {
    return { uri, faceCount: faces.length, minEyeOpen: null, rotationY: null, faceWidthFraction: null }
  }
  const face = faces[0]
  const eyes = [face.leftEyeOpenProbability, face.rightEyeOpenProbability].filter(
    (value): value is number => typeof value === 'number',
  )
  const imageWidth = await getImageWidth(uri)
  const frameWidth = (face as unknown as { frame?: { width?: number } }).frame?.width
  return {
    uri,
    faceCount: 1,
    minEyeOpen: eyes.length ? Math.min(...eyes) : null,
    rotationY: typeof face.rotationY === 'number' ? face.rotationY : null,
    faceWidthFraction: imageWidth && frameWidth ? frameWidth / imageWidth : null,
  }
}
