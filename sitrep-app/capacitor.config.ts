import type { CapacitorConfig } from '@capacitor/cli'

/** Native wrapper around the Vite `dist/` bundle — Field portal ships as Android APK. */
const config: CapacitorConfig = {
  appId: 'ng.gov.npf.sitrep.field',
  appName: 'NPF SitRep Field',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
