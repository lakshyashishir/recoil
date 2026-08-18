import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.RECOIL_API_URL || `http://${env.RECOIL_HOST || '127.0.0.1'}:${env.RECOIL_PORT || '8787'}`
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': apiTarget,
      },
    },
  }
})
