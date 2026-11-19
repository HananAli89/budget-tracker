// Builds a calendar (.ics) file with repeating bill and payday events, each with a reminder
// at 9 am the day before. Import it into Google Calendar once.
import type { Bill } from '../types'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
const ymd = (iso: string) => iso.replace(/-/g, '')

// Lines over 75 characters must be folded (continued on the next line after a space).
function fold(line: string): string {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73))
  return parts.join('\r\n ')
}

// Day 29/30 falls back to the month's last available day (e.g. Feb 28); 31 = last day of every month.
export function monthlyRule(dueDay: number): string {
  if (dueDay >= 31) return 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1'
  if (dueDay >= 29) return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: dueDay - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`
  return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dueDay}`
}

function event(uid: string, start: string, summary: string, rule: string, description: string, stamp: string): string[] {
  const next = new Date(start + 'T00:00:00'); next.setDate(next.getDate() + 1)
  const end = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`
  return [
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${end}`,
    rule, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(description)}`, 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'TRIGGER:-PT15H', 'END:VALARM',
    'END:VEVENT',
  ]
}

export function buildICS(bills: Bill[], firstDueDates: Record<string, string>, nextPayday: string, money: (c: number) => string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Budget reminders']
  for (const b of bills.filter((x) => x.active)) {
    lines.push(...event(`bill-${b.id}@budget-tracker`, firstDueDates[b.id], `${b.icon} ${b.name} due (${money(b.amount)})`,
      monthlyRule(b.dueDay), b.autoPay ? 'Auto-pay — check it went through.' : 'Pay it and mark it paid in Budget Tracker.', stamp))
  }
  lines.push(...event('payday@budget-tracker', nextPayday, '💵 Payday — record your paycheque', 'RRULE:FREQ=WEEKLY;INTERVAL=2',
    'Open Budget Tracker and record your paycheque.', stamp))
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
