import { useEffect, useRef, useState } from 'react'

const RISK_COLOR = {
  'HIGH RISK':     '#EF4444',
  'MODERATE RISK': '#F59E0B',
  'LOW RISK':      '#22C55E',
}

const PILLS = [
  {
    id: 'crime',
    label: 'CRIMES // 500M // 90D',
    getValue: (d) => `×${d.crime_count}`,
    definition:
      'Count of reported crime incidents within a 500 meter radius of the searched address during the last 90 days.',
    sourceName: 'Detroit Police Department — RMS Crime Incidents',
    sourceDetail:
      'Queried live from the Detroit Open Data Portal (ArcGIS REST Feature Service). Includes all reported incidents, not weighted by severity.',
  },
  {
    id: 'blight',
    label: 'BLIGHT // 300M // ACTIVE',
    getValue: (d) => `×${d.blight_count}`,
    definition:
      'Active unpaid blight violations within 300 meters. Filtered to "Responsible" dispositions issued in the last 2 years with an outstanding balance.',
    sourceName: 'Detroit Department of Administrative Hearings (DAH)',
    sourceDetail:
      'Full violations CSV downloaded daily from apis.detroitmi.gov and filtered in memory. ~97% of historical tickets are dropped to surface only currently-active problems.',
  },
  {
    id: 'compliance',
    label: 'BSEED REGISTRATION // 100M',
    getValue: (d) => (d.is_compliant ? 'FOUND' : 'NOT FOUND'),
    getValueColor: (d) => (d.is_compliant ? '#22C55E' : '#EF4444'),
    definition:
      'Whether any BSEED rental registration record exists within 100 meters of the address. Indicates the building has entered the city rental registry, which is required before a unit can be legally rented in Detroit.',
    sourceName: 'BSEED — Rental Registrations (Combined)',
    sourceDetail:
      'Queried live from the Detroit Open Data Portal (ArcGIS REST). This is a proxy signal, not a legal verdict on Certificate of Compliance status — verify with BSEED before signing.',
  },
]

function useCountUp(target, duration = 1500) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)
  useEffect(() => {
    if (target == null) return
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
  }, [target, duration])
  return value
}

function Gauge({ score, color }) {
  const size = 240
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2 - 10
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75
  const animated = useCountUp(score)
  const progress = Math.min(Math.max(animated, 0), 100) / 100
  const dashOffset = arcLength - arcLength * progress

  const ticks = []
  for (let i = 0; i <= 10; i++) {
    const angle = 135 + (i * 270) / 10
    const rad = (angle * Math.PI) / 180
    const inner = radius - 6
    const outer = radius + strokeWidth / 2 + 4
    ticks.push(
      <line
        key={i}
        x1={size / 2 + inner * Math.cos(rad)}
        y1={size / 2 + inner * Math.sin(rad)}
        x2={size / 2 + outer * Math.cos(rad)}
        y2={size / 2 + outer * Math.sin(rad)}
        stroke="rgba(148, 163, 184, 0.25)"
        strokeWidth={i % 5 === 0 ? 2 : 1}
      />
    )
  }

  return (
    <div className="gauge">
      <svg width={size} height={size}>
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {ticks}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.08)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
          filter="url(#glow)"
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-number" style={{ color }}>
          {animated.toFixed(0)}
        </div>
        <div className="gauge-denom">/100</div>
        <div className="gauge-label">SAFETY INDEX</div>
      </div>
    </div>
  )
}

export default function ScoreCard({ result }) {
  const data = result || {
    score: 31,
    label: 'HIGH RISK',
    crime_count: 14,
    blight_count: 2,
    is_compliant: false,
    address: '1234 WOODWARD AVE',
  }
  const color = RISK_COLOR[data.label] || RISK_COLOR['HIGH RISK']
  const [openPill, setOpenPill] = useState(null)

  const togglePill = (id) => setOpenPill((prev) => (prev === id ? null : id))

  return (
    <div className="scorecard">
      <div className="scorecard-header">
        <span className="scorecard-label">// SCAN RESULT</span>
        <span className="risk-badge" style={{ color }}>
          {data.label}
        </span>
      </div>

      <div className="gauge-wrap">
        <Gauge score={data.score} color={color} />
      </div>

      <div className="score-pills">
        {PILLS.map((pill) => {
          const isOpen = openPill === pill.id
          const value = pill.getValue(data)
          const valueStyle = pill.getValueColor ? { color: pill.getValueColor(data) } : {}
          return (
            <div key={pill.id} className={`pill-wrap ${isOpen ? 'open' : ''}`}>
              <button
                type="button"
                className="pill pill-btn"
                onClick={() => togglePill(pill.id)}
                aria-expanded={isOpen}
                aria-controls={`pill-drawer-${pill.id}`}
              >
                <span className="pill-label">{pill.label}</span>
                <span className="pill-value" style={valueStyle}>
                  {value}
                </span>
              </button>
              {isOpen && (
                <div id={`pill-drawer-${pill.id}`} className="pill-drawer">
                  <div className="pill-drawer-row">
                    <span className="pill-drawer-key">DEFINITION</span>
                    <p className="pill-drawer-text">{pill.definition}</p>
                  </div>
                  <div className="pill-drawer-row">
                    <span className="pill-drawer-key">SOURCE</span>
                    <p className="pill-drawer-text">{pill.sourceName}</p>
                    <p className="pill-drawer-sub">{pill.sourceDetail}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
