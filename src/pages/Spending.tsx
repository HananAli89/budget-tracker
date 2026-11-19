import { useState } from 'react'
import { useData } from '../lib/store'
import { useSettings } from '../lib/settings'
import { categoryBudget, expensesIn, periodFor } from '../lib/budget'
import { addDays, formatDate, friendlyDate, todayISO } from '../lib/dates'
import { money, sum } from '../lib/money'
import { Bubble, toneFor } from '../components/bits'
import { useExpenseEditor } from '../components/ExpenseEditor'
import { EmptyState } from '../components/ui'
import { Icon } from '../components/Icon'

export function SpendingPage() {
  const d = useData()
  const s = useSettings()
  const { open } = useExpenseEditor()
  const [ref, setRef] = useState(todayISO())
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  if (!d) return null
  const period = periodFor(ref, s.paydayAnchor)
  const isCurrent = period.start === periodFor(todayISO(), s.paydayAnchor).start
  const rows = d.categories.map((c) => ({ c, ...categoryBudget(c, period, s.paydayAnchor, d.paycheques, d.expenses) }))
  const saved = sum(rows.filter((r) => r.left > 0 && r.budget > 0).map((r) => r.left))
  const over = sum(rows.filter((r) => r.left < 0).map((r) => -r.left))
  const catOf = (id: string) => d.categories.find((c) => c.id === id)
  const list = expensesIn(period, d.expenses)
    .filter((e) => !cat || e.categoryId === cat)
    .filter((e) => !q.trim() || e.note.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Spending</h1>
        <button className="btn btn-primary" onClick={() => open()}><Icon name="plus" size={16} /> Add expense</button>
      </header>

      <div className="period-nav card">
        <button className="icon-btn" onClick={() => setRef(addDays(period.start, -1))} aria-label="Previous pay period"><Icon name="left" /></button>
        <div className="center">
          <strong>{friendlyDate(period.start)} – {friendlyDate(period.end)}</strong>
          <div className="small muted">{isCurrent ? 'Current pay period' : 'Past pay period'}</div>
        </div>
        <button className="icon-btn" onClick={() => setRef(addDays(period.end, 1))} disabled={isCurrent} aria-label="Next pay period"><Icon name="right" /></button>
      </div>

      <section className="card">
        <table className="summary">
          <thead><tr><th>Category</th><th>Budget</th><th>Spent</th><th>Left</th></tr></thead>
          <tbody>
            {rows.map(({ c, budget, spent, left }) => (
              <tr key={c.id}>
                <td><Bubble icon={c.icon} tone={toneFor(c.id)} size="sm" /> {c.name}</td>
                <td>{money(budget)}</td>
                <td>{money(spent)}</td>
                <td className={left < 0 ? 'text-red' : budget > 0 ? 'text-green' : ''}>{left < 0 ? `−${money(-left)}` : money(left)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="summary-foot">
          <span className="text-green">{isCurrent ? 'Left so far' : 'Saved'}: {money(saved)}</span>
          {over > 0 && <span className="text-red">Over budget: {money(over)}</span>}
        </div>
      </section>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" aria-label="Search expenses" /></label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {d.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      {list.length === 0 ? <EmptyState title={q || cat ? 'No matching expenses' : 'No expenses this pay period'} text="Tap + to add one — it takes a few seconds." /> : (
        <div className="card list">
          {list.map((e) => {
            const c = catOf(e.categoryId)
            return (
              <button key={e.id} className="expense-row" onClick={() => open(e)}>
                <Bubble icon={c?.icon ?? '🏷️'} tone={toneFor(e.categoryId)} size="sm" />
                <span className="expense-text"><strong>{e.note || c?.name}</strong><span className="small muted">{c?.name} · {formatDate(e.date, s.dateFormat)}</span></span>
                <strong>{money(e.amount)}</strong>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
