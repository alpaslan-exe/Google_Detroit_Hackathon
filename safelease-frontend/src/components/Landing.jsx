import { useEffect, useRef, useState } from 'react'

const PURPOSES = [
  { id: 'rent',   label: 'Rent' },
  { id: 'buy',    label: 'Buy' },
  { id: 'travel', label: 'Travel' },
  { id: 'work',   label: 'Work' },
  { id: 'visit',  label: 'Visit' },
]

export default function Landing({ onSearchFromLanding, purpose, setPurpose }) {
  const [input, setInput] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const landingRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    const el = landingRef.current
    if (!el) return
    const onScroll = () => setScrolled(el.scrollTop > 40)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const raw = input.trim()
    if (!raw) return
    onSearchFromLanding(raw)
  }

  const focusSearch = () => {
    searchRef.current?.focus()
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div ref={landingRef} className="landing">
      <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="landing-logo">
          Safe<strong>Stay</strong>
        </div>
        <div className="landing-nav-links">
          <a href="#how">How It Works</a>
          <a href="#cities">Cities</a>
          <a href="#about">About</a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-bg" />
        <div className="landing-hero-inner">
          <h1 className="landing-title">Know Before You Stay.</h1>
          <p className="landing-sub">
            Real crime data. Real compliance records. Any address.
          </p>

          <div className="landing-purposes">
            {PURPOSES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`landing-purpose ${purpose === p.id ? 'active' : ''}`}
                onClick={() => setPurpose(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <form className="landing-search" onSubmit={handleSubmit}>
            <input
              ref={searchRef}
              className="landing-search-input"
              type="text"
              placeholder="Enter any address..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="landing-search-btn"
              disabled={!input.trim()}
            >
              CHECK
            </button>
          </form>
        </div>
      </section>

      <section className="landing-features" id="how">
        <div className="landing-feature">
          <div className="landing-feature-title">Live Crime Data</div>
          <p className="landing-feature-desc">
            Pulled from city police departments, updated daily.
          </p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-title">Rental Compliance</div>
          <p className="landing-feature-desc">
            Know if your landlord is legally registered with the city.
          </p>
        </div>
        <div className="landing-feature">
          <div className="landing-feature-title">AI Legal Advisor</div>
          <p className="landing-feature-desc">
            Tenant rights guidance and complaint letters in seconds.
          </p>
        </div>
      </section>

      <section className="landing-stats" id="cities">
        <div className="landing-stats-inner">
          <div className="landing-stat-item">
            <span className="landing-stat-value">120,000+</span>
            <span className="landing-stat-name">Detroit rental properties</span>
          </div>
          <div className="landing-stat-sep">·</div>
          <div className="landing-stat-item">
            <span className="landing-stat-value">~8%</span>
            <span className="landing-stat-name">fully compliant</span>
          </div>
          <div className="landing-stat-sep">·</div>
          <div className="landing-stat-item">
            <span className="landing-stat-value">3</span>
            <span className="landing-stat-name">live data sources</span>
          </div>
          <div className="landing-stat-sep">·</div>
          <div className="landing-stat-item">
            <span className="landing-stat-value">DAILY</span>
            <span className="landing-stat-name">updated</span>
          </div>
        </div>
      </section>

      <section className="landing-impact" id="about">
        <p className="landing-impact-quote">
          <em>"Ca'Mya Davis was 11 months old."</em>
        </p>
        <p className="landing-impact-body">
          In 2024, an infant died in a Detroit rental property that had never
          been registered with the city. Her landlord was operating outside the
          law. Her mother had no way to know.
        </p>
        <p className="landing-impact-punchline">Don't rent blind.</p>
        <button
          type="button"
          className="landing-impact-cta"
          onClick={focusSearch}
        >
          CHECK YOUR ADDRESS
        </button>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-logo">
          Safe<strong>Stay</strong>
        </div>
        <div className="landing-footer-sources">
          DETROIT POLICE DEPT · BSEED · DAH · NOMINATIM
        </div>
        <div className="landing-footer-tag">
          Built for Detroit. Powered by public data.
        </div>
      </footer>
    </div>
  )
}
