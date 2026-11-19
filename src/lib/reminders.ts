// Things to remind me about when I open the app, plus optional browser notifications.
import type { Data } from './store'
import { billStatus, monthOf, paychequesIn, periodFor } from './budget'
import { sum, money } from './money'
import { addDays, friendlyDate } from './dates'

export interface Reminder { id: string; tone: 'red' | 'amber' | 'blue'; text: string; link: string }

export function buildReminders(d: Data, today: string, anchor: string): Reminder[] {
  const out: Reminder[] = []
  const month = monthOf(today)

  const period = periodFor(today, anchor)
  if (period.start === today && paychequesIn(period, d.paycheques).length === 0) {
    out.push({ id: `payday-${today}`, tone: 'blue', text: 'Payday today — record your paycheque', link: '/paycheques/new' })
  } else if (paychequesIn(period, d.paycheques).length === 0 && d.paycheques.length > 0) {
    out.push({ id: `payday-${period.start}`, tone: 'amber', text: `Paycheque for ${friendlyDate(period.start)} not recorded yet`, link: '/paycheques/new' })
  }

  for (const b of d.bills.filter((x) => x.active)) {
    const s = billStatus(b, month, d.billPayments, today)
    if (s.status === 'overdue') out.push({ id: `bill-${b.id}-${month}`, tone: 'red', text: `${b.icon} ${b.name} (${money(b.amount)}) was due ${friendlyDate(s.due)}`, link: '/bills' })
    else if (s.status === 'due-soon' && !b.autoPay) out.push({ id: `bill-${b.id}-${month}`, tone: 'amber', text: `${b.icon} ${b.name} (${money(b.amount)}) due ${s.days === 0 ? 'today' : s.days === 1 ? 'tomorrow' : `in ${s.days} days`}`, link: '/bills' })
  }
  // Near the end of a month, next month's early bills are also "due soon".
  const next = monthOf(addDays(today, 7))
  if (next !== month) {
    for (const b of d.bills.filter((x) => x.active && !x.autoPay)) {
      const s = billStatus(b, next, d.billPayments, today)
      if (s.status === 'due-soon') out.push({ id: `bill-${b.id}-${next}`, tone: 'amber', text: `${b.icon} ${b.name} (${money(b.amount)}) due ${s.days === 0 ? 'today' : s.days === 1 ? 'tomorrow' : `in ${s.days} days`}`, link: '/bills' })
    }
  }

  const toGive = sum(d.sadaqa.map((s) => (s.type === 'aside' ? s.amount : -s.amount)))
  if (toGive > 0) out.push({ id: `sadaqa-${period.start}`, tone: 'blue', text: `Sadaqa to give: ${money(toGive)}`, link: '/sadaqa' })
  return out
}

// ---------- Browser notifications (only while the app is open) ----------

export const notificationsSupported = () => 'Notification' in window && 'serviceWorker' in navigator

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false
  return (await Notification.requestPermission()) === 'granted'
}

const SHOWN_KEY = 'bt-notified'

// Shows each reminder at most once per day. Uses the service worker so it also works on Android.
export async function notify(reminders: Reminder[], today: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  let shown: Record<string, string> = {}
  try { shown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') } catch { /* ignore */ }
  const reg = await navigator.serviceWorker.getRegistration()
  for (const r of reminders) {
    if (shown[r.id] === today) continue
    try {
      if (reg) await reg.showNotification('Budget Tracker', { body: r.text, tag: r.id, icon: 'icon-192.png' })
      else new Notification('Budget Tracker', { body: r.text, tag: r.id })
      shown[r.id] = today
    } catch { /* notifications blocked */ }
  }
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(shown)) } catch { /* ignore */ }
}
