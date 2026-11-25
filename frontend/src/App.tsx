import { Link, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import RotationPage from './pages/RotationPage'

export default function App() {
  return (
    <div className="page">
      <nav className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Robin
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/r/:token" element={<RotationPage />} />
        <Route path="*" element={<p className="muted center">Nothing here.</p>} />
      </Routes>
    </div>
  )
}
