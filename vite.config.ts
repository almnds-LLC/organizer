import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import istanbul from 'vite-plugin-istanbul'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    // Enable Istanbul instrumentation for E2E coverage
    process.env.E2E_COVERAGE === 'true' && istanbul({
      include: 'src/**/*',
      exclude: ['node_modules', 'src/__tests__/**'],
      extension: ['.ts', '.tsx'],
      requireEnv: false,
    }),
  ].filter(Boolean),
  server: {
    allowedHosts: ['organize.almnds.com']
  }
})
