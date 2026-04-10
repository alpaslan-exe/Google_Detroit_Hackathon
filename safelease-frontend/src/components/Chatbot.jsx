import { useState, useRef, useEffect } from 'react'

export default function Chatbot({ result }) {
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading])

  const send = async () => {
    const message = input.trim()
    if (!message || loading) return

    const newHistory = [...history, { role: 'user', content: message }]
    setHistory(newHistory)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          address: result.address,
          score_data: {
            score: result.score,
            label: result.label,
            crime_count: result.crime_count,
            blight_count: result.blight_count,
            is_compliant: result.is_compliant,
          },
          history: history,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Chat request failed')
      setHistory([...newHistory, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setError(err.message)
      setHistory(newHistory)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chatbot">
      <div className="chatbot-header">
        <span className="ai-badge">💬 Ask the AI Tenant Advisor</span>
      </div>

      <div className="chatbot-messages">
        {history.length === 0 && (
          <p className="chatbot-empty">
            Ask anything about this property — compliance, crime data, your rights, or next steps.
          </p>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`chatbot-msg chatbot-msg--${msg.role}`}>
            <span className="chatbot-role">
              {msg.role === 'user' ? '🧑 You' : '✨ Advisor'}
            </span>
            <p className="chatbot-text">{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="chatbot-msg chatbot-msg--assistant chatbot-msg--loading">
            <span className="chatbot-role">✨ Advisor</span>
            <p className="chatbot-text chatbot-typing">
              <span /><span /><span />
            </p>
          </div>
        )}
        {error && <p className="error-msg">⚠️ {error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="chatbot-input-row">
        <input
          className="chatbot-input"
          type="text"
          placeholder="Ask a follow-up question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="search-btn chatbot-send-btn"
          onClick={send}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
