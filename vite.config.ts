import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  // Two pages: the stage (index.html) and Book Logger (app.html), which the stage embeds.
  build: { rollupOptions: { input: { stage: 'index.html', app: 'app.html' } } },
})
