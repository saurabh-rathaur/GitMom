import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  /** Required for packaged Electron (`loadFile` → file://); absolute `/assets/...` would load blank. */
  base: './',
  plugins: [react()],
})
