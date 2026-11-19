import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { getSettings, useSettings } from './lib/settings'
import { runAutoPay } from './lib/store'
import { buildReminders, notify } from './lib/reminders'
import { db } from './db'
import { todayISO } from './lib/dates'
import { UIProvider, useUI } from './components/ui'
import { ExpenseEditorProvider } from './components/ExpenseEditor'
import { Layout, MorePage } from './components/Layout'
import { Home } from './pages/Home'
import { PaychequesPage, RecordPaycheque } from './pages/Paycheques'
import { BillsPage } from './pages/Bills'
import { SpendingPage } from './pages/Spending'
import { GoalsPage } from './pages/Goals'
import { SadaqaPage } from './pages/Sadaqa'
import { SettingsPage } from './pages/Settings'

function useTheme() {
  const { theme } = useSettings()
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1718' : '#fbf8f6')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

// On open: auto-mark autoPay bills, then show reminders as notifications (if turned on).
function Startup() {
  const { toast } = useUI()
  useEffect(() => {
    (async () => {
      const paid = await runAutoPay()
      if (paid.length) {
        try { sessionStorage.setItem('bt-autopaid', JSON.stringify(paid)) } catch { /* ignore */ }
        toast(`Auto-marked paid: ${paid.join(', ')}`)
      }
      const [paycheques, bills, billPayments, sadaqa] = await Promise.all([db.paycheques.toArray(), db.bills.toArray(), db.billPayments.toArray(), db.sadaqa.toArray()])
      const data = { paycheques, bills, billPayments, sadaqa, loans: [], categories: [], expenses: [], goals: [], goalTx: [] }
      notify(buildReminders(data, todayISO(), getSettings().paydayAnchor), todayISO())
    })()
  }, [toast])
  return null
}

export default function App() {
  useTheme()
  return (
    <HashRouter>
      <UIProvider>
        <ExpenseEditorProvider>
          <Startup />
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="spending" element={<SpendingPage />} />
              <Route path="bills" element={<BillsPage />} />
              <Route path="goals" element={<GoalsPage />} />
              <Route path="paycheques" element={<PaychequesPage />} />
              <Route path="paycheques/new" element={<RecordPaycheque />} />
              <Route path="sadaqa" element={<SadaqaPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="more" element={<MorePage />} />
              <Route path="*" element={<Home />} />
            </Route>
          </Routes>
        </ExpenseEditorProvider>
      </UIProvider>
    </HashRouter>
  )
}
