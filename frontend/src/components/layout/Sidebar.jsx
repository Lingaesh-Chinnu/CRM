import { Link, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import brandLogo from '../../assets/brand-logo.png'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', short: 'DA' },
  { name: 'Course Fees', href: '/courses', short: 'CF' },
  { name: 'Leads', href: '/leads', short: 'LE' },
  { name: 'Walk-ins', href: '/walkins', short: 'WI' },
  { name: 'Students', href: '/students', short: 'ST' },
  { name: 'Enrollments', href: '/enrollments', short: 'EN' },
  { name: 'Payments', href: '/payments', short: 'PY' },
  { name: 'Pending', href: '/pending/leads', short: 'PE', pending: true },
  { name: 'Team Board', href: '/team-board', short: 'TB' },
  { name: 'Counselor Requests', href: '/counselor-change-requests', short: 'CR' },
]

const adminNavigation = [
  { name: 'Courses', href: '/admin/courses', short: 'CO' },
  { name: 'Discounts', href: '/admin/discounts', short: 'DI' },
  { name: 'Users', href: '/admin/users', short: 'US' },
  { name: 'Targets', href: '/admin/targets', short: 'TA' },
  { name: 'Historical Analytics', href: '/admin/historical-analytics', short: 'HA' },
  { name: 'Lead Inbox', href: '/admin/lead-inbox', short: 'IN' },
  { name: 'Course Change Requests', href: '/admin/course-change-requests', short: 'CR' },
  { name: 'Delete Candidates', href: '/admin/delete-candidates', short: 'DC' },
  { name: 'WhatsApp Templates', href: '/admin/whatsapp-templates', short: 'WT' },
  { name: 'Branches', href: '/admin/branches', short: 'BR' },
  { name: 'Reports', href: '/admin/reports', short: 'RE' },
  { name: 'Receipts', href: '/admin/receipts', short: 'RC' },
  { name: 'User Monitoring', href: '/admin/user-monitoring', short: 'UM' },
  { name: 'Data Import', href: '/admin/data-import', short: 'IM' },
  { name: 'Lead Import History', href: '/admin/lead-import-history', short: 'LI' },
]

function NavItem({ item, active, onNavigate, badge }) {
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
        active
          ? 'bg-white/16 text-white shadow-lg shadow-slate-950/20 ring-1 ring-white/10'
          : 'text-slate-200 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold tracking-[0.2em] ${
          active ? 'bg-white text-slate-900' : 'bg-white/10 text-slate-200'
        }`}
      >
        {item.short}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {badge ? (
        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-black text-white">{badge}</span>
      ) : null}
    </Link>
  )
}

function SidebarContent({ onNavigate }) {
  const location = useLocation()
  const { user } = useSelector((state) => state.auth)
  const [pendingCounts, setPendingCounts] = useState({ total_pending: 0, lead_pending: 0, walkin_pending: 0, payment_pending: 0 })

  useEffect(() => {
    if (!user) return
    api.get('/pending/summary/')
      .then(({ data }) => setPendingCounts(data || {}))
      .catch(() => setPendingCounts({ total_pending: 0, lead_pending: 0, walkin_pending: 0, payment_pending: 0 }))
  }, [user, location.pathname])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-950 text-white">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="flex items-center justify-center">
          <img src={brandLogo} alt="IIE Logo" className="h-20 w-20 object-contain" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        <nav className="space-y-2">
          {navigation.map((item) => (
            item.pending ? (
              <div key={item.name} className="space-y-1">
                <NavItem
                  item={item}
                  active={location.pathname.startsWith('/pending')}
                  onNavigate={onNavigate}
                  badge={pendingCounts.total_pending}
                />
                {location.pathname.startsWith('/pending') && (
                  <div className="ml-12 space-y-1">
                    {[
                      ['Lead Pending', '/pending/leads', pendingCounts.lead_pending],
                      ['Walk-in Pending', '/pending/walkins', pendingCounts.walkin_pending],
                      ['Payment Pending', '/pending/payments', pendingCounts.payment_pending],
                    ].map(([name, href, count]) => (
                      <Link
                        key={href}
                        to={href}
                        onClick={onNavigate}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${location.pathname === href ? 'bg-white/12 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                      >
                        <span>{name}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{count || 0}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavItem
                key={item.name}
                item={item}
                active={location.pathname.startsWith(item.href)}
                onNavigate={onNavigate}
              />
            )
          ))}

          {user?.role === 'super_admin' && (
            <>
              <div className="mb-3 mt-8 px-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Admin
                </p>
              </div>
              {adminNavigation.map((item) => (
                <NavItem
                  key={item.name}
                  item={item}
                  active={location.pathname.startsWith(item.href)}
                  onNavigate={onNavigate}
                />
              ))}
            </>
          )}
        </nav>
      </div>
    </div>
  )
}

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  return (
    <>
      <aside className="hidden xl:fixed xl:inset-y-0 xl:flex xl:w-72 xl:flex-col">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="relative flex h-full w-[min(19rem,86vw)] flex-col shadow-2xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation menu"
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white"
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12" />
                <path d="M18 6L6 18" />
              </svg>
            </button>
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}
