import { describe, expect, it } from 'vitest'
import type { Bill, BillPayment, Expense, Goal, Paycheque, SpendingCategory } from '../types'
import {
  autoPayDue, billStatus, billsPot, billsSetAside, buildPlan, categoryBudget, dueDateIn, goalEstimate,
  loanBalance, monthsToPayOff, nextPayday, paydaysBetween, periodFor, planTotal, readiness,
} from './budget'
import { money, splitProportionally, toCents } from './money'
import { buildICS, monthlyRule } from './ics'

const ANCHOR = '2026-11-12'
const bill = (id: string, amount: number, dueDay: number, extra: Partial<Bill> = {}): Bill => ({
  id, name: id, icon: '🏠', amount, dueDay, category: 'Housing', autoPay: false, active: true, notes: '', createdAt: '', ...extra,
})
const pay = (billId: string, month: string, amountPaid: number, paidOn = `${month}-01`, auto = false): BillPayment => ({ id: billId + month, billId, month, amountPaid, paidOn, auto })
const cat = (id: string, budgetPerPeriod: number, rollover = false, essential = false): SpendingCategory => ({ id, name: id, icon: '🛒', budgetPerPeriod, rollover, essential, order: 0 })
const goal = (id: string, percentOfPay: number, target: number | null = null, targetDate?: string, prot = false): Goal => ({ id, name: id, icon: '💰', target, percentOfPay, priority: 1, targetDate, protected: prot })

describe('money', () => {
  it('parses and formats', () => {
    expect(toCents('1,234.56')).toBe(123456)
    expect(toCents('$12')).toBe(1200)
    expect(toCents('12.5')).toBe(1250)
    expect(toCents('0.1')).toBe(10)
    expect(toCents('abc')).toBeNull()
    expect(toCents('1.234')).toBeNull()
    expect(money(123456)).toBe('$1,234.56')
  })
  it('splits without losing cents', () => {
    const s = splitProportionally(1000, { a: 1, b: 1, c: 1 })
    expect(s.a + s.b + s.c).toBe(1000)
  })
})

describe('pay periods', () => {
  it('counts biweekly from the anchor', () => {
    expect(nextPayday('2026-11-18', ANCHOR)).toBe('2026-11-26')
    expect(nextPayday('2026-11-26', ANCHOR)).toBe('2026-12-10')
    expect(paydaysBetween('2026-11-19', '2027-01-01', ANCHOR)).toEqual(['2026-11-26', '2026-12-10', '2026-12-24'])
    expect(periodFor('2026-11-30', ANCHOR)).toEqual({ start: '2026-11-26', end: '2026-12-09' })
    expect(periodFor('2026-11-01', ANCHOR)).toEqual({ start: '2026-10-29', end: '2026-11-11' })
  })
  it('handles short months for due days', () => {
    expect(dueDateIn('2027-02', 31)).toBe('2027-02-28')
    expect(dueDateIn('2026-11', 31)).toBe('2026-11-30')
  })
})

describe('bills pot', () => {
  const bills = [bill('rent', 120000, 1), bill('phone', 5000, 15), bill('internet', 6000, 20), bill('loan', 20000, 28)]
  // monthly total = 1510.00

  it('splits next month across the paydays left, and is lighter in 3-payday months', () => {
    // Nov 12: paydays before Dec 1 = Nov 12, Nov 26. Nov bills all unpaid except rent.
    const nov = billsSetAside('2026-11-12', ANCHOR, 0, bills, [pay('rent', '2026-11', 120000)])
    expect(nov.paydaysLeft).toBe(2)
    expect(nov.need).toBe(31000 + 151000)
    expect(nov.amount).toBe(91000)
    // December has 3 paydays (Dec 10, 24 before Jan 1? only 2) — check Jan 2027: Jan 7, Jan 21 → 2; Apr 2027: Apr 1, 15, 29 → 3
    const apr = billsSetAside('2027-04-01', ANCHOR, 0, bills, [pay('rent', '2027-04', 120000), pay('phone', '2027-04', 5000), pay('internet', '2027-04', 6000), pay('loan', '2027-04', 20000)])
    expect(apr.paydaysLeft).toBe(3)
    expect(apr.amount).toBe(Math.ceil(151000 / 3))
  })

  it('catches up when behind and asks for nothing when ahead', () => {
    const behind = billsSetAside('2026-11-26', ANCHOR, 10000, bills, bills.map((b) => pay(b.id, '2026-11', b.amount)))
    expect(behind.paydaysLeft).toBe(1)
    expect(behind.amount).toBe(151000 - 10000)
    const ahead = billsSetAside('2026-11-26', ANCHOR, 160000, bills, bills.map((b) => pay(b.id, '2026-11', b.amount)))
    expect(ahead.amount).toBe(0)
    expect(ahead.ahead).toBe(9000)
  })

  it('pot and readiness', () => {
    const pcs = [{ plan: { bills: 91000 } }, { plan: { bills: 91000 } }] as Paycheque[]
    const pays = bills.map((b) => pay(b.id, '2026-11', b.amount))
    const pot = billsPot(0, pcs, pays)
    expect(pot).toBe(182000 - 151000)
    // payments made before using the app don't come out of the pot
    expect(billsPot(5000, [], [{ ...pay('rent', '2026-11', 120000), outsidePot: true }])).toBe(5000)
    const r = readiness('2026-11-27', 151000, bills, pays)
    expect(r).toMatchObject({ nextFirst: '2026-12-01', ready: 151000, need: 151000, extra: 0 })
    // phone unpaid this month: the pot covers it first
    const r2 = readiness('2026-11-10', 151000, bills, [pay('rent', '2026-11', 120000)])
    expect(r2.ready).toBe(151000 - 31000)
  })

  it('bill status', () => {
    expect(billStatus(bill('x', 1, 15), '2026-11', [], '2026-11-18').status).toBe('overdue')
    expect(billStatus(bill('x', 1, 20), '2026-11', [], '2026-11-18')).toMatchObject({ status: 'due-soon', days: 2 })
    expect(billStatus(bill('x', 1, 20), '2026-11', [pay('x', '2026-11', 1, '2026-11-20', true)], '2026-11-18').status).toBe('auto-paid')
  })
})

describe('paycheque plan', () => {
  const cats = [cat('groceries', 15000, false, true), cat('medicine', 3000, false, true), cat('transport', 5000)]
  const goals = [goal('Emergency fund', 10, null, undefined, true), goal('Car fund', 5), goal('General savings', 5)]
  const g = (p: { goals: Record<string, number> }) => [p.goals['Emergency fund'], p.goals['Car fund'], p.goals['General savings']]

  it('funds everything when it fits, balanced to the cent', () => {
    const p = buildPlan({ amount: 150000, sadaqaRate: 2.5, billsNeeded: 70000, categories: cats, goals })
    expect(p.sadaqa).toBe(3750)
    expect(p.bills).toBe(70000)
    expect(p.spending).toEqual({ groceries: 15000, medicine: 3000, transport: 5000 })
    expect(g(p)).toEqual([15000, 7500, 7500])
    expect(p.leftover).toBe(150000 - 3750 - 70000 - 23000 - 30000)
    expect(planTotal(p)).toBe(150000)
    expect(p.notes).toEqual([])
  })

  it('when savings do not fit: emergency only, at its full % if possible', () => {
    // after sadaqa 3000 + bills 70000 → 47000; spending 23000 → 24000 for goals (want 24000 total, emergency 12000)
    const p = buildPlan({ amount: 119000, sadaqaRate: 2.5, billsNeeded: 70000, categories: cats, goals })
    expect(g(p)).toEqual([11900, 0, 0])
    expect(p.notes[0]).toContain('Car fund and General savings skipped')
    expect(p.leftover).toBeGreaterThan(0)
    expect(planTotal(p)).toBe(119000)
  })

  it('lowers the emergency % to what fits', () => {
    // 100000: sadaqa 2500, bills 70000 → 27500; spending 23000 → 4500 for emergency (wants 10000)
    const p = buildPlan({ amount: 100000, sadaqaRate: 2.5, billsNeeded: 70000, categories: cats, goals })
    expect(g(p)).toEqual([4500, 0, 0])
    expect(p.notes.join(' ')).toContain('lowered from 10% to 4.5%')
    expect(p.spending).toEqual({ groceries: 15000, medicine: 3000, transport: 5000 })
    expect(p.leftover).toBe(0)
    expect(planTotal(p)).toBe(100000)
  })

  it('cuts non-essentials before essentials, never sadaqa', () => {
    // 92000: sadaqa 2300, bills 70000 → 19700; essentials 18000 → 1700 for transport
    const p = buildPlan({ amount: 92000, sadaqaRate: 2.5, billsNeeded: 70000, categories: cats, goals })
    expect(p.spending).toEqual({ groceries: 15000, medicine: 3000, transport: 1700 })
    expect(g(p)).toEqual([0, 0, 0])
    // 85000: sadaqa 2125, bills 70000 → 12875 for essentials (want 18000)
    const q = buildPlan({ amount: 85000, sadaqaRate: 2.5, billsNeeded: 70000, categories: cats, goals })
    expect(q.spending.transport).toBe(0)
    expect(q.spending.groceries + q.spending.medicine).toBe(12875)
    expect(q.sadaqa).toBe(2125)
    expect(planTotal(q)).toBe(85000)
  })

  it('reports a bills shortfall', () => {
    const p = buildPlan({ amount: 50000, sadaqaRate: 2.5, billsNeeded: 70000, categories: cats, goals })
    expect(p.sadaqa).toBe(1250)
    expect(p.bills).toBe(48750)
    expect(p.shortfall).toBe(21250)
    expect(planTotal(p)).toBe(50000)
  })
})

describe('spending', () => {
  const pcs = [
    { id: 'p1', payDate: '2026-11-12', amount: 0, notes: '', createdAt: '', plan: { sadaqa: 0, bills: 0, spending: { g: 15000 }, goals: {}, leftover: 0, notes: [] } },
  ] as Paycheque[]
  const ex = (amount: number, date: string): Expense => ({ id: date + amount, amount, categoryId: 'g', date, note: '', createdAt: '' })

  it('uses the plan amount and reports saved/over', () => {
    const b = categoryBudget(cat('g', 20000), periodFor('2026-11-15', ANCHOR), ANCHOR, pcs, [ex(18000, '2026-11-14')])
    expect(b).toMatchObject({ budget: 15000, spent: 18000, left: -3000, carry: 0 })
    // no paycheque recorded for the next period → falls back to the category budget
    expect(categoryBudget(cat('g', 20000), periodFor('2026-11-30', ANCHOR), ANCHOR, pcs, []).budget).toBe(20000)
  })

  it('rolls unspent money forward, never negative', () => {
    const c = cat('g', 20000, true)
    const b = categoryBudget(c, periodFor('2026-11-30', ANCHOR), ANCHOR, pcs, [ex(10000, '2026-11-14')])
    expect(b.carry).toBe(5000)
    expect(b.budget).toBe(25000)
    const over = categoryBudget(c, periodFor('2026-11-30', ANCHOR), ANCHOR, pcs, [ex(30000, '2026-11-14')])
    expect(over.carry).toBe(0)
  })
})

describe('goals, loans, autopay, ics', () => {
  it('estimates a finish date', () => {
    const e = goalEstimate(goal('ef', 10, 1000000, '2027-06-30'), 260000, 150000, '2026-11-18', ANCHOR)
    expect(e).toMatchObject({ kind: 'estimate', perPay: 15000, paycheques: 50, finish: '2028-10-12', onTrack: false })
    expect(goalEstimate(goal('x', 10, null), 0, 1, '2026-11-18', ANCHOR).kind).toBe('no-target')
    expect(goalEstimate(goal('x', 10, 100), 100, 1, '2026-11-18', ANCHOR).kind).toBe('done')
  })

  it('loan balance and payoff', () => {
    const loan = { id: 'l', name: 'OSAP', startingBalance: 1000000, startDate: '2026-11-01', billId: 'loan', notes: '' }
    expect(loanBalance(loan, [pay('loan', '2026-11', 20000, '2026-11-28'), pay('loan', '2026-10', 20000, '2026-10-28')])).toBe(980000)
    expect(monthsToPayOff(980000, 20000)).toBe(49)
    expect(monthsToPayOff(1000000, 20000, 6)).toBe(58)
    expect(monthsToPayOff(1000000, 1000, 6)).toBeNull()
  })

  it('autopay only marks due bills since it was turned on, and respects undo', () => {
    const b = bill('rent', 120000, 1, { autoPay: true, autoPaySince: '2026-11-10' })
    expect(autoPayDue([b], [], '2026-11-18')).toEqual([])               // Nov 1 was before autoPay was on
    expect(autoPayDue([b], [], '2026-12-01').map((x) => x.month)).toEqual(['2026-12'])
    expect(autoPayDue([{ ...b, autoSkip: ['2026-12'] }], [], '2026-12-02')).toEqual([])
    expect(autoPayDue([b], [pay('rent', '2026-12', 1)], '2026-12-02')).toEqual([])
    expect(autoPayDue([{ ...b, autoPay: false }], [], '2026-12-02')).toEqual([])
  })

  it('ics has recurring bills and paydays with alarms', () => {
    expect(monthlyRule(30)).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1')
    const ics = buildICS([bill('rent', 120000, 1)], { rent: '2026-12-01' }, '2026-11-26', money)
    expect(ics).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=1')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261126')
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2)
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
  })
})
