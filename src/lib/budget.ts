// Pure budgeting logic: pay periods, bills pot, paycheque plan, goals, loans.
// No database code here, so every rule can be unit-tested.
import type { Bill, BillPayment, Cents, Expense, Goal, GoalTransaction, Loan, Paycheque, Plan, SpendingCategory } from '../types'
import { addDays, daysBetween, fromISODate, toISODate } from './dates'
import { splitProportionally, sum } from './money'

export const PERIOD_DAYS = 14

// ---------- Pay periods ----------

export interface Period { start: string; end: string }   // end is the day before the next payday

// The pay period that contains `date`, given any known payday (`anchor`).
export function periodFor(date: string, anchor: string): Period {
  const offset = Math.floor(daysBetween(anchor, date) / PERIOD_DAYS) * PERIOD_DAYS
  const start = addDays(anchor, offset)
  return { start, end: addDays(start, PERIOD_DAYS - 1) }
}

export const nextPayday = (date: string, anchor: string) => addDays(periodFor(date, anchor).start, PERIOD_DAYS)

// Paydays on or after `from` and before `before`.
export function paydaysBetween(from: string, before: string, anchor: string): string[] {
  const out: string[] = []
  let p = periodFor(from, anchor).start
  if (p < from) p = addDays(p, PERIOD_DAYS)
  for (; p < before; p = addDays(p, PERIOD_DAYS)) out.push(p)
  return out
}

// ---------- Months & bills ----------

export const monthOf = (date: string) => date.slice(0, 7)
export function firstOfNextMonth(date: string): string {
  const d = fromISODate(date)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1))
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Due date of a bill in a month; day 31 in a 30-day month becomes the 30th, etc.
export function dueDateIn(month: string, dueDay: number): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${month}-${String(Math.min(dueDay, last)).padStart(2, '0')}`
}

export const monthlyBillsTotal = (bills: Bill[]) => sum(bills.filter((b) => b.active).map((b) => b.amount))

export const isPaid = (bill: Bill, month: string, payments: BillPayment[]) =>
  payments.some((p) => p.billId === bill.id && p.month === month)

// Bills in `month` that aren't paid yet.
export function unpaidInMonth(month: string, bills: Bill[], payments: BillPayment[]): Cents {
  return sum(bills.filter((b) => b.active && !isPaid(b, month, payments)).map((b) => b.amount))
}

export type BillStatus = 'paid' | 'auto-paid' | 'overdue' | 'due-soon' | 'upcoming'

export function billStatus(bill: Bill, month: string, payments: BillPayment[], today: string): { status: BillStatus; due: string; days: number } {
  const due = dueDateIn(month, bill.dueDay)
  const p = payments.find((x) => x.billId === bill.id && x.month === month)
  const days = daysBetween(today, due)
  if (p) return { status: p.auto ? 'auto-paid' : 'paid', due, days }
  if (days < 0) return { status: 'overdue', due, days }
  if (days <= 7) return { status: 'due-soon', due, days }
  return { status: 'upcoming', due, days }
}

// Money in the Bills pot = starting balance + everything set aside − everything paid.
export function billsPot(startBalance: Cents, paycheques: Paycheque[], payments: BillPayment[]): Cents {
  return startBalance + sum(paycheques.map((p) => p.plan.bills)) - sum(payments.filter((p) => !p.outsidePot).map((p) => p.amountPaid))
}

// "Ready for Dec 1: $X of $Y". The pot first covers this month's unpaid bills; the rest counts toward next month.
export function readiness(today: string, pot: Cents, bills: Bill[], payments: BillPayment[]) {
  const month = monthOf(today)
  const need = monthlyBillsTotal(bills)
  const ready = Math.max(0, Math.min(need, pot - unpaidInMonth(month, bills, payments)))
  return { nextFirst: firstOfNextMonth(today), ready, need, extra: Math.max(0, pot - unpaidInMonth(month, bills, payments) - need) }
}

// Average per paycheque if bills were spread evenly over the year (26 paycheques).
export const averageSetAside = (bills: Bill[]) => Math.round((monthlyBillsTotal(bills) * 12) / 26)

// How much this paycheque should put in the Bills pot so that, by the 1st of next month,
// this month's remaining bills AND all of next month's bills are covered. The gap is split
// across the paydays left before the 1st, so a month with 3 paydays needs less from each.
export function billsSetAside(payDate: string, anchor: string, pot: Cents, bills: Bill[], payments: BillPayment[]) {
  const month = monthOf(payDate)
  const nextFirst = firstOfNextMonth(payDate)
  const need = unpaidInMonth(month, bills, payments) + monthlyBillsTotal(bills)
  const paydaysLeft = Math.max(1, paydaysBetween(payDate, nextFirst, anchor).length)
  const gap = need - pot
  return {
    amount: Math.max(0, Math.ceil(gap / paydaysLeft)),
    need, paydaysLeft, nextFirst,
    average: averageSetAside(bills),
    ahead: gap <= 0 ? -gap : 0,
  }
}

// ---------- Paycheque plan ----------

export interface PlanInput {
  amount: Cents
  sadaqaRate: number                 // % e.g. 2.5
  billsNeeded: Cents
  categories: SpendingCategory[]
  goals: Goal[]
}

// Essentials come first: sadaqa → bills (rent, loans, utilities) → essential spending (groceries, medicine).
// Then non-essential spending, then goals (% of pay), then leftover.
//
// When money is tight, cuts happen in this order:
//   1. Other goals (car fund, general savings) are skipped.
//   2. The protected goal (Emergency fund) takes only what fits, up to its normal %.
//   3. Non-essential spending budgets shrink.
//   4. Essential spending budgets shrink (last resort).
// Sadaqa is never reduced. Bills take whatever is left after sadaqa and any shortfall is reported.
export function buildPlan({ amount, sadaqaRate, billsNeeded, categories, goals }: PlanInput): Plan & { shortfall: Cents } {
  const notes: string[] = []
  const sadaqa = Math.round((amount * sadaqaRate) / 100)
  let remaining = amount - sadaqa

  const bills = Math.min(billsNeeded, Math.max(0, remaining))
  const shortfall = billsNeeded - bills
  if (shortfall > 0) notes.push(`Bills are short by ${fmtNote(shortfall)}. Your next paycheque will try to catch up.`)
  remaining = Math.max(0, remaining - bills)

  const budgetsOf = (list: SpendingCategory[]) => Object.fromEntries(list.map((c) => [c.id, c.budgetPerPeriod]))
  const wantEssential = budgetsOf(categories.filter((c) => c.essential))
  const wantOther = budgetsOf(categories.filter((c) => !c.essential))
  const wantGoals = Object.fromEntries(goals.map((g) => [g.id, Math.round((amount * g.percentOfPay) / 100)]))
  const protectedGoal = goals.find((g) => g.protected)
  const E = sum(Object.values(wantEssential))
  const N = sum(Object.values(wantOther))
  const G = sum(Object.values(wantGoals))
  const P = protectedGoal ? wantGoals[protectedGoal.id] : 0
  const zero = (o: Record<string, Cents>) => Object.fromEntries(Object.keys(o).map((k) => [k, 0]))

  let essential = wantEssential, other = wantOther, goalAmounts = wantGoals
  if (remaining < E + N + G) {
    // Savings don't all fit.
    if (protectedGoal) {
      const forProtected = Math.max(0, Math.min(P, remaining - E - N))
      goalAmounts = { ...zero(wantGoals), [protectedGoal.id]: forProtected }
      const others = goals.filter((g) => !g.protected && wantGoals[g.id] > 0).map((g) => g.name)
      if (others.length) notes.push(`${others.join(' and ')} skipped this paycheque so essentials are covered.`)
      if (P > 0 && forProtected < P) {
        const newPct = Math.round((forProtected / amount) * 1000) / 10
        notes.push(forProtected === 0 ? `${protectedGoal.name} skipped this paycheque — not enough left.`
          : `${protectedGoal.name} lowered from ${protectedGoal.percentOfPay}% to ${newPct}% to fit.`)
      }
    } else {
      goalAmounts = splitProportionally(Math.max(0, remaining - E - N), wantGoals)
      if (G > 0) notes.push(`Goals reduced to ${Math.round((sum(Object.values(goalAmounts)) / G) * 100)}% of normal to fit this paycheque.`)
    }
    if (remaining < E + N) {
      other = splitProportionally(Math.max(0, remaining - E), wantOther)
      if (N > 0) notes.push(`Non-essential budgets reduced to ${Math.round((sum(Object.values(other)) / N) * 100)}% of normal.`)
    }
    if (remaining < E) {
      essential = splitProportionally(remaining, wantEssential)
      notes.push(`Not enough for essentials — groceries/medicine budgets reduced to ${Math.round((remaining / E) * 100)}% of normal.`)
    }
  }
  const spending = { ...essential, ...other }
  const leftover = Math.max(0, remaining - sum(Object.values(spending)) - sum(Object.values(goalAmounts)))
  if (leftover > 0 && notes.some((n) => n.includes('skipped'))) notes.push(`${fmtNote(leftover)} is left over — you can add it to a goal below.`)
  return { sadaqa, bills, spending, goals: goalAmounts, leftover, notes, shortfall }
}

const fmtNote = (c: Cents) => `$${(c / 100).toFixed(2)}`

export function planTotal(p: Pick<Plan, 'sadaqa' | 'bills' | 'spending' | 'goals' | 'leftover'>): Cents {
  return p.sadaqa + p.bills + sum(Object.values(p.spending)) + sum(Object.values(p.goals)) + p.leftover
}

// ---------- Spending per period ----------

// Paycheque(s) whose payday falls inside a period.
export const paychequesIn = (period: Period, paycheques: Paycheque[]) =>
  paycheques.filter((p) => p.payDate >= period.start && p.payDate <= period.end)

export const expensesIn = (period: Period, expenses: Expense[]) =>
  expenses.filter((e) => e.date >= period.start && e.date <= period.end)

// Budget for a category in a period: what the paycheque plan gave it (or the default budget if
// no paycheque was recorded yet), plus unspent money carried over when rollover is on.
export function categoryBudget(cat: SpendingCategory, period: Period, anchor: string, paycheques: Paycheque[], expenses: Expense[]) {
  const base = (p: Period) => {
    const pcs = paychequesIn(p, paycheques)
    return pcs.length ? sum(pcs.map((pc) => pc.plan.spending[cat.id] ?? 0)) : cat.budgetPerPeriod
  }
  const spentIn = (p: Period) => sum(expensesIn(p, expenses).filter((e) => e.categoryId === cat.id).map((e) => e.amount))

  let carry = 0
  if (cat.rollover) {
    // Walk forward from the earliest period with any data, carrying unspent money (never negative).
    const dates = [...paycheques.map((p) => p.payDate), ...expenses.filter((e) => e.categoryId === cat.id).map((e) => e.date)].filter((d) => d < period.start)
    if (dates.length) {
      let p = periodFor(dates.reduce((a, b) => (a < b ? a : b)), anchor)
      while (p.start < period.start) {
        carry = Math.max(0, carry + base(p) - spentIn(p))
        p = periodFor(addDays(p.end, 1), anchor)
      }
    }
  }
  const budget = base(period) + carry
  const spent = spentIn(period)
  return { budget, carry, spent, left: budget - spent }
}

// ---------- Goals ----------

export const goalBalance = (goalId: string, tx: GoalTransaction[]) => sum(tx.filter((t) => t.goalId === goalId).map((t) => t.amount))

export function averagePaycheque(paycheques: Paycheque[], last = 6): Cents {
  const recent = [...paycheques].sort((a, b) => b.payDate.localeCompare(a.payDate)).slice(0, last)
  return recent.length ? Math.round(sum(recent.map((p) => p.amount)) / recent.length) : 0
}

export function goalEstimate(goal: Goal, balance: Cents, avgPay: Cents, today: string, anchor: string) {
  if (goal.target === null) return { kind: 'no-target' as const }
  if (balance >= goal.target) return { kind: 'done' as const }
  const perPay = Math.round((avgPay * goal.percentOfPay) / 100)
  const remaining = goal.target - balance
  let neededPerPay: Cents | null = null
  if (goal.targetDate) {
    const n = paydaysBetween(addDays(today, 1), addDays(goal.targetDate, 1), anchor).length
    neededPerPay = n > 0 ? Math.ceil(remaining / n) : remaining
  }
  if (perPay <= 0) return { kind: 'no-rate' as const, neededPerPay }
  const paycheques = Math.ceil(remaining / perPay)
  const finish = addDays(nextPayday(today, anchor), (paycheques - 1) * PERIOD_DAYS)
  const onTrack = goal.targetDate ? finish <= goal.targetDate : null
  return { kind: 'estimate' as const, perPay, paycheques, finish, onTrack, neededPerPay }
}

// ---------- Loans ----------

export function loanBalance(loan: Loan, payments: BillPayment[]): Cents {
  if (!loan.billId) return loan.startingBalance
  const paid = sum(payments.filter((p) => p.billId === loan.billId && p.paidOn >= loan.startDate).map((p) => p.amountPaid))
  return Math.max(0, loan.startingBalance - paid)
}

// Months left at a monthly payment; with an interest rate, uses the standard amortization formula.
export function monthsToPayOff(balance: Cents, monthly: Cents, yearlyRate?: number): number | null {
  if (balance <= 0) return 0
  if (monthly <= 0) return null
  const r = (yearlyRate ?? 0) / 100 / 12
  if (r <= 0) return Math.ceil(balance / monthly)
  if (monthly <= balance * r) return null   // payment doesn't even cover the interest
  return Math.ceil(-Math.log(1 - (r * balance) / monthly) / Math.log(1 + r))
}

// ---------- AutoPay ----------

// Bills that should be auto-marked paid now: autoPay on, due date reached this month or last month,
// not before autoPay was turned on, not already paid, and not undone by me.
export function autoPayDue(bills: Bill[], payments: BillPayment[], today: string): { bill: Bill; month: string; due: string }[] {
  const out: { bill: Bill; month: string; due: string }[] = []
  for (const bill of bills) {
    if (!bill.active || !bill.autoPay) continue
    for (const month of [addMonths(monthOf(today), -1), monthOf(today)]) {
      const due = dueDateIn(month, bill.dueDay)
      if (due > today) continue
      if (bill.autoPaySince && due < bill.autoPaySince) continue
      if (bill.autoSkip?.includes(month) || isPaid(bill, month, payments)) continue
      out.push({ bill, month, due })
    }
  }
  return out
}
