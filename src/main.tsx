import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { fontSize } from './lib/storage'
import './index.css'

// 舊版網站的網址（login.html、bp_reports.html、doctor.html、admin.html）還有人存了書籤或加在主畫面，
// 自動帶到新版對應的頁面。
const LEGACY: Record<string, string> = {
  'login.html': '/login',
  'bp_reports.html': '/history',
  'doctor.html': '/doctor',
  'admin.html': '/admin',
}
const legacyRoute = LEGACY[location.pathname.split('/').pop() ?? '']
if (legacyRoute) {
  location.replace(import.meta.env.BASE_URL + '#' + legacyRoute)
} else {
  fontSize.apply(fontSize.isLarge()) // 記住的字體大小，一開始就套用，畫面不會閃一下
  registerSW({ immediate: true }) // 有新版自動更新

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
