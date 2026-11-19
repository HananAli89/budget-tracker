// Reading and writing data. Hooks re-render automatically when the database changes.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId, nowStamp } from '../db'
import type { Bill, BillPayment, Cents, Expense, Goal, Loan, Plan, SpendingCategory } from '../types'
import { autoPayDue, billsPot, billsSetAside } from './budget'
import { todayISO } from './dates'
import { getSettings } from './settings'

// One hook that loads everything (the data set is small, so this keeps pages simple).
export function useData() {
  return useLiveQuery(async () => {
    const [paycheques, bills, billPayments, loans, categories, expenses, goals, goalTx, sadaqa] = await Promise.all([
      db.paycheques.orderBy('payDate').toArray(),
      db.bills.toArray(),
      db.billPayments.toArray(),
      db.loans.toArray(),
      db.categories.orderBy('order').toArray(),
      db.expenses.orderBy('date').toArray(),
      db.goals.orderBy('priority').toArray(),
      db.goalTx.toArray(),
      db.sadaqa.orderBy('date').toArray(),
    ])
    bills.sort((a, b) => a.dueDay - b.dueDay || a.name.localeCompare(b.name))
    return { paycheques, bills, billPayments, loans, categories, expenses, goals, goalTx, sadaqa }
  }, [])
}
export type Data = NonNullable<ReturnType<typeof useData>>

// ---------- Paycheques ----------

export async function suggestedBills(payDate: string): Promise<ReturnType<typeof billsSetAside>> {
  const [bills, payments, paycheques] = await Promise.all([db.bills.toArray(), db.billPayments.toArray(), db.paycheques.toArray()])
  const pot = billsPot(getSettings().startingPot, paycheques, payments)
  return billsSetAside(payDate, getSettings().paydayAnchor, pot, bills, payments)
}

// Saves the paycheque with its plan, and records the sadaqa and goal money it set aside.
export async function recordPaycheque(payDate: string, amount: Cents, plan: Plan, notes: string): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.paycheques, db.sadaqa, db.goalTx, async () => {
    await db.paycheques.add({ id, payDate, amount, notes, plan, createdAt: nowStamp() })
    if (plan.sadaqa > 0) await db.sadaqa.add({ id: newId(), date: payDate, amount: plan.sadaqa, type: 'aside', note: '2.5% of paycheque', paychequeId: id })
    for (const [goalId, amt] of Object.entries(plan.goals)) {
      if (amt > 0) await db.goalTx.add({ id: newId(), goalId, amount: amt, date: payDate, note: 'From paycheque', source: 'paycheque', paychequeId: id })
    }
  })
  return id
}

export async function deletePaycheque(id: string) {
  await db.transaction('rw', db.paycheques, db.sadaqa, db.goalTx, async () => {
    await db.paycheques.delete(id)
    await db.sadaqa.where('paychequeId').equals(id).delete()
    await db.goalTx.where('paychequeId').equals(id).delete()
  })
}

// ---------- Bills ----------

export async function saveBill(bill: Partial<Bill> & Pick<Bill, 'name' | 'amount' | 'dueDay'>): Promise<string> {
  if (bill.id) {
    const old = await db.bills.get(bill.id)
    // Turning autoPay on starts from today, so past months are never auto-marked.
    const autoPaySince = bill.autoPay && !old?.autoPay ? todayISO() : old?.autoPaySince
    await db.bills.update(bill.id, { ...bill, autoPaySince })
    return bill.id
  } else {
    const id = newId()
    await db.bills.add({
      icon: '🧾', category: 'Other', autoPay: false, active: true, notes: '', createdAt: nowStamp(), ...bill,
      id, autoPaySince: bill.autoPay ? todayISO() : undefined,
    } as Bill)
    return id
  }
}

export async function deleteBill(id: string) {
  await db.transaction('rw', db.bills, db.billPayments, db.loans, async () => {
    await db.bills.delete(id)
    await db.billPayments.where('billId').equals(id).delete()
    await db.loans.filter((l) => l.billId === id).modify({ billId: null })
  })
}

export async function markPaid(bill: Bill, month: string, amountPaid: Cents, paidOn: string, auto = false, outsidePot = false) {
  await db.billPayments.add({ id: newId(), billId: bill.id, month, amountPaid, paidOn, auto, outsidePot })
}

// Undoing an auto payment remembers the month, so autoPay doesn't immediately re-add it.
export async function undoPayment(p: BillPayment) {
  await db.transaction('rw', db.billPayments, db.bills, async () => {
    await db.billPayments.delete(p.id)
    if (p.auto) {
      const bill = await db.bills.get(p.billId)
      if (bill) await db.bills.update(bill.id, { autoSkip: [...new Set([...(bill.autoSkip ?? []), p.month])] })
    }
  })
}

// Runs when the app opens. Returns the names of bills it marked paid.
export async function runAutoPay(today = todayISO()): Promise<string[]> {
  const [bills, payments] = await Promise.all([db.bills.toArray(), db.billPayments.toArray()])
  const due = autoPayDue(bills, payments, today)
  for (const d of due) await markPaid(d.bill, d.month, d.bill.amount, d.due, true)
  return due.map((d) => d.bill.name)
}

// ---------- Loans, categories, expenses, goals, sadaqa ----------

export const saveLoan = async (loan: Partial<Loan> & Pick<Loan, 'name' | 'startingBalance'>) =>
  loan.id ? db.loans.update(loan.id, loan) : db.loans.add({ startDate: todayISO(), billId: null, notes: '', ...loan, id: newId() } as Loan)
export const deleteLoan = (id: string) => db.loans.delete(id)

export async function saveCategory(c: Partial<SpendingCategory> & Pick<SpendingCategory, 'name'>) {
  if (c.id) return db.categories.update(c.id, c)
  const order = (await db.categories.count()) + 1
  return db.categories.add({ icon: '🏷️', budgetPerPeriod: 0, essential: false, rollover: false, order, ...c, id: newId() } as SpendingCategory)
}
export async function deleteCategory(id: string) {
  // Expenses stay in history but move to "Other" so totals still add up.
  await db.transaction('rw', db.categories, db.expenses, async () => {
    let other = (await db.categories.toArray()).find((c) => c.name === 'Other' && c.id !== id)
    if (!other) { await saveCategory({ name: 'Other', icon: '🏷️' }); other = (await db.categories.toArray()).find((c) => c.name === 'Other')! }
    await db.expenses.where('categoryId').equals(id).modify({ categoryId: other.id })
    await db.categories.delete(id)
  })
}

export const addExpense = (e: Omit<Expense, 'id' | 'createdAt'>) => db.expenses.add({ ...e, id: newId(), createdAt: nowStamp() })
export const updateExpense = (id: string, e: Partial<Expense>) => db.expenses.update(id, e)
export const deleteExpense = (id: string) => db.expenses.delete(id)

export async function saveGoal(g: Partial<Goal> & Pick<Goal, 'name'>) {
  await db.transaction('rw', db.goals, async () => {
    // Only one goal can be the protected one.
    if (g.protected) await db.goals.toCollection().modify({ protected: false })
    if (g.id) await db.goals.update(g.id, g)
    else await db.goals.add({ icon: '🎯', target: null, percentOfPay: 0, priority: (await db.goals.count()) + 1, protected: false, ...g, id: newId() } as Goal)
  })
}
export async function deleteGoal(id: string) {
  await db.transaction('rw', db.goals, db.goalTx, async () => {
    await db.goals.delete(id)
    await db.goalTx.where('goalId').equals(id).delete()
  })
}
export const goalMove = (goalId: string, amount: Cents, note: string, date = todayISO()) =>
  db.goalTx.add({ id: newId(), goalId, amount, date, note, source: 'manual' })

export const recordSadaqaGiven = (amount: Cents, note: string, date = todayISO()) =>
  db.sadaqa.add({ id: newId(), date, amount, type: 'given', note })
export const deleteSadaqa = (id: string) => db.sadaqa.delete(id)
