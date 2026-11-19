import type { Cents } from '../types'

const fmt = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

// 123456 -> "$1,234.56"
export function money(c: Cents): string {
  return fmt.format(c / 100).replace('CA', '')
}

// "1,234.56", "$12", "12.5" -> cents. Returns null when it isn't a valid amount.
export function toCents(input: string): Cents | null {
  const s = input.replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d{0,2})?$/.test(s) && !/^-?\.\d{1,2}$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

// For pre-filling inputs: 1250 -> "12.50"
export const centsToInput = (c: Cents) => (c / 100).toFixed(2)

export const pct = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0)

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// Splits `total` across weights so the parts add up exactly (no lost cents).
export function splitProportionally(total: Cents, weights: Record<string, number>): Record<string, Cents> {
  const keys = Object.keys(weights)
  const wsum = sum(keys.map((k) => weights[k]))
  const out: Record<string, Cents> = {}
  if (wsum <= 0 || total <= 0) { keys.forEach((k) => (out[k] = 0)); return out }
  let given = 0
  const rema: [string, number][] = []
  for (const k of keys) {
    const exact = (total * weights[k]) / wsum
    out[k] = Math.floor(exact)
    given += out[k]
    rema.push([k, exact - out[k]])
  }
  // Hand out the leftover cents to the largest remainders.
  rema.sort((a, b) => b[1] - a[1])
  for (let i = 0; i < total - given; i++) out[rema[i % rema.length][0]] += 1
  return out
}
