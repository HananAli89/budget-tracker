import { useRef, useState } from 'react'
import type { SpendingCategory } from '../types'
import { updateSettings, useSettings } from '../lib/settings'
import { deleteCategory, saveCategory, useData } from '../lib/store'
import { backupCounts, deleteAllData, exportBackup, exportCSV, parseBackup, restoreBackup, download } from '../lib/backup'
import { buildICS } from '../lib/ics'
import { dueDateIn, monthOf, addMonths, nextPayday, paydaysBetween } from '../lib/budget'
import { friendlyDate, isValidISODate, todayISO, addDays } from '../lib/dates'
import { money } from '../lib/money'
import { enableNotifications, notificationsSupported } from '../lib/reminders'
import { Bubble, MoneyInput, toneFor } from '../components/bits'
import { Modal, useUI } from '../components/ui'
import { Icon } from '../components/Icon'

export function SettingsPage() {
  const s = useSettings()
  const d = useData()
  const { confirm, toast } = useUI()
  const fileRef = useRef<HTMLInputElement>(null)
  const [editCat, setEditCat] = useState<SpendingCategory | 'new' | null>(null)
  const [error, setError] = useState('')
  const [notif, setNotif] = useState(notificationsSupported() ? Notification.permission : 'unsupported')
  if (!d) return null
  const today = todayISO()
  const upcoming = paydaysBetween(today, addDays(today, 50), s.paydayAnchor).slice(0, 3)

  function exportCalendar() {
    const month = monthOf(today)
    const first = Object.fromEntries(d!.bills.map((b) => {
      const thisMonth = dueDateIn(month, b.dueDay)
      return [b.id, thisMonth >= today ? thisMonth : dueDateIn(addMonths(month, 1), b.dueDay)]
    }))
    download('budget-reminders.ics', buildICS(d!.bills, first, nextPayday(addDays(today, -1), s.paydayAnchor), money), 'text/calendar')
    toast('Calendar file downloaded')
  }

  async function onRestore(file: File) {
    setError('')
    try {
      const b = parseBackup(await file.text())
      const c = backupCounts(b)
      const choice = await confirm({
        title: 'Restore backup',
        message: <>
          <p>Saved {new Date(b.exportedAt).toLocaleString('en-CA')}: <b>{c.paycheques}</b> paycheques, <b>{c.bills}</b> bills, <b>{c.expenses}</b> expenses, <b>{c.goals}</b> goals.</p>
          <p><b>Merge</b> adds anything not already here. <b>Replace all</b> deletes what’s on this device first.</p>
        </>,
        choices: [{ label: 'Merge', value: 'merge' }, { label: 'Replace all', value: 'replace', danger: true }],
      })
      if (!choice) return
      if (choice === 'replace' && !(await confirm({ title: 'Replace everything?', message: 'All data on this device will be replaced by the backup.', confirmLabel: 'Replace', danger: true }))) return
      const n = await restoreBackup(b, choice as 'merge' | 'replace')
      toast(`Restored ${n} records`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head"><h1>Settings</h1></header>

      <section className="card settings">
        <h2 className="card-title">Pay &amp; sadaqa</h2>
        <div className="setting">
          <span>A payday date<small className="muted">Paydays repeat every 2 weeks from here.</small></span>
          <input type="date" value={s.paydayAnchor} onChange={(e) => isValidISODate(e.target.value) && updateSettings({ paydayAnchor: e.target.value })} />
        </div>
        <p className="small muted">Next paydays: {upcoming.map((p) => friendlyDate(p)).join(' · ')}</p>
        <div className="setting">
          <span>Sadaqa rate (%)</span>
          <input className="input-sm" inputMode="decimal" defaultValue={s.sadaqaRate} onBlur={(e) => {
            const v = Number(e.target.value)
            if (!isNaN(v) && v >= 0 && v <= 100) { updateSettings({ sadaqaRate: v }); toast('Sadaqa rate saved') } else e.target.value = String(s.sadaqaRate)
          }} />
        </div>
        <div className="setting">
          <span>Bills pot starting balance<small className="muted">Money already saved for bills when you started.</small></span>
          <div className="input-sm"><MoneyInput key={s.startingPot} value={s.startingPot} label="Starting bills pot" onChange={(c) => c !== null && c >= 0 && updateSettings({ startingPot: c })} /></div>
        </div>
      </section>

      <section className="card settings">
        <div className="card-title-row">
          <h2 className="card-title">Spending categories</h2>
          <button className="btn btn-sm" onClick={() => setEditCat('new')}><Icon name="plus" size={14} /> Add</button>
        </div>
        <p className="small muted">Budgets are per paycheque. Essentials are cut last when money is tight. Changes apply from the next paycheque.</p>
        <div className="list">
          {d.categories.map((c) => (
            <button key={c.id} className="cat-row" onClick={() => setEditCat(c)}>
              <Bubble icon={c.icon} tone={toneFor(c.id)} size="sm" />
              <span className="cat-row-name">{c.name}{c.essential && <span className="tag">Essential</span>}{c.rollover && <span className="tag">Rollover</span>}</span>
              <strong>{c.budgetPerPeriod ? money(c.budgetPerPeriod) : <span className="muted">Set budget</span>}</strong>
              <Icon name="right" size={16} />
            </button>
          ))}
        </div>
      </section>

      <section className="card settings">
        <h2 className="card-title">Reminders</h2>
        <p className="small muted">The app can only alert you while it’s open. For reminders when it’s closed, add your bills and paydays to your phone’s calendar.</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={exportCalendar} disabled={d.bills.length === 0}><Icon name="calendar" size={16} /> Download calendar reminders (.ics)</button>
          {notif === 'unsupported' ? <span className="small muted">Notifications aren’t supported in this browser.</span>
            : notif === 'granted' ? <span className="small text-green">✓ Notifications on (while the app is open)</span>
            : notif === 'denied' ? <span className="small muted">Notifications are blocked in your browser settings.</span>
            : <button className="btn" onClick={async () => { const ok = await enableNotifications(); setNotif(ok ? 'granted' : Notification.permission); toast(ok ? 'Notifications on' : 'Notifications not allowed') }}><Icon name="bell" size={16} /> Turn on notifications</button>}
        </div>
        <details className="small">
          <summary>How to add the calendar file to Google Calendar</summary>
          <ol>
            <li>On a computer, open <b>calendar.google.com</b> → ⚙️ Settings → <b>Import &amp; export</b>.</li>
            <li>Choose the downloaded <b>budget-reminders.ics</b> and pick a calendar (tip: create one called “Bills” first).</li>
            <li>Click <b>Import</b>. Events repeat on their own — only re-import if your bills change (delete the old events first).</li>
            <li>If you don’t get alerts, open that calendar’s settings and add a default notification, e.g. 1 day before.</li>
          </ol>
        </details>
      </section>

      <section className="card settings">
        <h2 className="card-title">Appearance</h2>
        <div className="setting"><span>Theme</span>
          <div className="seg">{(['system', 'light', 'dark'] as const).map((t) => <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => updateSettings({ theme: t })}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
        </div>
        <div className="setting"><span>Date format</span>
          <select value={s.dateFormat} onChange={(e) => updateSettings({ dateFormat: e.target.value as typeof s.dateFormat })}>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="DD/MM/YYYY">DD/MM/YYYY</option>
          </select>
        </div>
      </section>

      <section className="card settings">
        <h2 className="card-title">Backup &amp; data</h2>
        <p className="small muted">Your data is stored only on this device. Export a backup regularly, and use it to move to another device.</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => exportBackup().then(() => toast('Backup downloaded'))}><Icon name="download" size={16} /> Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> Restore backup</button>
          <button className="btn" onClick={() => exportCSV().then(() => toast('CSV files downloaded'))}><Icon name="file" size={16} /> Export CSV</button>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onRestore(f); e.target.value = '' }} />
        {error && <p className="error">{error}</p>}
        <hr />
        <button className="btn btn-ghost-danger" onClick={async () => {
          if (await confirm({ title: 'Delete all data?', message: 'Every paycheque, bill, expense, goal and sadaqa entry on this device will be deleted. Export a backup first.', confirmLabel: 'Delete everything', danger: true })) {
            await deleteAllData(); toast('All data deleted')
          }
        }}><Icon name="trash" size={16} /> Delete all data</button>
      </section>
      <p className="small muted center">{d.paycheques.length} paycheques · {d.bills.length} bills · {d.expenses.length} expenses on this device</p>

      {editCat && <CategoryForm cat={editCat === 'new' ? undefined : editCat} onClose={() => setEditCat(null)} onDelete={async (c) => {
        if (await confirm({ title: `Delete ${c.name}?`, message: 'Its past expenses move to “Other”.', confirmLabel: 'Delete', danger: true })) { await deleteCategory(c.id); toast('Category deleted'); setEditCat(null) }
      }} />}
    </div>
  )
}

const CAT_ICONS = ['🛒', '💊', '🚌', '🛍️', '🍔', '☕', '⛽', '💇', '🎉', '🏷️']

function CategoryForm({ cat, onClose, onDelete }: { cat?: SpendingCategory; onClose: () => void; onDelete: (c: SpendingCategory) => void }) {
  const { toast } = useUI()
  const [name, setName] = useState(cat?.name ?? '')
  const [icon, setIcon] = useState(cat?.icon ?? '🏷️')
  const [budget, setBudget] = useState<number | null>(cat?.budgetPerPeriod ?? 0)
  const [essential, setEssential] = useState(cat?.essential ?? false)
  const [rollover, setRollover] = useState(cat?.rollover ?? false)
  const [error, setError] = useState('')
  async function save() {
    if (!name.trim()) return setError('Give the category a name.')
    if (budget === null || budget < 0) return setError('Enter a budget (0 is fine).')
    await saveCategory({ id: cat?.id, name: name.trim(), icon, budgetPerPeriod: budget, essential, rollover })
    toast('Category saved'); onClose()
  }
  return (
    <Modal title={cat ? 'Edit category' : 'New category'} onClose={onClose} footer={
      <>
        {cat && <button className="btn btn-ghost-danger" onClick={() => onDelete(cat)}><Icon name="trash" size={16} /> Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>
    }>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="field-row">
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label className="field"><span>Budget per paycheque</span><MoneyInput value={budget} onChange={setBudget} label="Budget per paycheque" /></label>
        </div>
        <div className="icon-picker">{CAT_ICONS.map((i) => <button type="button" key={i} className={icon === i ? 'on' : ''} onClick={() => setIcon(i)} aria-label={`Icon ${i}`}>{i}</button>)}</div>
        <label className="switch-row"><input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} />
          <span><b>Essential</b><small className="muted">Funded right after bills; cut last when money is tight.</small></span></label>
        <label className="switch-row"><input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
          <span><b>Roll over unspent money</b><small className="muted">Leftover budget carries into the next pay period.</small></span></label>
        {error && <p className="error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
