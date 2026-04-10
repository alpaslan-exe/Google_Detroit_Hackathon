import { useEffect, useState } from 'react'
import AddressSearch from './components/AddressSearch'
import ScoreCard from './components/ScoreCard'
import ExplanationPanel from './components/ExplanationPanel'
import LeafletMap from './leafletMap'
import './App.css'

function App() {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [crimePoints, setCrimePoints] = useState([])
  const [crimePointsError, setCrimePointsError] = useState(null)

  // load crime_points.json once on app load
  useEffect(() => {
    let alive = true

    async function loadCrimePoints() {
      try {
        const res = await fetch('/crime_points.json')
        if (!res.ok) throw new Error(`Failed to load crime_points.json (${res.status})`)
        const data = await res.json()

        // your file shape: { feature_count, features: [...] }
        const feats = Array.isArray(data?.features) ? data.features : []

        if (alive) setCrimePoints(feats)
      } catch (e) {
        console.error(e)
        if (alive) setCrimePointsError(e.message)
      }
    }

    loadCrimePoints()
    return () => { alive = false }
  }, [])

  const handleSearch = async (address) => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/score_by_address?address=${encodeURIComponent(address)}`
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Address not found')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🏠</span>
            <span className="logo-text">Detroit <strong>SafeLease</strong></span>
          </div>
          <p className="tagline">Know before you sign.</p>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <h1 className="hero-title">Is your rental safe?</h1>
          <p className="hero-sub">
            Type any Detroit address to get a real-time safety score based on crime, blight violations, and rental compliance data.
          </p>
          <AddressSearch onSearch={handleSearch} loading={loading} />
          {error && <p className="error-msg">⚠️ {error}</p>}
          {crimePointsError && <p className="error-msg">⚠️ {crimePointsError}</p>}
        </section>

        {result && (
          <section className="map-section">
            <div className="map-card">
              <div className="map-header">
                <h2 className="map-title">Map</h2>
                <p className="map-subtitle">{result.address}</p>
              </div>

              <div className="map-frame">
                <LeafletMap result={result} crimePoints={crimePoints} />
              </div>
            </div>
          </section>
        )}

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <p>Checking city databases…</p>
          </div>
        )}

        {result && (
          <section className="results">
            <ScoreCard result={result} />
            <ExplanationPanel explanation={result.explanation} isCompliant={result.is_compliant} />
          </section>
        )}

        {!result && !loading && (
          <div className="stat-banner">
            <div className="stat">
              <span className="stat-num">82,000</span>
              <span className="stat-label">Detroit rental properties</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num" style={{ color: '#ef4444' }}>10%</span>
              <span className="stat-label">are compliant with city codes</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num">0</span>
              <span className="stat-label">tools to check before you move in</span>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>Data sourced from Detroit Open Data Portal · Updated daily · Built at Google × CSG × T4SG Hackathon 2026</p>
      </footer>
    </div>
  )
}

export default App