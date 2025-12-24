
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/rainfallldownload/',
  server: {
    proxy: {
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
