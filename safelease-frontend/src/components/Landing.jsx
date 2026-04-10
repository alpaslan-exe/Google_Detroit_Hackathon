import { useEffect, useRef, useState } from 'react'

const DATA_SOURCES = [
  {
    id: '01',
    name: 'CRIME',
    source: 'Detroit Police Department — RMS',
    desc: 'Reported incidents within a 500 meter radius over the last 90 days, queried live against the city\'s ArcGIS REST API. Zero caching between searches.',
  },
  {
    id: '02',
    name: 'BLIGHT',
    source: 'Department of Administrative Hearings',
    desc: 'Active unpaid violations within 300 meters — Responsible dispositions from the last 2 years with an outstanding balance. 27k filtered rows out of 816k raw.',
  },
  {
    id: '03',
    name: 'COMPLIANCE',
    source: 'BSEED Rental Registry',
    desc: 'Any registered rental record within 100 meters. A proxy signal, not a legal verdict — surfaces whether the building has entered the city system at all.',
  },
]

const PURPOSES = [
  { id: '01', label: 'RENT',   hint: 'Weights rental compliance and blight indicators; advisor frames around tenant rights and BSEED process.' },
  { id: '02', label: 'BUY',    hint: 'Weights property condition and neighborhood blight; advisor frames around investment risk and due diligence.' },
  { id: '03', label: 'TRAVEL', hint: 'Weights violent crime types and short-stay safety; advisor frames around walkability and arrival routing.' },
  { id: '04', label: 'WORK',   hint: 'Weights daytime crime patterns; advisor frames around parking, commuting, and surrounding businesses.' },
  { id: '05', label: 'VISIT',  hint: 'Quick hourly snapshot with lighter context; advisor answers focused questions about the immediate block.' },
]

function useCountUp(target, duration = 1800, active = true) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)
  useEffect(() => {
    if (!active || target == null) return
    cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, active])
  return value
}

function useIntersection(ref, threshold = 0.25) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, threshold])
  return visible
}

export default function Landing({ onLaunch }) {
  const statsRef = useRef(null)
  const statsVisible = useIntersection(statsRef)
  const rentals = useCountUp(124000, 1800, statsVisible)
  const compliant = useCountUp(8, 1400, statsVisible)

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-logo">
          STAY<strong>SIGNAL</strong>
        </div>
        <button className="landing-nav-btn" onClick={onLaunch}>
          LAUNCH SCANNER →
        </button>
      </nav>

      <section className="landing-hero">
        <div className="landing-eyebrow">STAYSIGNAL // DETROIT // V1</div>
        <h1 className="landing-title">
          Know the building<br />
          <span className="landing-title-accent">before you decide.</span>
        </h1>
        <p className="landing-sub">
          One address, three live public datasets, one verdict in under two seconds.
          No account, no tracking, no ads. Built for the person who actually has to sign,
          stay, or show up.
        </p>
        <button className="landing-cta" onClick={onLaunch}>
          <span className="landing-cta-prompt">&gt;</span>
          <span className="landing-cta-text">RUN A SCAN</span>
          <span className="landing-cta-cursor" />
        </button>
      </section>

      <section className="landing-section">
        <div className="landing-eyebrow">// DATA PIPELINE</div>
        <h2 className="landing-h2">
          Three Detroit datasets. Live-queried. Composed into one score.
        </h2>

        <div className="landing-sources">
          {DATA_SOURCES.map((s) => (
            <div key={s.id} className="landing-source">
              <div className="landing-source-num">{s.id}</div>
              <div className="landing-source-name">{s.name}</div>
              <div className="landing-source-src">{s.source}</div>
              <p className="landing-source-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-eyebrow">// PURPOSE MODES</div>
        <h2 className="landing-h2">
          Same data. Different lens.
        </h2>
        <p className="landing-sub landing-sub-inline">
          Pick the reason you are looking. The score weighting shifts to match, and the advisor reframes its answers accordingly.
        </p>

        <div className="landing-purposes">
          {PURPOSES.map((p) => (
            <div key={p.id} className="landing-purpose">
              <span className="landing-purpose-num">{p.id}</span>
              <span className="landing-purpose-label">{p.label}</span>
              <span className="landing-purpose-hint">{p.hint}</span>
            </div>
          ))}
        </div>
      </section>

      <section ref={statsRef} className="landing-section landing-stats-section">
        <div className="landing-eyebrow">// WHY IT EXISTS</div>
        <h2 className="landing-h2">
          The data exists. Nobody has the time to query it.
        </h2>

        <div className="landing-stat-row">
          <div className="landing-stat">
            <div className="landing-stat-num">{Math.round(rentals).toLocaleString()}</div>
            <div className="landing-stat-label">DETROIT RENTAL PROPERTIES</div>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat">
            <div className="landing-stat-num landing-stat-num--red">~{Math.round(compliant)}%</div>
            <div className="landing-stat-label">FULLY COMPLIANT WITH THE 2024 ORDINANCE</div>
          </div>
          <div className="landing-stat-divider" />
          <div className="landing-stat">
            <div className="landing-stat-num">0</div>
            <div className="landing-stat-label">TENANT-FACING TOOLS BEFORE THIS</div>
          </div>
        </div>

        <p className="landing-stat-caption">
          Detroit publishes crime, blight, and rental registration data every day. It sits in three
          separate government portals and nobody has stitched it together for the person about to sign a
          lease, check into a hotel, or park a car. StaySignal is the stitch.
        </p>
      </section>

      <section className="landing-final">
        <div className="landing-eyebrow">// READY</div>
        <h2 className="landing-h2 landing-final-h2">
          Scan any Detroit address.
        </h2>
        <button className="landing-cta landing-cta-final" onClick={onLaunch}>
          <span className="landing-cta-prompt">&gt;</span>
          <span className="landing-cta-text">RUN A SCAN</span>
          <span className="landing-cta-cursor" />
        </button>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-line">
          STAYSIGNAL // V1 // GOOGLE × CSG × T4SG HACKATHON // APRIL 2026
        </div>
        <div className="landing-footer-sub">
          Data sourced from the Detroit Open Data Portal. Scores are calibrated, not arbitrary.
          This is not legal advice.
        </div>
      </footer>
    </div>
  )
}
