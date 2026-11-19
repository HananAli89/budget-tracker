// JSON backup / restore and CSV export.
import { db } from '../db'
import { getSettings, updateSettings, type Settings } from './settings'
import { todayISO } from './dates'

const FORMAT = 'budget-tracker'
const VERSION = 1
const TABLES = ['paycheques', 'bills', 'billPayments', 'loans', 'categories', 'expenses', 'goals', 'goalTx', 'sadaqa'] as const
type TableName = (typeof TABLES)[number]

export interface Backup {
  format: typeof FORMAT
  version: number
  exportedAt: string
  settings: Settings
  data: Record<TableName, { id: string }[]>
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const table = (name: TableName) => db.table(name)

export async function exportBackup() {
  const data = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await table(t).toArray()]))) as Backup['data']
  const backup: Backup = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), settings: getSettings(), data }
  download(`budget-backup-${todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json')
}

export function parseBackup(text: string): Backup {
  let b: Partial<Backup>
  try { b = JSON.parse(text) } catch { throw new Error('This file is not valid JSON.') }
  if (b.format !== FORMAT) throw new Error('This file is not a Budget Tracker backup.')
  if ((b.version ?? 0) > VERSION) throw new Error('This backup was made by a newer version of the app.')
  if (!b.data || TABLES.some((t) => !Array.isArray(b.data![t]))) throw new Error('The backup is incomplete, so nothing was restored.')
  if (TABLES.some((t) => b.data![t].some((r) => !r || typeof r.id !== 'string'))) throw new Error('The backup contains damaged records, so nothing was restored.')
  return b as Backup
}

export const backupCounts = (b: Backup) => Object.fromEntries(TABLES.map((t) => [t, b.data[t].length])) as Record<TableName, number>

// Merge adds records whose IDs aren't here yet; Replace wipes first. One transaction: a failure changes nothing.
export async function restoreBackup(b: Backup, mode: 'merge' | 'replace'): Promise<number> {
  let added = 0
  await db.transaction('rw', TABLES.map(table), async () => {
    if (mode === 'merge') await dropUnusedStarters(b)
    for (const t of TABLES) {
      if (mode === 'replace') await table(t).clear()
      const have = new Set(await table(t).toCollection().primaryKeys())
      const fresh = b.data[t].filter((r) => !have.has(r.id))
      await table(t).bulkAdd(fresh)
      added += fresh.length
    }
  })
  if (mode === 'replace') updateSettings(b.settings)
  return added
}

// A new device starts with its own starter categories/goals. When a backup has ones with the same
// name, remove the local copies if nothing uses them yet, so merging doesn't create duplicates.
async function dropUnusedStarters(b: Backup) {
  const names = (rows: { id: string }[]) => new Set(rows.map((r) => (r as unknown as { name: string }).name?.toLowerCase()))
  const [expenses, goalTx, paycheques] = await Promise.all([db.expenses.toArray(), db.goalTx.toArray(), db.paycheques.toArray()])
  const usedCats = new Set([...expenses.map((e) => e.categoryId), ...paycheques.flatMap((p) => Object.keys(p.plan.spending))])
  const usedGoals = new Set([...goalTx.map((t) => t.goalId), ...paycheques.flatMap((p) => Object.keys(p.plan.goals))])
  const backupIds = new Set([...b.data.categories, ...b.data.goals].map((r) => r.id))
  const catNames = names(b.data.categories), goalNames = names(b.data.goals)
  for (const c of await db.categories.toArray()) {
    if (!backupIds.has(c.id) && !usedCats.has(c.id) && catNames.has(c.name.toLowerCase())) await db.categories.delete(c.id)
  }
  for (const g of await db.goals.toArray()) {
    if (!backupIds.has(g.id) && !usedGoals.has(g.id) && goalNames.has(g.name.toLowerCase())) await db.goals.delete(g.id)
  }
}

export async function deleteAllData() {
  await db.transaction('rw', TABLES.map(table), async () => { for (const t of TABLES) await table(t).clear() })
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCSV = (rows: Record<string, unknown>[]) =>
  rows.length ? [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(csvCell).join(','))].join('\n') : ''

export async function exportCSV() {
  const cats = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]))
  const expenses = await db.expenses.orderBy('date').toArray()
  download(`expenses-${todayISO()}.csv`, toCSV(expenses.map((e) => ({
    Date: e.date, Category: cats.get(e.categoryId) ?? '', Amount: (e.amount / 100).toFixed(2), Note: e.note,
  }))), 'text/csv')
  const pcs = await db.paycheques.orderBy('payDate').toArray()
  download(`paycheques-${todayISO()}.csv`, toCSV(pcs.map((p) => ({
    'Pay date': p.payDate, Amount: (p.amount / 100).toFixed(2), Sadaqa: (p.plan.sadaqa / 100).toFixed(2),
    'Bills set aside': (p.plan.bills / 100).toFixed(2),
    Spending: (Object.values(p.plan.spending).reduce((a, b) => a + b, 0) / 100).toFixed(2),
    Goals: (Object.values(p.plan.goals).reduce((a, b) => a + b, 0) / 100).toFixed(2),
    Leftover: (p.plan.leftover / 100).toFixed(2), Notes: p.notes,
  }))), 'text/csv')
}
