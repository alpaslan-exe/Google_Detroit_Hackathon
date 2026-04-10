const RISK_CONFIG = {
  'HIGH RISK':     { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', emoji: '🔴' },
  'MODERATE RISK': { color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', emoji: '🟡' },
  'LOW RISK':      { color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', emoji: '🟢' },
}

function ScoreBar({ label, score, max, color }) {
  const pct = Math.round((score / max) * 100)
  return (
    <div className="score-bar-row">
      <div className="score-bar-label">
        <span>{label}</span>
        <span className="score-bar-pts">{score}/{max} pts</span>
      </div>
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

export default function ScoreCard({ result }) {
  // Use dummy data if backend not ready yet
  const data = result || {
    score: 31,
    label: 'HIGH RISK',
    crime_count: 14,
    crime_score: 12,
    blight_count: 2,
    blight_score: 20,
    is_compliant: false,
    compliance_score: 0,
    address: '1234 Woodward Ave, Detroit, MI',
  }

  const cfg = RISK_CONFIG[data.label] || RISK_CONFIG['HIGH RISK']

  return (
    <div className="scorecard" style={{ borderColor: cfg.border, background: cfg.bg }}>
      <div className="scorecard-top">
        <div className="score-number-wrap">
          <span className="score-number" style={{ color: cfg.color }}>{data.score}</span>
          <span className="score-denom">/100</span>
        </div>
        <div className="score-right">
          <span className="risk-badge" style={{ background: cfg.color }}>
            {cfg.emoji} {data.label}
          </span>
          <p className="score-address">{data.address}</p>
        </div>
      </div>

      <div className="score-bars">
        <ScoreBar label="🚨 Crime (nearby, 90 days)" score={data.crime_score} max={40} color="#ef4444" />
        <ScoreBar label="🏚️ Blight Violations" score={data.blight_score} max={30} color="#f59e0b" />
        <ScoreBar
          label="📋 Rental Compliance"
          score={data.compliance_score}
          max={30}
          color={data.is_compliant ? '#22c55e' : '#ef4444'}
        />
      </div>

      <div className="score-pills">
        <span className="pill">🚨 {data.crime_count} incidents nearby</span>
        <span className="pill">🏚️ {data.blight_count} blight violations</span>
        <span className="pill" style={{ color: data.is_compliant ? '#16a34a' : '#dc2626' }}>
          {data.is_compliant ? '✅ Registered with city' : '❌ NOT registered with city'}
        </span>
      </div>
    </div>
  )
}
