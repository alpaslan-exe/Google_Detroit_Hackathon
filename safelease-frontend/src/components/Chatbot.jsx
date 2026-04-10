import { useEffect, useRef, useState } from 'react'

function renderInline(text, keyPrefix) {
  const parts = []
  const boldRe = /\*\*([^*]+)\*\*/g
  let last = 0
  let match
  let i = 0
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<strong key={`${keyPrefix}-b${i++}`}>{match[1]}</strong>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function renderMessage(text) {
  const lines = text.split('\n')
  return lines.map((rawLine, idx) => {
    const stripped = rawLine.replace(/\s+$/, '')
    if (stripped.trim() === '') {
      return <div key={idx} className="chatbot-gap" />
    }
    const bullet = /^\s*[-*]\s+/.test(stripped)
    const heading = /^\s*#{1,6}\s+/.test(stripped)
    const content = stripped
      .replace(/^\s*[-*]\s+/, '')
      .replace(/^\s*#{1,6}\s+/, '')
    const cls = ['chatbot-line']
    if (bullet) cls.push('bullet')
    if (heading) cls.push('heading')
    return (
      <div key={idx} className={cls.join(' ')}>
        {renderInline(content, `l${idx}`)}
      </div>
    )
  })
}

export default function Chatbot({ result }) {
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const messagesRef = useRef(null)

  useEffect(() => {
    if (history.length === 0 && !loading) return
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
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
            place_class: result.place_class,
            place_type: result.place_type,
          },
          history,
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
        <span className="scorecard-label">// SECURE LINE</span>
        <span className="ai-badge">LIVE SESSION</span>
      </div>

      <div className="chatbot-messages" ref={messagesRef}>
        {history.length === 0 && !loading && (
          <p className="chatbot-empty">
            Ask anything about this property or the surrounding area. You can reference the score, the raw data, or ask for context the numbers do not show.
          </p>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`chatbot-msg chatbot-msg--${msg.role}`}>
            <span className="chatbot-role">
              {msg.role === 'user' ? '> YOU' : '[AI]'}
            </span>
            <div className="chatbot-text">{renderMessage(msg.content)}</div>
          </div>
        ))}

        {loading && (
          <div className="chatbot-msg chatbot-msg--assistant chatbot-msg--loading">
            <span className="chatbot-role">[AI]</span>
            <div className="chatbot-text chatbot-typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}
      </div>

      <div className="chatbot-input-row">
        <input
          className="chatbot-input"
          type="text"
          placeholder="> ASK A FOLLOW-UP"
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
          SEND
        </button>
      </div>
    </div>
  )
}
