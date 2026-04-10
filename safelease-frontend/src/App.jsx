import { useEffect, useRef, useState } from 'react'
import AddressSearch from './components/AddressSearch'
import ScoreCard from './components/ScoreCard'
import ExplanationPanel from './components/ExplanationPanel'
import Chatbot from './components/Chatbot'
import Landing from './components/Landing'
import LeafletMap from './leafletMap.jsx'
import './App.css'

const PURPOSES = [
  { id: 'rent',   label: 'RENT',   hint: 'LEGAL COMPLIANCE FOCUS' },
  { id: 'buy',    label: 'BUY',    hint: 'INVESTMENT RISK FOCUS' },
  { id: 'travel', label: 'TRAVEL', hint: 'SHORT-STAY SAFETY' },
  { id: 'work',   label: 'WORK',   hint: 'COMMUTE + PARKING' },
  { id: 'visit',  label: 'VISIT',  hint: 'HOURLY SNAPSHOT' },
]

const SIDEBAR_MIN = 360
const SIDEBAR_MAX = 900

function App() {
  const [launched, setLaunched] = useState(false)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [purpose, setPurpose] = useState('rent')
  const [sidebarWidth, setSidebarWidth] = useState(520)
  const [dragging, setDragging] = useState(false)
  const [crimePoints, setCrimePoints] = useState([])
  const [landingInput, setLandingInput] = useState('')
  const sidebarBodyRef = useRef(null)

  useEffect(() => {
    fetch('/crime_points.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return
        const features = Array.isArray(data?.features) ? data.features : Array.isArray(data) ? data : []
        setCrimePoints(features)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (result && sidebarBodyRef.current) {
      sidebarBodyRef.current.scrollTo({ top: 0 })
    }
  }, [result])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const maxAllowed = Math.min(SIDEBAR_MAX, window.innerWidth - 320)
      const next = Math.max(SIDEBAR_MIN, Math.min(maxAllowed, window.innerWidth - e.clientX))
      setSidebarWidth(next)
    }
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging])

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

  const handleSearchFromLanding = (raw) => {
    setLandingInput(raw)
    setLaunched(true)
    const full = raw.toLowerCase().includes('detroit') ? raw : `${raw}, Detroit, MI`
    handleSearch(full)
  }

  if (!launched) {
    return (
      <Landing
        onSearchFromLanding={handleSearchFromLanding}
        purpose={purpose}
        setPurpose={setPurpose}
      />
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <button
            type="button"
            className="logo logo-btn"
            onClick={() => { setLaunched(false); setResult(null); setError(null) }}
            aria-label="Return to home"
          >
            <span className="logo-text">STAY<strong>SIGNAL</strong></span>
          </button>
          <p className="tagline">TENANT SAFETY SYSTEM // V1</p>
        </div>
      </header>

      <div className="split-main">
        <div className="map-pane">
          <LeafletMap result={result} crimePoints={crimePoints} />
        </div>

        <div
          className={`divider ${dragging ? 'dragging' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setDragging(true) }}
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
        />

        <aside className="sidebar-pane" style={{ width: sidebarWidth }}>
          <div className="sidebar-search">
            <div className="purpose-tabs" role="tablist" aria-label="Search purpose">
              {PURPOSES.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={purpose === p.id}
                  className={`purpose-tab ${purpose === p.id ? 'active' : ''}`}
                  onClick={() => setPurpose(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="sidebar-label">QUERY // {PURPOSES.find(p => p.id === purpose).hint}</div>
            <h1 className="sidebar-title">Know the building before you decide.</h1>
            <AddressSearch
              onSearch={handleSearch}
              loading={loading}
              initialValue={landingInput}
            />
            {error && <p className="error-msg">{error}</p>}
          </div>

          <div className="sidebar-body" ref={sidebarBodyRef}>
            {loading && (
              <div className="loading">
                <div className="spinner" />
                <p>Checking city databases...</p>
              </div>
            )}

            {result && (
              <section className="results">
                <ScoreCard result={result} />
                <ExplanationPanel
                  explanation={result.explanation}
                  label={result.label}
                  isCompliant={result.is_compliant}
                />
                <Chatbot result={result} />
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
