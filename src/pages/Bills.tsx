import { useState } from 'react'
import { BILL_CATEGORIES, type Bill, type BillCategory, type Loan } from '../types'
import { deleteBill, deleteLoan, markPaid, saveBill, saveLoan, undoPayment, useData } from '../lib/store'
import { useSettings } from '../lib/settings'
import { addMonths, billStatus, billsPot, dueDateIn, loanBalance, monthOf, monthlyBillsTotal, monthsToPayOff, readiness } from '../lib/budget'
import { friendlyDate, todayISO } from '../lib/dates'
import { money, pct } from '../lib/money'
import { Bar, MoneyInput } from '../components/bits'
import { EmptyState, Modal, useUI } from '../components/ui'
import { Icon } from '../components/Icon'

const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })

export function BillsPage() {
  const d = useData()
  const s = useSettings()
  const { toast, confirm } = useUI()
  const today = todayISO()
  const [month, setMonth] = useState(monthOf(today))
  const [editBill, setEditBill] = useState<Bill | 'new' | null>(null)
  const [editLoan, setEditLoan] = useState<Loan | 'new' | null>(null)
  if (!d) return null

  const active = d.bills.filter((b) => b.active)
  const pot = billsPot(s.startingPot, d.paycheques, d.billPayments)
  const ready = readiness(today, pot, d.bills, d.billPayments)

  async function pay(b: Bill) {
    await markPaid(b, month, b.amount, month === monthOf(today) ? today : dueDateIn(month, b.dueDay))
    toast(`${b.name} marked paid`)
  }
  async function undo(b: Bill) {
    const p = d!.billPayments.find((x) => x.billId === b.id && x.month === month)
    if (!p) return
    if (await confirm({ title: 'Undo payment?', message: `${b.name} for ${monthLabel(month)} will go back to unpaid.${p.auto ? ' AutoPay won’t re-mark it this month.' : ''}`, confirmLabel: 'Undo' })) {
      await undoPayment(p); toast('Payment undone')
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Bills &amp; loans</h1>
        <button className="btn btn-primary" onClick={() => setEditBill('new')}><Icon name="plus" size={16} /> Add bill</button>
      </header>

      <div className="stats">
        <div className="stat"><span className="stat-label">Monthly bills</span><span className="stat-value">{money(monthlyBillsTotal(d.bills))}</span></div>
        <div className="stat"><span className="stat-label">Bills pot</span><span className="stat-value">{money(pot)}</span></div>
        <div className="stat"><span className="stat-label">Ready for {friendlyDate(ready.nextFirst).split(', ')[1]}</span><span className="stat-value">{pct(ready.ready, ready.need)}%</span></div>
      </div>

      <section className="card">
        <div className="card-title-row">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon name="left" /></button>
          <h2 className="card-title center">{monthLabel(month)}</h2>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon name="right" /></button>
        </div>
        {active.length === 0 ? <EmptyState title="No bills yet" text="Add each monthly bill once — it repeats every month." /> : (
          <div className="list">
            {active.map((b) => {
              const st = billStatus(b, month, d.billPayments, today)
              const p = d.billPayments.find((x) => x.billId === b.id && x.month === month)
              const paid = st.status === 'paid' || st.status === 'auto-paid'
              return (
                <div key={b.id} className={`bill-row status-${st.status}`}>
                  <button className="bill-main" onClick={() => setEditBill(b)}>
                    <span className="bill-icon">{b.icon}</span>
                    <span className="bill-text">
                      <strong>{b.name}</strong>
                      <span className="small muted">Due {friendlyDate(st.due)}{b.autoPay && <span className="tag">Auto</span>}</span>
                    </span>
                    <strong className="bill-amt">{money(b.amount)}</strong>
                  </button>
                  {paid ? (
                    <button className="status-chip chip-paid" onClick={() => undo(b)} title="Undo">
                      <Icon name="check" size={14} /> {st.status === 'auto-paid' ? 'Auto-paid' : 'Paid'} {p && friendlyDate(p.paidOn).split(', ')[1]}
                    </button>
                  ) : (
                    <button className={`btn btn-sm ${st.status === 'overdue' ? 'btn-danger' : ''}`} onClick={() => pay(b)}>
                      {st.status === 'overdue' ? 'Overdue · Mark paid' : 'Mark paid'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <div className="section-head"><h2>Loans</h2><button className="btn btn-sm" onClick={() => setEditLoan('new')}><Icon name="plus" size={14} /> Add loan</button></div>
        {d.loans.length === 0 ? <p className="muted small">Add a loan to track its balance and payoff date.</p> : (
          <div className="cards-grid">
            {d.loans.map((l) => {
              const bal = loanBalance(l, d.billPayments)
              const bill = d.bills.find((b) => b.id === l.billId)
              const months = bill ? monthsToPayOff(bal, bill.amount, l.interestRate) : null
              const paidOff = l.startingBalance - bal
              return (
                <button key={l.id} className="card goal-card" onClick={() => setEditLoan(l)}>
                  <h3>🏦 {l.name}</h3>
                  <p className="big-line"><strong>{money(bal)}</strong> <span className="muted">left</span></p>
                  <Bar percent={pct(paidOff, l.startingBalance)} tone="green" label />
                  <p className="small muted">
                    {bal === 0 ? 'Paid off 🎉' : !bill ? 'Link a monthly bill to track payments'
                      : months === null ? 'Payment doesn’t cover the interest'
                      : `${money(bill.amount)}/month · paid off around ${monthLabel(addMonths(monthOf(today), months)).replace(/^(\w{3})\w*/, '$1')}`}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {editBill && <BillForm bill={editBill === 'new' ? undefined : editBill} onClose={() => setEditBill(null)} onDelete={async (b) => {
        if (await confirm({ title: `Delete ${b.name}?`, message: 'The bill and its payment history will be removed.', confirmLabel: 'Delete', danger: true })) {
          await deleteBill(b.id); toast('Bill deleted'); setEditBill(null)
        }
      }} />}
      {editLoan && <LoanForm loan={editLoan === 'new' ? undefined : editLoan} bills={d.bills} onClose={() => setEditLoan(null)} onDelete={async (l) => {
        if (await confirm({ title: `Delete ${l.name}?`, message: 'The loan will be removed. Its bill stays.', confirmLabel: 'Delete', danger: true })) {
          await deleteLoan(l.id); toast('Loan deleted'); setEditLoan(null)
        }
      }} />}
    </div>
  )
}

const BILL_ICONS = ['🏠', '📱', '🌐', '💡', '🏦', '🎓', '🚌', '🛡️', '📺', '🧾']

function BillForm({ bill, onClose, onDelete }: { bill?: Bill; onClose: () => void; onDelete: (b: Bill) => void }) {
  const { toast } = useUI()
  const today = todayISO()
  const [name, setName] = useState(bill?.name ?? '')
  const [icon, setIcon] = useState(bill?.icon ?? '🧾')
  const [amount, setAmount] = useState<number | null>(bill?.amount ?? null)
  const [dueDay, setDueDay] = useState(String(bill?.dueDay ?? ''))
  const [category, setCategory] = useState<BillCategory>(bill?.category ?? 'Housing')
  const [autoPay, setAutoPay] = useState(bill?.autoPay ?? false)
  const [activeBill, setActiveBill] = useState(bill?.active ?? true)
  const [notes, setNotes] = useState(bill?.notes ?? '')
  const [alreadyPaid, setAlreadyPaid] = useState(true)
  const [error, setError] = useState('')
  const day = Number(dueDay)
  const dueThisMonth = day >= 1 && day <= 31 ? dueDateIn(monthOf(today), day) : ''
  const askPaid = !bill && dueThisMonth !== '' && dueThisMonth < today

  async function save() {
    if (!name.trim()) return setError('Give the bill a name.')
    if (amount === null || amount <= 0) return setError('Enter the monthly amount.')
    if (!Number.isInteger(day) || day < 1 || day > 31) return setError('Due day must be 1–31.')
    const id = await saveBill({ id: bill?.id, name: name.trim(), icon, amount, dueDay: day, category, autoPay, active: activeBill, notes })
    if (askPaid && alreadyPaid) {
      await markPaid({ id } as Bill, monthOf(today), amount, dueThisMonth, false, true)
    }
    toast(bill ? 'Bill saved' : 'Bill added')
    onClose()
  }

  return (
    <Modal title={bill ? 'Edit bill' : 'Add bill'} onClose={onClose} footer={
      <>
        {bill && <button className="btn btn-ghost-danger" onClick={() => onDelete(bill)}><Icon name="trash" size={16} /> Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" autoFocus /></label>
        <div className="icon-picker">{BILL_ICONS.map((i) => <button type="button" key={i} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>{i}</button>)}</div>
        <div className="field-row">
          <label className="field"><span>Monthly amount</span><MoneyInput value={amount} onChange={setAmount} label="Monthly amount" /></label>
          <label className="field field-sm"><span>Due day</span><input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="1" /></label>
          <label className="field"><span>Type</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as BillCategory)}>{BILL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} />
          <span><b>AutoPay</b><small className="muted">Marked paid automatically on its due day. Turn on once the payment is automatic.</small></span>
        </label>
        {askPaid && (
          <label className="switch-row">
            <input type="checkbox" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} />
            <span><b>Already paid for this month</b><small className="muted">Paid before you started using the app, so it doesn’t come out of the Bills pot.</small></span>
          </label>
        )}
        {bill && (
          <label className="switch-row">
            <input type="checkbox" checked={activeBill} onChange={(e) => setActiveBill(e.target.checked)} />
            <span><b>Active</b><small className="muted">Turn off for a bill you no longer pay (keeps its history).</small></span>
          </label>
        )}
        <label className="field"><span>Notes <em>(optional)</em></span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function LoanForm({ loan, bills, onClose, onDelete }: { loan?: Loan; bills: Bill[]; onClose: () => void; onDelete: (l: Loan) => void }) {
  const { toast } = useUI()
  const [name, setName] = useState(loan?.name ?? '')
  const [balance, setBalance] = useState<number | null>(loan?.startingBalance ?? null)
  const [billId, setBillId] = useState(loan?.billId ?? '')
  const [rate, setRate] = useState(loan?.interestRate !== undefined ? String(loan.interestRate) : '')
  const [notes, setNotes] = useState(loan?.notes ?? '')
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Give the loan a name.')
    if (balance === null || balance < 0) return setError('Enter the current balance.')
    const r = rate.trim() ? Number(rate) : undefined
    if (r !== undefined && (isNaN(r) || r < 0 || r > 100)) return setError('Interest rate should be a % between 0 and 100, or empty.')
    await saveLoan({ id: loan?.id, name: name.trim(), startingBalance: balance, billId: billId || null, interestRate: r, notes })
    toast(loan ? 'Loan saved' : 'Loan added')
    onClose()
  }

  return (
    <Modal title={loan ? 'Edit loan' : 'Add loan'} onClose={onClose} footer={
      <>
        {loan && <button className="btn btn-ghost-danger" onClick={() => onDelete(loan)}><Icon name="trash" size={16} /> Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Student loan" autoFocus /></label>
        <div className="field-row">
          <label className="field"><span>Balance {loan ? `(on ${loan.startDate})` : 'today'}</span><MoneyInput value={balance} onChange={setBalance} label="Balance" /></label>
          <label className="field field-sm"><span>Interest % <em>(optional)</em></span><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 6.5" /></label>
        </div>
        <label className="field"><span>Monthly payment (bill)</span>
          <select value={billId} onChange={(e) => setBillId(e.target.value)}>
            <option value="">— none yet —</option>
            {bills.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name} · {money(b.amount)}</option>)}
          </select>
          <small className="muted">Each time that bill is marked paid, the loan balance goes down.</small>
        </label>
        <label className="field"><span>Notes <em>(optional)</em></span><input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
