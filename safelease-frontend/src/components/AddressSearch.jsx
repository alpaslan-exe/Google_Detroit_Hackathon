import { useEffect, useState } from 'react'

export default function AddressSearch({ onSearch, loading, initialValue = '' }) {
  const [input, setInput] = useState(initialValue)

  useEffect(() => {
    if (initialValue) setInput(initialValue)
  }, [initialValue])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const full = input.includes('Detroit') ? input : `${input.trim()}, Detroit, MI`
    onSearch(full)
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="search-box">
        <input
          className="search-input"
          type="text"
          placeholder="> ENTER DETROIT ADDRESS"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button className="search-btn" type="submit" disabled={loading || !input.trim()}>
          {loading ? 'SCANNING' : 'RUN SCAN'}
        </button>
      </div>
      <p className="search-hint">// DETROIT, MI APPENDED AUTOMATICALLY</p>
    </form>
  )
}
