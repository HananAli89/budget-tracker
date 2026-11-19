import { useState } from 'react'
import type { Goal } from '../types'
import { deleteGoal, goalMove, saveGoal, useData } from '../lib/store'
import { useSettings } from '../lib/settings'
import { averagePaycheque, goalBalance, goalEstimate } from '../lib/budget'
import { formatDate, friendlyDate, isValidISODate, todayISO } from '../lib/dates'
import { money, pct } from '../lib/money'
import { Bar, Bubble, MoneyInput, toneFor } from '../components/bits'
import { Modal, useUI } from '../components/ui'
import { Icon } from '../components/Icon'

export function GoalsPage() {
  const d = useData()
  const s = useSettings()
  const { confirm, toast } = useUI()
  const [edit, setEdit] = useState<Goal | 'new' | null>(null)
  const [move, setMove] = useState<{ goal: Goal; dir: 1 | -1 } | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  if (!d) return null
  const avg = averagePaycheque(d.paycheques)
  const totalPct = d.goals.reduce((a, g) => a + g.percentOfPay, 0)
  const today = todayISO()

  return (
    <div className="page narrow">
      <header className="page-head">
        <div><h1>Goals</h1><p className="muted small">{totalPct}% of each paycheque goes to savings{avg ? ` (about ${money(Math.round((avg * totalPct) / 100))})` : ''}</p></div>
        <button className="btn btn-primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> New goal</button>
      </header>

      {d.goals.map((g) => {
        const bal = goalBalance(g.id, d.goalTx)
        const est = goalEstimate(g, bal, avg, today, s.paydayAnchor)
        const tx = d.goalTx.filter((t) => t.goalId === g.id).sort((a, b) => b.date.localeCompare(a.date))
        return (
          <section key={g.id} className="card goal-detail">
            <div className="goal-head">
              <Bubble icon={g.icon} tone={toneFor(g.id)} size="lg" />
              <div className="goal-title">
                <h2>{g.name}</h2>
                <span className="small muted">{g.percentOfPay}% of pay{g.protected && ' · kept when money is tight'}{g.targetDate && ` · by ${friendlyDate(g.targetDate)}`}</span>
              </div>
              <button className="icon-btn" onClick={() => setEdit(g)} aria-label={`Edit ${g.name}`}><Icon name="edit" /></button>
            </div>
            <p className="big-line center"><strong>{money(bal)}</strong>{g.target !== null && <span className="muted"> of {money(g.target)}</span>}</p>
            {g.target !== null ? <Bar percent={pct(bal, g.target)} tone={est.kind === 'done' ? 'green' : 'accent'} label /> : <p className="center small muted">no target</p>}
            <p className="small center">
              {est.kind === 'done' && 'Goal reached 🎉'}
              {est.kind === 'no-target' && <button className="link-btn" onClick={() => setEdit(g)}>Set a target</button>}
              {est.kind === 'no-rate' && (avg ? 'Set a % of pay to see when you’ll finish.' : 'Record a paycheque to see an estimate.')}
              {est.kind === 'estimate' && <>{money(g.target! - bal)} to go · about <b>{friendlyDate(est.finish)}</b> at {money(est.perPay)} per paycheque</>}
            </p>
            {'neededPerPay' in est && est.neededPerPay !== null && est.neededPerPay !== undefined && (
              <p className={`small center ${est.kind === 'estimate' && est.onTrack ? 'text-green' : 'text-amber'}`}>
                {est.kind === 'estimate' && est.onTrack ? 'On track for your date ✓' : `To hit your date, save about ${money(est.neededPerPay)} per paycheque`}
              </p>
            )}
            <div className="btn-row center-row">
              <button className="btn btn-sm" onClick={() => setMove({ goal: g, dir: 1 })}><Icon name="plus" size={14} /> Add money</button>
              <button className="btn btn-sm" onClick={() => setMove({ goal: g, dir: -1 })} disabled={bal <= 0}>− Withdraw</button>
              <button className="btn btn-sm" onClick={() => setHistoryFor(historyFor === g.id ? null : g.id)}>History ({tx.length})</button>
            </div>
            {historyFor === g.id && (
              <ul className="history">
                {tx.length === 0 && <li className="muted small">No deposits yet.</li>}
                {tx.map((t) => (
                  <li key={t.id}><span className="small muted">{formatDate(t.date, s.dateFormat)}</span><span>{t.note}</span><strong className={t.amount < 0 ? 'text-red' : 'text-green'}>{t.amount < 0 ? '−' : '+'}{money(Math.abs(t.amount))}</strong></li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {edit && <GoalForm goal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} onDelete={async (g) => {
        if (await confirm({ title: `Delete ${g.name}?`, message: 'The goal and its history will be removed.', confirmLabel: 'Delete', danger: true })) {
          await deleteGoal(g.id); toast('Goal deleted'); setEdit(null)
        }
      }} />}
      {move && <MoveForm goal={move.goal} dir={move.dir} balance={goalBalance(move.goal.id, d.goalTx)} onClose={() => setMove(null)} />}
    </div>
  )
}

const GOAL_ICONS = ['🆘', '🚗', '💰', '🏠', '✈️', '🎓', '💍', '🕋', '🎁', '🎯']

function GoalForm({ goal, onClose, onDelete }: { goal?: Goal; onClose: () => void; onDelete: (g: Goal) => void }) {
  const { toast } = useUI()
  const [name, setName] = useState(goal?.name ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? '🎯')
  const [target, setTarget] = useState<number | null>(goal?.target ?? null)
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [percent, setPercent] = useState(String(goal?.percentOfPay ?? 5))
  const [prot, setProt] = useState(goal?.protected ?? false)
  const [error, setError] = useState('')

  async function save() {
    const p = Number(percent)
    if (!name.trim()) return setError('Give the goal a name.')
    if (isNaN(p) || p < 0 || p > 100) return setError('% of pay should be between 0 and 100.')
    if (targetDate && !isValidISODate(targetDate)) return setError('Pick a valid target date or leave it empty.')
    await saveGoal({ id: goal?.id, name: name.trim(), icon, target, targetDate: targetDate || undefined, percentOfPay: p, protected: prot })
    toast(goal ? 'Goal saved' : 'Goal added')
    onClose()
  }

  return (
    <Modal title={goal ? 'Edit goal' : 'New goal'} onClose={onClose} footer={
      <>
        {goal && <button className="btn btn-ghost-danger" onClick={() => onDelete(goal)}><Icon name="trash" size={16} /> Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div className="icon-picker">{GOAL_ICONS.map((i) => <button type="button" key={i} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>{i}</button>)}</div>
        <div className="field-row">
          <label className="field"><span>Target <em>(optional)</em></span><MoneyInput value={target} onChange={setTarget} label="Target" /></label>
          <label className="field"><span>Target date <em>(optional)</em></span><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></label>
          <label className="field field-sm"><span>% of pay</span><input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} /></label>
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={prot} onChange={(e) => setProt(e.target.checked)} />
          <span><b>Keep funding when money is tight</b><small className="muted">If a paycheque can’t cover all savings, only this goal gets money (lowered to what fits). Only one goal can have this.</small></span>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function MoveForm({ goal, dir, balance, onClose }: { goal: Goal; dir: 1 | -1; balance: number; onClose: () => void }) {
  const { toast } = useUI()
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  async function save() {
    if (!amount || amount <= 0) return setError('Enter an amount.')
    if (dir === -1 && amount > balance) return setError(`You only have ${money(balance)} in this goal.`)
    if (dir === -1 && !note.trim()) return setError('Add a reason for the withdrawal.')
    await goalMove(goal.id, amount * dir, note.trim() || (dir === 1 ? 'Added money' : 'Withdrawal'))
    toast(dir === 1 ? `Added ${money(amount)} to ${goal.name}` : `Withdrew ${money(amount)} from ${goal.name}`)
    onClose()
  }
  return (
    <Modal title={`${dir === 1 ? 'Add money to' : 'Withdraw from'} ${goal.name}`} onClose={onClose} footer={
      <><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{dir === 1 ? 'Add' : 'Withdraw'}</button></>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <MoneyInput value={amount} onChange={setAmount} autoFocus big label="Amount" />
        <label className="field"><span>{dir === 1 ? 'Note (optional)' : 'Reason'}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={dir === 1 ? 'e.g. Starting balance' : 'e.g. Car repair'} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
