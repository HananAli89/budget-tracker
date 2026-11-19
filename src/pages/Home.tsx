import { Link } from 'react-router-dom'
import { useData } from '../lib/store'
import { useSettings } from '../lib/settings'
import {
  averagePaycheque, billStatus, billsPot, categoryBudget, goalBalance, goalEstimate, monthOf, nextPayday, paychequesIn, periodFor, readiness,
} from '../lib/budget'
import { daysBetween, friendlyDate, todayISO } from '../lib/dates'
import { money, pct, sum } from '../lib/money'
import { buildReminders } from '../lib/reminders'
import { Bar, Bubble, toneFor } from '../components/bits'
import { useExpenseEditor } from '../components/ExpenseEditor'
import { Icon } from '../components/Icon'

export function getAutoPaid(): string[] {
  try { return JSON.parse(sessionStorage.getItem('bt-autopaid') ?? '[]') } catch { return [] }
}

export function Home() {
  const d = useData()
  const s = useSettings()
  const { open } = useExpenseEditor()
  if (!d) return null
  const today = todayISO()
  const anchor = s.paydayAnchor
  const period = periodFor(today, anchor)
  const payday = nextPayday(today, anchor)
  const daysToPay = daysBetween(today, payday)
  const pcs = paychequesIn(period, d.paycheques)
  const leftover = sum(pcs.map((p) => p.plan.leftover))
  const pot = billsPot(s.startingPot, d.paycheques, d.billPayments)
  const ready = readiness(today, pot, d.bills, d.billPayments)
  const reminders = buildReminders(d, today, anchor)
  const autoPaid = getAutoPaid()
  const avg = averagePaycheque(d.paycheques)
  const month = monthOf(today)
  const upcomingBills = d.bills.filter((b) => b.active)
    .map((b) => ({ b, st: billStatus(b, month, d.billPayments, today) }))
    .filter((x) => x.st.status !== 'paid' && x.st.status !== 'auto-paid')
    .slice(0, 4)
  const sadaqaAside = sum(d.sadaqa.filter((x) => x.type === 'aside' && x.date >= period.start && x.date <= period.end).map((x) => x.amount))
  const sadaqaToGive = sum(d.sadaqa.map((x) => (x.type === 'aside' ? x.amount : -x.amount)))

  const setup = [
    { done: d.bills.length > 0, text: 'Add your monthly bills (rent, phone, internet, loans)', to: '/bills' },
    { done: d.categories.some((c) => c.budgetPerPeriod > 0), text: 'Set grocery, medicine and transport budgets per paycheque', to: '/settings' },
    { done: d.goals.some((g) => g.target !== null), text: 'Set targets for your goals', to: '/goals' },
    { done: d.paycheques.length > 0, text: 'Record your paycheque', to: '/paycheques/new' },
  ]
  const fresh = d.paycheques.length === 0 && d.bills.length === 0 && d.expenses.length === 0
  const setupLeft = setup.filter((x) => !x.done).length

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Pay period</p>
          <h1>{friendlyDate(period.start)} – {friendlyDate(period.end)}</h1>
          <p className="muted small">{daysToPay === 0 ? 'Payday today' : `${daysToPay} day${daysToPay === 1 ? '' : 's'} until payday (${friendlyDate(payday)})`}</p>
        </div>
        {pcs.length === 0
          ? <Link to="/paycheques/new" className="btn btn-primary"><Icon name="cash" size={16} /> Record paycheque</Link>
          : <div className="leftover"><span className="muted small">Free to spend</span><strong>{money(leftover)}</strong></div>}
      </header>

      {setupLeft > 0 && (
        <section className="card setup">
          <h2 className="card-title">Get set up <span className="muted small">({setup.length - setupLeft} of {setup.length} done)</span></h2>
          <ol>
            {setup.map((x) => (
              <li key={x.text} className={x.done ? 'done' : ''}>
                <span className="setup-check">{x.done ? <Icon name="check" size={13} /> : null}</span>
                {x.done ? x.text : <Link to={x.to}>{x.text}</Link>}
              </li>
            ))}
          </ol>
          {fresh && <p className="small muted">Already using the app on another device? <Link to="/settings">Restore a backup</Link> instead.</p>}
        </section>
      )}

      {(reminders.length > 0 || autoPaid.length > 0) && (
        <section className="reminders">
          {autoPaid.length > 0 && <Link to="/bills" className="reminder tone-green"><Icon name="check" size={16} /> Auto-marked paid: {autoPaid.join(', ')}</Link>}
          {reminders.map((r) => <Link key={r.id} to={r.link} className={`reminder tone-${r.tone}`}><Icon name="bell" size={16} /> {r.text}</Link>)}
        </section>
      )}

      <section className="card">
        <div className="card-title-row">
          <h2 className="card-title">Ready for {friendlyDate(ready.nextFirst).split(', ')[1]}</h2>
          <Link to="/bills" className="small">Bills</Link>
        </div>
        {ready.need === 0 ? <p className="muted small">Add your bills to see if next month is covered.</p> : (
          <>
            <p className="big-line"><strong>{money(ready.ready)}</strong> <span className="muted">of {money(ready.need)}</span></p>
            <Bar percent={pct(ready.ready, ready.need)} tone={ready.ready >= ready.need ? 'green' : 'accent'} label />
            <p className="small muted">{ready.ready >= ready.need
              ? `All of next month's bills are covered ✓${ready.extra > 0 ? ` (${money(ready.extra)} extra in the pot)` : ''}`
              : `${money(ready.need - ready.ready)} still to set aside before the 1st`}</p>
            {upcomingBills.length > 0 && (
              <ul className="mini-bills">
                {upcomingBills.map(({ b, st }) => (
                  <li key={b.id}>
                    <span>{b.icon} {b.name}{b.autoPay && <span className="tag">Auto</span>}</span>
                    <span className={`small tone-text-${st.status === 'overdue' ? 'red' : st.status === 'due-soon' ? 'amber' : 'muted'}`}>
                      {st.status === 'overdue' ? 'Overdue' : st.days === 0 ? 'Due today' : `Due ${friendlyDate(st.due)}`}
                    </span>
                    <span>{money(b.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section>
        <div className="section-head"><h2>Spending</h2><Link to="/spending" className="small">All expenses</Link></div>
        <div className="cards-grid">
          {d.categories.map((c) => {
            const b = categoryBudget(c, period, anchor, d.paycheques, d.expenses)
            const over = b.left < 0
            return (
              <button key={c.id} className="card budget-card" onClick={() => open(undefined, c.id)} aria-label={`Add ${c.name} expense`}>
                <div className="budget-card-head">
                  <Bubble icon={c.icon} tone={toneFor(c.id)} />
                  <div><h3>{c.name}{c.essential && <span className="tag">Essential</span>}</h3></div>
                </div>
                <div className="bsl">
                  <div><span>Budget</span><strong>{money(b.budget)}</strong></div>
                  <div><span>Spent</span><strong>{money(b.spent)}</strong></div>
                  <div><span>Left</span><strong className={over ? 'text-red' : ''}>{money(b.left)}</strong></div>
                </div>
                <Bar percent={pct(b.spent, b.budget || (b.spent ? b.spent : 1))} tone={over ? 'red' : b.budget && b.spent / b.budget > 0.85 ? 'amber' : 'accent'} label />
                <p className={`small result ${over ? 'text-red' : b.budget ? 'text-green' : 'muted'}`}>
                  {b.budget === 0 && b.spent === 0 ? 'No budget set' : over ? `Over by ${money(-b.left)}` : daysToPay <= 1 ? `Saved ${money(b.left)}` : `${money(b.left)} left · ${daysToPay} days to go`}
                </p>
                {b.carry > 0 && <p className="small muted">Includes {money(b.carry)} rolled over</p>}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="section-head"><h2>Goals</h2><Link to="/goals" className="small">Manage</Link></div>
        <div className="cards-grid">
          {d.goals.map((g) => {
            const bal = goalBalance(g.id, d.goalTx)
            const est = goalEstimate(g, bal, avg, today, anchor)
            return (
              <Link key={g.id} to="/goals" className="card goal-card">
                <div className="budget-card-head">
                  <Bubble icon={g.icon} tone={toneFor(g.id)} />
                  <div><h3>{g.name}</h3><span className="small muted">{g.percentOfPay}% of pay{g.protected && ' · kept when money is tight'}</span></div>
                </div>
                <p className="big-line"><strong>{money(bal)}</strong>{g.target !== null && <span className="muted"> of {money(g.target)}</span>}</p>
                {g.target !== null && <Bar percent={pct(bal, g.target)} tone={est.kind === 'done' ? 'green' : 'accent'} label />}
                <p className="small muted">
                  {est.kind === 'no-target' ? 'No target set'
                    : est.kind === 'done' ? 'Goal reached 🎉'
                    : est.kind === 'no-rate' ? (avg ? 'Set a % of pay to estimate' : 'Record a paycheque to estimate')
                    : `${money(g.target! - bal)} to go · about ${friendlyDate(est.finish)}`}
                </p>
              </Link>
            )
          })}
        </div>
      </section>

      <Link to="/sadaqa" className="card sadaqa-card">
        <Bubble icon="🤲" tone="green" />
        <div>
          <h3>Sadaqa</h3>
          <p className="small muted">{money(sadaqaAside)} set aside this pay period · {sadaqaToGive > 0 ? `${money(sadaqaToGive)} still to give` : 'all given ✓'}</p>
        </div>
      </Link>
    </div>
  )
}
