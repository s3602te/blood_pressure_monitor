import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 的網址是 https://s3602te.github.io/blood_pressure_monitor/，所以 base 要設成 repo 名稱
export default defineConfig({
  // 這次建置的版本標記（GitHub Actions 上是這次的 commit 編號），顯示在頁面最底下
  define: { __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev') },
  base: '/blood_pressure_monitor/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 有新版就自動換上，長輩不用做任何事
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.ico', 'icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '血壓記錄',
        short_name: '血壓記錄',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#f2f6f5',
        background_color: '#f2f6f5',
        lang: 'zh-Hant',
        icons: [
          { src: 'icons/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 舊版網站留在手機裡的快取（bp-app-cache-*）由這支小程式清掉
        importScripts: ['old-cache-cleanup.js'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // 字型：第一次載入後留在手機裡，之後離線也看得到
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
  },
})
