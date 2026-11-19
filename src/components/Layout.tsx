import { NavLink, Outlet } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useExpenseEditor } from './ExpenseEditor'

const NAV: { to: string; label: string; icon: IconName; mobile?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', mobile: true },
  { to: '/spending', label: 'Spending', icon: 'wallet', mobile: true },
  { to: '/bills', label: 'Bills', icon: 'receipt', mobile: true },
  { to: '/goals', label: 'Goals', icon: 'target', mobile: true },
  { to: '/paycheques', label: 'Paycheques', icon: 'cash' },
  { to: '/sadaqa', label: 'Sadaqa', icon: 'heart' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function Layout() {
  const { open } = useExpenseEditor()
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">$</span> Budget</div>
        <button className="btn btn-primary add-btn" onClick={() => open()}><Icon name="plus" size={16} /> Add expense</button>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link"><Icon name={n.icon} /> {n.label}</NavLink>
          ))}
        </nav>
      </aside>
      <main className="main"><Outlet /></main>
      <button className="fab" onClick={() => open()} aria-label="Add expense"><Icon name="plus" size={24} /></button>
      <nav className="bottom-nav">
        {NAV.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="bottom-link"><Icon name={n.icon} size={20} /><span>{n.label}</span></NavLink>
        ))}
        <NavLink to="/more" className="bottom-link"><Icon name="more" size={20} /><span>More</span></NavLink>
      </nav>
    </div>
  )
}

export function MorePage() {
  return (
    <div className="page">
      <header className="page-head"><h1>More</h1></header>
      <div className="card more-list">
        {NAV.filter((n) => !n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} className="more-link"><Icon name={n.icon} /> {n.label} <span className="spacer" /><Icon name="right" size={16} /></NavLink>
        ))}
      </div>
    </div>
  )
}
