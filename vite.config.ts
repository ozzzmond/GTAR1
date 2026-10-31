import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // Stable environment resolution:
  // PROD mascot (red Bebeboy) is selected ONLY when explicitly requested via production target
  // (e.g. GTAR_ENV === 'production' or VITE_APP_ENV === 'production').
  // DEV mascot (yellow Bebegirl2) is the default active development and standard build branding.
  const appEnv = process.env.GTAR_ENV || process.env.VITE_APP_ENV || (mode === 'production-pwa' ? 'production' : 'development')
  const isProd = appEnv === 'production'

  const mascotPublicSubdir = isProd
    ? 'mascots/bebeboy-red-prod'
    : 'mascots/bebegirl2-yellow-dev'

  const mascotFiles: Record<string, string> = {
    'pwa-192x192.png': `${mascotPublicSubdir}/pwa-192.png`,
    'pwa-512x512.png': `${mascotPublicSubdir}/pwa-512.png`,
    'apple-touch-icon.png': `${mascotPublicSubdir}/apple-touch-icon-180.png`,
    'favicon-16x16.png': `${mascotPublicSubdir}/favicon-16x16.png`,
    'favicon-32x32.png': `${mascotPublicSubdir}/favicon-32x32.png`,
    'favicon-48x48.png': `${mascotPublicSubdir}/favicon-48x48.png`,
    'favicon.png': `${mascotPublicSubdir}/favicon-32x32.png`,
    'favicon.ico': `${mascotPublicSubdir}/favicon.ico`,
  }

  const mascotPlugin = (): Plugin => ({
    name: 'gtar1-mascot-icons',
    configureServer(server) {
      // Root icons have one owner; serve the same source files without public copies.
      server.middlewares.use((req, res, next) => {
        const targetName = new URL(req.url || '/', 'http://localhost').pathname.slice(1)
        if (!Object.hasOwn(mascotFiles, targetName)) return next()
        const sourceRelPath = mascotFiles[targetName]
        res.setHeader('Content-Type', targetName.endsWith('.ico') ? 'image/x-icon' : 'image/png')
        res.end(fs.readFileSync(path.resolve(projectRoot, 'public', sourceRelPath)))
      })
    },
    generateBundle() {
      for (const [targetName, sourceRelPath] of Object.entries(mascotFiles)) {
        const fullSourcePath = path.resolve(projectRoot, 'public', sourceRelPath)
        this.emitFile({
          type: 'asset',
          fileName: targetName,
          source: fs.readFileSync(fullSourcePath),
        })
      }
    },
  })

  return {
    define: {
      'import.meta.env.GTAR1_DEV_NATIVE_SEARCH': JSON.stringify(
        appEnv === 'development' && mode !== 'production-pwa'
      ),
      'import.meta.env.GTAR1_DEV_DIAGNOSTICS': JSON.stringify(
        appEnv === 'development' && mode !== 'production-pwa'
        && process.env.GTAR_ENV !== 'production' && process.env.VITE_APP_ENV !== 'production'
      ),
      'import.meta.env.GTAR1_APP_VERSION': JSON.stringify(JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version),
    },
    plugins: [
      tailwindcss(),
      react(),
      mascotPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        // Workbox hashes final output only. Public-file hashes can be stale when
        // an environment-specific icon is generated at the same URL.
        includeManifestIcons: false,
        manifest: {
          name: isProd ? 'GTAR — Local First Music Stand' : 'GTAR (Dev) — Local First Music Stand',
          short_name: isProd ? 'GTAR' : 'GTAR (Dev)',
          description: 'Standalone local-first ChordPro music stand and setlist manager',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
      }),
    ],
    server: {
      port: 5173,
    },
  }
})
