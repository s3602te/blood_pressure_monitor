import { lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './components/Layout'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import RecordPage from './pages/RecordPage'

// 圖表（Chart.js）比較大，只有打開歷史頁才下載，記錄頁開得更快
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const DoctorPage = lazy(() => import('./pages/DoctorPage'))

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
})

// 用 # 網址（例如 .../#/history），GitHub Pages 才不會在重新整理時找不到頁面
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route element={<Layout />}>
            <Route index element={<RecordPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="doctor" element={<DoctorPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
