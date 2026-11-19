# Budget Tracker

A personal budget tracker built for **biweekly pay** and **monthly bills**. Each paycheque gets a plan: sadaqa, bills, essentials, spending, and savings goals. You always know whether next month's bills are covered before the 1st.

- Works offline and installs as an app (PWA) on Android and desktop Chrome
- All data stays on your device (IndexedDB). No account, no server, no bank connection
- Light / dark mode, CAD

## How it works

### Each paycheque
Record the amount on payday and the app builds a plan in this order:

1. **Sadaqa** – 2.5% of the paycheque (rate is a setting)
2. **Bills pot** – what's needed so that, by the 1st of next month, this month's remaining bills **and** all of next month's bills are covered. The gap is split across the paydays left before the 1st, so months with 3 paydays need less from each one. If you fall behind, the next paycheque catches up automatically.
3. **Essential spending** – categories marked *Essential* (groceries, medicine)
4. **Other spending** – transport, shopping, …
5. **Savings goals** – each gets a % of the paycheque
6. **Free to spend** – whatever is left

You can change any line before confirming.

### When money is tight
Cuts happen in this order:
1. Car fund and general savings are skipped.
2. The **Emergency fund** (the goal marked "keep funding when money is tight") gets only what fits, up to its normal %.
3. Non-essential budgets shrink.
4. Essential budgets shrink (last resort).

Sadaqa is never reduced. If even bills can't be covered, the plan shows the shortfall and the next paycheque tries to catch up.

### Bills
Enter each bill **once** (amount + due day); it repeats monthly.
- Tap **Mark paid** when it comes out.
- Turn on **AutoPay** for bills that pay automatically, and they're marked paid on their due day.
- Loans linked to a bill go down each time it's paid, with a payoff estimate.
- When you add a bill whose due day already passed this month, tick **Already paid for this month**. It won't show as overdue and won't come out of the Bills pot.

### Spending
Use the **+** button to add a purchase in a few seconds. Each category shows Budget / Spent / Left for the pay period, plus *Saved* or *Over by*. Turn on **rollover** for a category to carry unspent money forward.

## Setup checklist
1. **Settings:** check the payday date (default 2026-11-12, every 2 weeks).
2. **Bills:** add rent, phone, internet, loan payments, etc.
3. **Settings → Spending categories:** set a budget per paycheque for groceries, medicine and transport.
4. **Goals:** set targets (and optional dates). Adjust % of pay.
   - Optional: add money you already have with **Add money**, and set **Bills pot starting balance** in Settings if you already have money saved for bills.
5. **Record your paycheque.**

## Reminders
The app can only alert you **while it's open**: overdue and upcoming bills, payday, and sadaqa to give show on Home, and optionally as notifications.

For reminders when the app is closed, go to **Settings → Download calendar reminders (.ics)** and import it into Google Calendar once:
1. On a computer, open calendar.google.com → ⚙️ Settings → **Import & export**.
2. Pick the file. Choosing a separate "Bills" calendar is a good idea.
3. Bills repeat monthly and paydays every 2 weeks, each with a reminder at 9 am the day before. If you don't get alerts, add a default notification to that calendar.

Re-import only if your bills change, and delete the old events first.

## Run locally
```bash
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests for all the money logic
npm run build
```

## Deploy (free, GitHub Pages)
`.github/workflows/deploy.yml` runs the tests, builds, and publishes on every push to `main`.
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`.

The app is live at `https://<username>.github.io/<repo-name>/`.

## Install on Android
Open the link in Chrome, then tap **⋮ → Add to Home screen → Install**.

## Back up and move devices
- **Back up:** Settings → **Export backup**. Do it regularly.
- **New device:** Settings → **Restore backup** → **Merge**.
- **CSV:** Settings → **Export CSV** (expenses + paycheques).

Clearing the browser's site data or uninstalling can delete your data, so keep a backup.

## Known limitations
- No sync between devices. Use backup/restore.
- No alerts while the app is closed. Use the calendar file.
- No charts yet.
- Loan payoff is an estimate (uses the interest rate if you enter one).

## Project structure
```
src/
  types.ts           data types (all money in cents)
  db.ts              IndexedDB tables + first-run starter categories/goals
  lib/
    budget.ts        pure logic: pay periods, bills pot, paycheque plan, goals, loans, autoPay
    budget.test.ts   unit tests for the logic
    money.ts         parsing/formatting, exact splitting
    store.ts         reading/writing data
    reminders.ts     in-app reminders + notifications
    ics.ts           calendar file
    backup.ts        JSON backup/restore, CSV export
    settings.ts      preferences (localStorage)
  components/        layout, quick-add expense, inputs, modals
  pages/             Home, Spending, Bills, Goals, Paycheques, Sadaqa, Settings
```
