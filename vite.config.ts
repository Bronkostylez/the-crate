import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE is set by the GitHub Actions workflow to /<repo-name>/ so the
// site works when served from a GitHub Pages project subpath.
// Locally it stays '/' so `npm run dev` and `npm run preview` just work.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
