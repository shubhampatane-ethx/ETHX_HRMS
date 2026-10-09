import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Fixed port so it never silently jumps to 5174/5175 when something
    // else is already using 5173. If 5180 is busy, Vite will error out
    // instead of switching - close whatever's on it and retry.
    port: 5180,
    strictPort: true,
    proxy: {
      // Proxies /api/* to your ERPNext/Frappe site during dev so session
      // cookies + CSRF work without CORS pain. Point target at your site.
      // Uploaded files (policies, letters, bills) are served by ERPNext from /files and /private
      '/files': { target: 'http://45.195.159.86:8280', changeOrigin: true, cookieDomainRewrite: 'localhost' },
      '/private': { target: 'http://45.195.159.86:8280', changeOrigin: true, cookieDomainRewrite: 'localhost' },
      '/api': {
        target: 'http://45.195.159.86:8280',
        changeOrigin: true,
        // ERPNext's Set-Cookie is scoped to its own host (45.195.159.86).
        // Rewrite it to the dev server's host so the browser actually
        // stores the session cookie for http://localhost:5180.
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})