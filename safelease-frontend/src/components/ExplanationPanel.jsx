export default function ExplanationPanel({ explanation, isCompliant }) {
  const dummyExplanation = `This property has a safety score of 31/100, indicating high risk for potential tenants. The most urgent issue is that the landlord has not registered with the city, which is required by Detroit's 2024 Rental Ordinance — this means the property has not been inspected for safety compliance. You can file a complaint by calling Detroit BSEED at 313-224-2733 or visiting detroitmi.gov/bseed.`

  const text = explanation || dummyExplanation

  return (
    <div className="explanation-panel">
      <div className="explanation-header">
        <span className="ai-badge">✨ AI Tenant Advisor</span>
      </div>
      <p className="explanation-text">{text}</p>

      {!isCompliant && (
        <div className="rights-box">
          <h3 className="rights-title">⚖️ Your Tenant Rights</h3>
          <ul className="rights-list">
            <li>This landlord is operating <strong>illegally</strong> under Detroit's 2024 Rental Registration Ordinance.</li>
            <li>You have the right to <strong>withhold rent into escrow</strong> until violations are corrected.</li>
            <li>You can file a complaint: call <strong>313-224-2733</strong> or visit <a href="https://detroitmi.gov/bseed" target="_blank" rel="noreferrer">detroitmi.gov/bseed</a></li>
            <li>Contact <strong>Lakeshore Legal Aid</strong> for free tenant legal help: 1-888-783-8190</li>
          </ul>
        </div>
      )}
    </div>
  )
}
