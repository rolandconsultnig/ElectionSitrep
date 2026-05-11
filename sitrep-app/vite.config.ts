import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5535,
    proxy: {
      '/api': {
        target: 'http://localhost:5530',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /** Avoid service worker interfering with Vite HMR / stale blank shells in dev */
      devOptions: { enabled: false },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'NPF Election SitRep — Field Portal',
        short_name: 'NPF SitRep Field',
        description:
          'Offline-first field reporting for Nigeria Police Force election security operations. NPF internal use only.',
        theme_color: '#0A1628',
        background_color: '#0A1628',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/field/',
        start_url: '/field/',
        icons: [
          { src: '/police.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/police.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 * 30 },
            },
          },
        ],
      },
    }),
  ],
})
