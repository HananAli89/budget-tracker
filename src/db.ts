import Dexie, { type EntityTable } from 'dexie'
import type { Bill, BillPayment, Expense, Goal, GoalTransaction, Loan, Paycheque, SadaqaEntry, SpendingCategory } from './types'

// IndexedDB database. Every change is written here immediately.
export const db = new Dexie('budget-tracker') as Dexie & {
  paycheques: EntityTable<Paycheque, 'id'>
  bills: EntityTable<Bill, 'id'>
  billPayments: EntityTable<BillPayment, 'id'>
  loans: EntityTable<Loan, 'id'>
  categories: EntityTable<SpendingCategory, 'id'>
  expenses: EntityTable<Expense, 'id'>
  goals: EntityTable<Goal, 'id'>
  goalTx: EntityTable<GoalTransaction, 'id'>
  sadaqa: EntityTable<SadaqaEntry, 'id'>
}

// Only the fields listed are indexed; every other field is still stored.
db.version(1).stores({
  paycheques: 'id, payDate',
  bills: 'id',
  billPayments: 'id, billId, month',
  loans: 'id',
  categories: 'id, order',
  expenses: 'id, date, categoryId',
  goals: 'id, priority',
  goalTx: 'id, goalId, paychequeId',
  sadaqa: 'id, date, paychequeId',
})

export const newId = () => crypto.randomUUID()
export const nowStamp = () => new Date().toISOString()

// First run: starter categories and goals. Budgets and targets start empty for me to fill in.
db.on('populate', (tx) => {
  tx.table('categories').bulkAdd([
    { id: newId(), name: 'Groceries', icon: '🛒', budgetPerPeriod: 0, essential: true, rollover: false, order: 1 },
    { id: newId(), name: 'Medicine', icon: '💊', budgetPerPeriod: 0, essential: true, rollover: false, order: 2 },
    { id: newId(), name: 'Transportation', icon: '🚌', budgetPerPeriod: 0, essential: false, rollover: false, order: 3 },
    { id: newId(), name: 'Shopping', icon: '🛍️', budgetPerPeriod: 0, essential: false, rollover: false, order: 4 },
  ])
  tx.table('goals').bulkAdd([
    { id: newId(), name: 'Emergency fund', icon: '🆘', target: null, percentOfPay: 10, priority: 1, protected: true },
    { id: newId(), name: 'Car fund', icon: '🚗', target: null, percentOfPay: 5, priority: 2, protected: false },
    { id: newId(), name: 'General savings', icon: '💰', target: null, percentOfPay: 5, priority: 3, protected: false },
  ])
})
