// Quick-add / edit expense form. Open it from anywhere with useExpenseEditor().
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Expense } from '../types'
import { addExpense, deleteExpense, updateExpense, useData } from '../lib/store'
import { isValidISODate, todayISO } from '../lib/dates'
import { MoneyInput } from './bits'
import { Modal, useUI } from './ui'
import { Icon } from './Icon'

const Ctx = createContext<{ open: (e?: Expense, categoryId?: string) => void } | null>(null)

export function useExpenseEditor() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useExpenseEditor must be inside ExpenseEditorProvider')
  return c
}

export function ExpenseEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ expense?: Expense; categoryId?: string; key: number } | null>(null)
  const open = useCallback((expense?: Expense, categoryId?: string) => setState({ expense, categoryId, key: Date.now() }), [])
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {state && <ExpenseForm key={state.key} expense={state.expense} categoryId={state.categoryId} onClose={() => setState(null)} />}
    </Ctx.Provider>
  )
}

function ExpenseForm({ expense, categoryId, onClose }: { expense?: Expense; categoryId?: string; onClose: () => void }) {
  const data = useData()
  const { toast, confirm } = useUI()
  const cats = data?.categories ?? []
  const [amount, setAmount] = useState<number | null>(expense?.amount ?? null)
  const [cat, setCat] = useState(expense?.categoryId ?? categoryId ?? '')
  const [date, setDate] = useState(expense?.date ?? todayISO())
  const [note, setNote] = useState(expense?.note ?? '')
  const [error, setError] = useState('')
  const chosen = cat || cats[0]?.id || ''

  async function save() {
    if (amount === null || amount <= 0) return setError('Enter an amount, like 12.50')
    if (!chosen) return setError('Add a spending category in Settings first.')
    if (!isValidISODate(date)) return setError('Pick a valid date.')
    if (expense) await updateExpense(expense.id, { amount, categoryId: chosen, date, note: note.trim() })
    else await addExpense({ amount, categoryId: chosen, date, note: note.trim() })
    toast(expense ? 'Expense saved' : 'Expense added')
    onClose()
  }

  async function remove() {
    if (!expense) return
    if (await confirm({ title: 'Delete expense?', message: 'This expense will be removed.', confirmLabel: 'Delete', danger: true })) {
      await deleteExpense(expense.id); toast('Expense deleted'); onClose()
    }
  }

  return (
    <Modal title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose} footer={
      <>
        {expense && <button className="btn btn-ghost-danger" onClick={remove}><Icon name="trash" size={16} /> Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>{expense ? 'Save' : 'Add'}</button>
      </>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <MoneyInput value={amount} onChange={setAmount} autoFocus big label="Amount" />
        <div className="cat-picker" role="radiogroup" aria-label="Category">
          {cats.map((c) => (
            <button type="button" key={c.id} role="radio" aria-checked={chosen === c.id} className={`cat-pill ${chosen === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
              <span>{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
        <div className="field-row">
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Note <em>(optional)</em></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Walmart" /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
