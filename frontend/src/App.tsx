import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { MoonIcon, SunIcon, UserIcon } from './components/Icons'
import { IdentityProvider, useIdentity } from './identity'
import Landing from './pages/Landing'
import RotationPage from './pages/RotationPage'
import { applyTheme, effectiveTheme, getTheme, setTheme } from './theme'

export default function App() {
  return (
    <IdentityProvider>
      <div className="page">
        <TopBar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/r/:token" element={<RotationPage />} />
          <Route path="*" element={<p className="muted center">Nothing here.</p>} />
        </Routes>
      </div>
    </IdentityProvider>
  )
}

function TopBar() {
  const { who, openProfile } = useIdentity()
  const [mode, setMode] = useState<'light' | 'dark'>(() => effectiveTheme())

  useEffect(() => {
    applyTheme(getTheme())
  }, [])

  function toggleTheme() {
    const next = mode === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setMode(next)
  }

  return (
    <nav className="topbar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Robin
      </Link>
      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className={`icon-btn profile${who ? ' named' : ''}`}
          onClick={openProfile}
          aria-label={who ? `You are ${who}. Change name` : 'Set your name'}
          title={who ? `You are ${who}` : 'Set your name'}
        >
          {who ? <span className="initial">{who.trim().charAt(0).toUpperCase()}</span> : <UserIcon />}
        </button>
      </div>
    </nav>
  )
}
