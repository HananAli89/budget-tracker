// Small shared pieces: money input, progress bar, category icon.
import { useState } from 'react'
import { centsToInput, toCents } from '../lib/money'

// Text input for dollars that reports cents (or null while invalid). Big number pad on phones.
export function MoneyInput({ value, onChange, autoFocus, label, big, id }: {
  value: number | null; onChange: (c: number | null) => void; autoFocus?: boolean; label?: string; big?: boolean; id?: string
}) {
  const [text, setText] = useState(value === null ? '' : centsToInput(value))
  return (
    <div className={`money-input ${big ? 'big' : ''}`}>
      <span aria-hidden="true">$</span>
      <input id={id} inputMode="decimal" autoComplete="off" value={text} autoFocus={autoFocus} aria-label={label} placeholder="0.00"
        onChange={(e) => { setText(e.target.value); onChange(e.target.value.trim() ? toCents(e.target.value) : null) }} />
    </div>
  )
}

export function Bar({ percent, tone = 'accent', label }: { percent: number; tone?: 'accent' | 'green' | 'red' | 'amber' | 'blue'; label?: boolean }) {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className="bar-wrap">
      {label && <span className={`bar-pct tone-${tone}`}>{Math.round(p)}%</span>}
      <span className={`bar bar-${tone}`} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${p}%` }} />
      </span>
    </div>
  )
}

export function Bubble({ icon, tone = 'pink', size = 'md' }: { icon: string; tone?: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`bubble bubble-${tone} bubble-${size}`} aria-hidden="true">{icon}</span>
}

// Stable soft colour per item, so each category/goal keeps its colour.
const TONES = ['pink', 'purple', 'yellow', 'blue', 'green', 'orange', 'teal']
export const toneFor = (id: string) => TONES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]
