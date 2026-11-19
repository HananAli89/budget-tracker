import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Plan } from '../types'
import { deletePaycheque, recordPaycheque, suggestedBills, useData } from '../lib/store'
import { useSettings } from '../lib/settings'
import { averagePaycheque, buildPlan, paychequesIn, periodFor } from '../lib/budget'
import { friendlyDate, isValidISODate, todayISO } from '../lib/dates'
import { money, sum } from '../lib/money'
import { MoneyInput } from '../components/bits'
import { EmptyState, useUI } from '../components/ui'
import { Icon } from '../components/Icon'

export function PaychequesPage() {
  const d = useData()
  const { confirm, toast } = useUI()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!d) return null
  const list = [...d.paycheques].reverse()
  const catName = (id: string) => d.categories.find((c) => c.id === id)
  const goalName = (id: string) => d.goals.find((g) => g.id === id)

  async function remove(id: string, date: string) {
    if (await confirm({ title: 'Delete paycheque?', message: `The ${friendlyDate(date)} paycheque and the sadaqa and goal money it set aside will be removed.`, confirmLabel: 'Delete', danger: true })) {
      await deletePaycheque(id); toast('Paycheque deleted')
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <div><h1>Paycheques</h1>{d.paycheques.length > 0 && <p className="muted small">Average of last 6: {money(averagePaycheque(d.paycheques))}</p>}</div>
        <Link to="/paycheques/new" className="btn btn-primary"><Icon name="plus" size={16} /> Record paycheque</Link>
      </header>
      {list.length === 0 ? <EmptyState title="No paycheques yet" text="Record your paycheque on payday and the app plans where every dollar goes." /> : (
        <div className="card list">
          {list.map((p) => (
            <div key={p.id} className="list-row-wrap">
              <button className="list-row" onClick={() => setOpenId(openId === p.id ? null : p.id)} aria-expanded={openId === p.id}>
                <span><strong>{friendlyDate(p.payDate)}</strong><span className="small muted"> · {p.payDate}</span></span>
                <span className="spacer" />
                <strong>{money(p.amount)}</strong>
                <Icon name={openId === p.id ? 'left' : 'right'} size={16} />
              </button>
              {openId === p.id && (
                <div className="plan-detail">
                  <PlanLine label="🤲 Sadaqa" value={p.plan.sadaqa} />
                  <PlanLine label="🧾 Bills set aside" value={p.plan.bills} />
                  {Object.entries(p.plan.spending).map(([id, v]) => <PlanLine key={id} label={`${catName(id)?.icon ?? '🏷️'} ${catName(id)?.name ?? 'Deleted category'}`} value={v} />)}
                  {Object.entries(p.plan.goals).map(([id, v]) => <PlanLine key={id} label={`${goalName(id)?.icon ?? '🎯'} ${goalName(id)?.name ?? 'Deleted goal'}`} value={v} />)}
                  <PlanLine label="✨ Free to spend" value={p.plan.leftover} />
                  {p.plan.notes.map((n) => <p key={n} className="small note">{n}</p>)}
                  {p.notes && <p className="small muted">{p.notes}</p>}
                  <button className="btn btn-sm btn-ghost-danger" onClick={() => remove(p.id, p.payDate)}><Icon name="trash" size={14} /> Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PlanLine = ({ label, value }: { label: string; value: number }) => (
  <div className="plan-line"><span>{label}</span><span>{money(value)}</span></div>
)

type Overrides = Record<string, number | null>

export function RecordPaycheque() {
  const d = useData()
  const s = useSettings()
  const navigate = useNavigate()
  const { toast } = useUI()
  const today = todayISO()
  const period = periodFor(today, s.paydayAnchor)
  const defaultDate = d && paychequesIn(period, d.paycheques).length === 0 ? period.start : today

  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [bills, setBills] = useState<Awaited<ReturnType<typeof suggestedBills>> | null>(null)
  const [overrides, setOverrides] = useState<Overrides>({})
  const [error, setError] = useState('')
  const payDate = date || defaultDate

  useEffect(() => {
    if (isValidISODate(payDate)) suggestedBills(payDate).then(setBills)
  }, [payDate, d?.bills, d?.billPayments, d?.paycheques])

  const auto = useMemo(() => {
    if (!d || !bills || !amount || amount <= 0) return null
    return buildPlan({ amount, sadaqaRate: s.sadaqaRate, billsNeeded: bills.amount, categories: d.categories, goals: d.goals })
  }, [d, bills, amount, s.sadaqaRate])

  if (!d) return null
  const val = (key: string, fallback: number) => (overrides[key] !== undefined && overrides[key] !== null ? overrides[key]! : fallback)
  const final: Plan | null = auto && amount ? (() => {
    const p: Plan = {
      sadaqa: auto.sadaqa,
      bills: val('bills', auto.bills),
      spending: Object.fromEntries(d.categories.map((c) => [c.id, val(`cat:${c.id}`, auto.spending[c.id] ?? 0)])),
      goals: Object.fromEntries(d.goals.map((g) => [g.id, val(`goal:${g.id}`, auto.goals[g.id] ?? 0)])),
      leftover: 0,
      notes: auto.notes,
    }
    p.leftover = amount - p.sadaqa - p.bills - sum(Object.values(p.spending)) - sum(Object.values(p.goals))
    return p
  })() : null
  const invalidEdit = Object.values(overrides).some((v) => v === null)

  async function save() {
    setError('')
    if (!amount || amount <= 0) return setError('Enter the paycheque amount.')
    if (!isValidISODate(payDate)) return setError('Pick a valid pay date.')
    if (!final) return
    if (invalidEdit) return setError('One of the amounts isn’t a valid number.')
    if (final.leftover < 0) return setError(`The plan is ${money(-final.leftover)} more than the paycheque. Lower something.`)
    if (d!.paycheques.some((p) => p.payDate === payDate)) return setError('A paycheque for this date is already recorded.')
    await recordPaycheque(payDate, amount, final, notes.trim())
    toast(`Paycheque recorded — ${money(final.leftover)} free to spend`)
    navigate('/')
  }

  const line = (key: string, label: string, value: number, hint?: string) => (
    <div className="plan-edit" key={key}>
      <div><span>{label}</span>{hint && <small className="muted">{hint}</small>}</div>
      <MoneyInput key={`${key}-${value}-${amount}`} value={value} label={label} onChange={(c) => setOverrides((o) => ({ ...o, [key]: c }))} />
    </div>
  )

  return (
    <div className="page narrow">
      <Link to="/paycheques" className="back"><Icon name="left" size={16} /> Paycheques</Link>
      <header className="page-head"><h1>Record paycheque</h1></header>
      <section className="card form">
        <div className="field-row">
          <label className="field"><span>Amount (after tax)</span>
            <MoneyInput value={amount} onChange={(c) => { setAmount(c); setOverrides({}) }} autoFocus big label="Paycheque amount" />
          </label>
          <label className="field"><span>Pay date</span><input type="date" value={payDate} onChange={(e) => { setDate(e.target.value); setOverrides({}) }} /></label>
        </div>
      </section>

      {auto && final && bills && (
        <>
          {auto.notes.length > 0 && <div className="notice">{auto.notes.map((n) => <p key={n}>{n}</p>)}</div>}
          <section className="card plan">
            <h2 className="card-title">Plan for this paycheque</h2>
            <p className="plan-group">Essentials</p>
            <div className="plan-edit"><div><span>🤲 Sadaqa ({s.sadaqaRate}%)</span><small className="muted">Fixed</small></div><strong>{money(final.sadaqa)}</strong></div>
            {line('bills', '🧾 Bills pot', final.bills,
              bills.ahead > 0 ? `Next month already covered (+${money(bills.ahead)})`
                : `Covers bills by ${friendlyDate(bills.nextFirst)} · split over ${bills.paydaysLeft} payday${bills.paydaysLeft === 1 ? '' : 's'} · avg ${money(bills.average)}`)}
            {d.categories.filter((c) => c.essential).map((c) => line(`cat:${c.id}`, `${c.icon} ${c.name}`, final.spending[c.id], `Budget ${money(c.budgetPerPeriod)}`))}
            {d.categories.some((c) => !c.essential) && <p className="plan-group">Other spending</p>}
            {d.categories.filter((c) => !c.essential).map((c) => line(`cat:${c.id}`, `${c.icon} ${c.name}`, final.spending[c.id], `Budget ${money(c.budgetPerPeriod)}`))}
            {d.goals.length > 0 && <p className="plan-group">Savings</p>}
            {d.goals.map((g) => line(`goal:${g.id}`, `${g.icon} ${g.name}`, final.goals[g.id], `${g.percentOfPay}% of pay${g.protected ? ' · kept when tight' : ''}`))}
            <div className={`plan-total ${final.leftover < 0 ? 'text-red' : ''}`}><span>✨ Free to spend</span><strong>{money(final.leftover)}</strong></div>
          </section>
          <label className="field"><span>Notes <em>(optional)</em></span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. extra shift" /></label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="btn-row end">
        <Link to="/paycheques" className="btn">Cancel</Link>
        <button className="btn btn-primary" onClick={save} disabled={!final}>Confirm plan</button>
      </div>
    </div>
  )
}
