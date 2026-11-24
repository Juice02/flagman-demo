import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Production builds get a Content-Security-Policy: scripts only from this site, network calls only to the
// FlagMan API, frames only of this site. Dev keeps no policy, because Vite's dev server uses inline scripts.
// frame-ancestors can't be set in a meta tag; the host sends it as a header (render.yaml in ../flagman).
function contentSecurityPolicy(apiUrl: string): Plugin {
  const policy = [
    "default-src 'self'", "script-src 'self'", "style-src 'self'",
    "font-src 'self'", "img-src 'self' data:", `connect-src ${new URL(apiUrl).origin}`,
    "frame-src 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ')
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_').VITE_FLAGMAN_API_URL || 'http://localhost:8081')],
  server: { port: 5174, strictPort: true },
  // Two pages: the stage (index.html) and Book Logger (app.html), which the stage embeds.
  build: { rollupOptions: { input: { stage: 'index.html', app: 'app.html' } } },
}))
