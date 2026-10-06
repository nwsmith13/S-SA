import { BookOpen, Files, House, ScanLine } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Brand } from './Brand'

const navigation = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/cleanup', label: 'Clean up', icon: Files },
  { to: '/library', label: 'Library', icon: BookOpen },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}>{label}</NavLink>
          ))}
        </nav>
        <div className="safety-note"><span aria-hidden="true">●</span> Originals stay untouched</div>
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
