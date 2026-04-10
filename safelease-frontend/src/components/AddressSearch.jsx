import { useState } from 'react'

export default function AddressSearch({ onSearch, loading }) {
  const [input, setInput] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const full = input.includes('Detroit') ? input : `${input.trim()}, Detroit, MI`
    onSearch(full)
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="search-box">
        <span className="search-icon">📍</span>
        <input
          className="search-input"
          type="text"
          placeholder="e.g. 1234 Woodward Ave"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button className="search-btn" type="submit" disabled={loading || !input.trim()}>
          {loading ? 'Checking…' : 'Check Safety'}
        </button>
      </div>
      <p className="search-hint">Detroit, MI is automatically appended</p>
    </form>
  )
}
