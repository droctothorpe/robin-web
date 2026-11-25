import { Link, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import RotationPage from './pages/RotationPage'

export default function App() {
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Robin
        </Link>
        <span className="muted small">Take turns, fairly.</span>
      </header>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/r/:token" element={<RotationPage />} />
        <Route path="*" element={<p className="card">Nothing here.</p>} />
      </Routes>
    </div>
  )
}
