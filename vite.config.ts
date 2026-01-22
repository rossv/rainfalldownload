
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/rainfallldownload/',
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  },
  server: {
    proxy: {
      '/api/hrrr': {
        target: process.env.HRRR_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true
      },
      '/api/noaa': {
        target: 'https://www.ncdc.noaa.gov/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/noaa/, 'cdo-web/api/v2')
      },
      '/api/nominatim': {
        target: 'https://nominatim.openstreetmap.org/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nominatim/, 'search'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('User-Agent', 'rainfall-downloader/2.0');
          });
        }
      }
    }
  }
})
