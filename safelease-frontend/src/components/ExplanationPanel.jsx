const VERDICT = {
  'HIGH RISK':     { tone: 'high',     headline: 'DO NOT SIGN WITHOUT VERIFICATION' },
  'MODERATE RISK': { tone: 'moderate', headline: 'PROCEED WITH CAUTION' },
  'LOW RISK':      { tone: 'low',      headline: 'SIGNALS LOOK CLEAN' },
}

function splitReasons(text) {
  if (!text) return []
  const byNewline = text.split(/\n+/).map(s => s.trim()).filter(Boolean)
  if (byNewline.length >= 2) return byNewline
  const bySentence = text.match(/[^.!?]+[.!?]+/g)
  if (bySentence) return bySentence.map(s => s.trim()).filter(Boolean)
  return [text.trim()]
}

export default function ExplanationPanel({ explanation, label, isCompliant }) {
  const verdict = VERDICT[label] || VERDICT['HIGH RISK']
  const fallback = 'Awaiting advisor response. This section will render the plain-language legal summary once the scoring pipeline completes.'
  const reasons = splitReasons(explanation || fallback).slice(0, 4)

  return (
    <div className={`decision-panel ${verdict.tone}`}>
      <div className="decision-label">RISK ASSESSMENT</div>
      <div className="decision-verdict">{verdict.headline}</div>

      <ul className="decision-reasons">
        {reasons.map((reason, i) => (
          <li key={i} className="decision-reason">{reason}</li>
        ))}
      </ul>

      <div className="actions">
        <button type="button" className="action-btn">Generate Complaint Letter</button>
        <button type="button" className="action-btn">Request BSEED Inspection</button>
        {!isCompliant && (
          <button type="button" className="action-btn">Apply Rent Escrow</button>
        )}
      </div>
    </div>
  )
}
