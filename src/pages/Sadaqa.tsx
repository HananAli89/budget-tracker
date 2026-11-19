import { useState } from 'react'
import { deleteSadaqa, recordSadaqaGiven, useData } from '../lib/store'
import { useSettings } from '../lib/settings'
import { formatDate, isValidISODate, todayISO } from '../lib/dates'
import { money, sum } from '../lib/money'
import { MoneyInput } from '../components/bits'
import { EmptyState, Modal, useUI } from '../components/ui'
import { Icon } from '../components/Icon'

export function SadaqaPage() {
  const d = useData()
  const s = useSettings()
  const { confirm, toast } = useUI()
  const [giving, setGiving] = useState(false)
  if (!d) return null
  const aside = sum(d.sadaqa.filter((x) => x.type === 'aside').map((x) => x.amount))
  const given = sum(d.sadaqa.filter((x) => x.type === 'given').map((x) => x.amount))
  const year = todayISO().slice(0, 4)
  const givenThisYear = sum(d.sadaqa.filter((x) => x.type === 'given' && x.date.startsWith(year)).map((x) => x.amount))
  const list = [...d.sadaqa].reverse()

  return (
    <div className="page narrow">
      <header className="page-head">
        <div><h1>Sadaqa</h1><p className="muted small">{s.sadaqaRate}% of every paycheque is set aside automatically.</p></div>
        <button className="btn btn-primary" onClick={() => setGiving(true)}><Icon name="heart" size={16} /> Record given</button>
      </header>
      <div className="stats">
        <div className="stat"><span className="stat-label">Set aside</span><span className="stat-value">{money(aside)}</span></div>
        <div className="stat"><span className="stat-label">Given</span><span className="stat-value">{money(given)}</span></div>
        <div className={`stat ${aside - given > 0 ? 'stat-highlight' : ''}`}><span className="stat-label">Still to give</span><span className="stat-value">{money(Math.max(0, aside - given))}</span></div>
      </div>
      <p className="small muted">Given in {year}: <b>{money(givenThisYear)}</b>{aside - given < 0 && ` · You’ve given ${money(given - aside)} more than set aside — may Allah accept it.`}</p>

      {list.length === 0 ? <EmptyState title="Nothing yet" text="Sadaqa is set aside each time you record a paycheque." /> : (
        <div className="card list">
          {list.map((x) => (
            <div key={x.id} className="history-row">
              <span className="small muted">{formatDate(x.date, s.dateFormat)}</span>
              <span>{x.type === 'aside' ? 'Set aside' : 'Given'}{x.note && ` · ${x.note}`}</span>
              <span className="spacer" />
              <strong className={x.type === 'given' ? 'text-green' : ''}>{money(x.amount)}</strong>
              {x.type === 'given' && (
                <button className="icon-btn" aria-label="Delete entry" onClick={async () => {
                  if (await confirm({ title: 'Delete entry?', message: `Remove the ${money(x.amount)} given on ${x.date}?`, confirmLabel: 'Delete', danger: true })) { await deleteSadaqa(x.id); toast('Entry deleted') }
                }}><Icon name="trash" size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {giving && <GiveForm suggested={Math.max(0, aside - given)} onClose={() => setGiving(false)} />}
    </div>
  )
}

function GiveForm({ suggested, onClose }: { suggested: number; onClose: () => void }) {
  const { toast } = useUI()
  const [amount, setAmount] = useState<number | null>(suggested || null)
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  async function save() {
    if (!amount || amount <= 0) return setError('Enter an amount.')
    if (!isValidISODate(date)) return setError('Pick a valid date.')
    await recordSadaqaGiven(amount, note.trim(), date)
    toast(`Recorded ${money(amount)} given`)
    onClose()
  }
  return (
    <Modal title="Record sadaqa given" onClose={onClose} footer={
      <><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <MoneyInput value={amount} onChange={setAmount} autoFocus big label="Amount given" />
        <div className="field-row">
          <label className="field"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field"><span>Note <em>(optional)</em></span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Masjid" /></label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
