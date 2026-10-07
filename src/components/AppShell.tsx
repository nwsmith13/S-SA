import { BookOpen, Files, House, ScanLine, UserCircle } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../services/AuthContext'
import { supabase } from '../services/supabase'

const navigation = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/cleanup', label: 'Clean up', icon: Files },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/account', label: 'Account', icon: UserCircle },
]

export function AppShell() {
  const { user } = useAuth()
  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}>{label}</NavLink>
          ))}
        </nav>
        <div className="header-account">{user ? <button type="button" onClick={() => void supabase?.auth.signOut()}>Sign out</button> : <NavLink to="/account">Sign in</NavLink>}<small><span aria-hidden="true">●</span> Originals stay untouched</small></div>
      </header>

      <main>
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
