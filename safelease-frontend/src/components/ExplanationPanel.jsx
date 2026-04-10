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
            <li>No BSEED rental registration was found near this address. Ask the landlord for a <strong>Certificate of Compliance</strong> and verify it directly with BSEED before signing.</li>
            <li>If the property turns out to be unregistered, you may have the right to <strong>withhold rent into escrow</strong> until violations are corrected.</li>
            <li>You can request an inspection: call <strong>313-224-2733</strong> or visit <a href="https://detroitmi.gov/bseed" target="_blank" rel="noreferrer">detroitmi.gov/bseed</a></li>
            <li>Contact <strong>Lakeshore Legal Aid</strong> for free tenant legal help: 1-888-783-8190</li>
          </ul>
        </div>
      )}
    </div>
  )
}
