// All money is stored as integer cents (e.g. $12.34 = 1234) to avoid rounding errors.
export type Cents = number

export const BILL_CATEGORIES = ['Housing', 'Utilities', 'Loan', 'Subscription', 'Other'] as const
export type BillCategory = (typeof BILL_CATEGORIES)[number]

export interface Bill {
  id: string
  name: string
  icon: string
  amount: Cents
  dueDay: number            // 1-31; shorter months use their last day
  category: BillCategory
  autoPay: boolean
  autoPaySince?: string     // YYYY-MM-DD the switch was turned on (older months are never auto-marked)
  autoSkip?: string[]       // months (YYYY-MM) where I undid an auto payment, so it isn't re-added
  active: boolean
  notes: string
  createdAt: string
}

export interface BillPayment {
  id: string
  billId: string
  month: string             // YYYY-MM
  amountPaid: Cents
  paidOn: string            // YYYY-MM-DD
  auto: boolean
  outsidePot?: boolean      // paid before I started using the app — doesn't come out of the Bills pot
}

export interface Loan {
  id: string
  name: string
  startingBalance: Cents    // balance on the day I added it
  startDate: string         // payments on/after this date reduce the balance
  billId: string | null     // the monthly bill that pays it
  interestRate?: number     // yearly %, display/estimate only
  notes: string
}

export interface SpendingCategory {
  id: string
  name: string
  icon: string
  budgetPerPeriod: Cents
  essential: boolean        // essentials (groceries, medicine) are cut last when money is tight
  rollover: boolean
  order: number
}

export interface Expense {
  id: string
  amount: Cents
  categoryId: string
  date: string              // YYYY-MM-DD
  note: string
  createdAt: string
}

export interface Goal {
  id: string
  name: string
  icon: string
  target: Cents | null      // null = no target
  targetDate?: string
  percentOfPay: number      // e.g. 10 = 10%
  priority: number          // 1 = first
  protected: boolean        // the one goal still funded when money is tight (Emergency fund)
}

export interface GoalTransaction {
  id: string
  goalId: string
  amount: Cents             // + deposit / − withdrawal
  date: string
  note: string
  source: 'paycheque' | 'manual'
  paychequeId?: string
}

export interface SadaqaEntry {
  id: string
  date: string
  amount: Cents
  type: 'aside' | 'given'
  note: string
  paychequeId?: string
}

// The plan saved with each paycheque, so history stays accurate if settings change later.
export interface Plan {
  sadaqa: Cents
  bills: Cents
  spending: Record<string, Cents>   // categoryId -> amount
  goals: Record<string, Cents>      // goalId -> amount
  leftover: Cents
  notes: string[]                   // e.g. "Goals reduced by 40% to fit this paycheque"
}

export interface Paycheque {
  id: string
  payDate: string
  amount: Cents
  notes: string
  plan: Plan
  createdAt: string
}
