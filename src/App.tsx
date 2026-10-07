import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { CleanupPage } from './pages/CleanupPage'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { ScanPage } from './pages/ScanPage'
import { AccountPage } from './pages/AccountPage'
import { LibraryDetailPage } from './pages/LibraryDetailPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { PasswordResetPage } from './pages/PasswordResetPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="cleanup" element={<CleanupPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/:documentId" element={<LibraryDetailPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="account/reset-password" element={<PasswordResetPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
      </Route>
    </Routes>
  )
}
