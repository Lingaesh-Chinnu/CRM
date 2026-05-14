import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../../store/slices/authSlice'
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

function appHref(url) {
  if (!url || url === '#') return '#'
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('mailto:') || url.startsWith('tel:')) return url
  if (!url.startsWith('/')) return url
  return `${appBasePath}${url}`
}

function starDisplay(stars) {
  const count = Number(stars || 1)
  return '⭐'.repeat(count) + '☆'.repeat(Math.max(0, 5 - count))
}

function notificationDateTime(item) {
  if (item.created_display) return item.created_display
  if (!item.created_at) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(item.created_at))
}

function statusLabel(item) {
  if (item.status === 'resolved') return 'Done'
  if (item.status === 'read' || item.is_read) return 'Read'
  return 'Yet to do'
}

export default function Header({ onMenuClick }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const [rating, setRating] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    if (user.role === 'super_admin') {
      setRating(null)
      return
    }
    api.get('/dashboard/my-rating/').then(({ data }) => {
      setRating(data)
    }).catch(() => {
      setRating(null)
    })
  }, [user])

  const fetchNotifications = () => {
    if (!user) return
    return api.get('/notifications/').then(({ data }) => {
      setNotifications(data.results || data)
    }).catch(() => setNotifications([]))
  }

  useEffect(() => {
    fetchNotifications()
  }, [user])

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const unreadCount = notifications.filter((item) => item.status !== 'resolved' && !item.is_read).length
  const toneClass = (type) => {
    if (type === 'error') return 'border-rose-200 bg-rose-50 text-rose-800'
    if (type === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800'
    if (type === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    return 'border-cyan-200 bg-cyan-50 text-cyan-800'
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm xl:hidden"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Workspace Overview
          </p>
          <div className="mt-2 flex items-center gap-3">
            <h2 className="truncate text-lg font-black tracking-tight text-slate-950 sm:text-2xl">
              Welcome back, {user?.full_name || user?.username || 'User'}
            </h2>
            <span className="hidden rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white sm:inline-flex">
              {user?.role === 'super_admin' ? 'Admin' : 'Staff'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {user?.branch_name && <span>{user.branch_name}</span>}
            {rating && (
              <span className="font-semibold text-slate-700">
                {starDisplay(rating.stars)} {rating.score}%
              </span>
            )}
          </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((value) => !value)}
              title="Notifications"
              aria-label="Notifications"
              className="group relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50 hover:text-slate-950"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="pointer-events-none absolute right-0 top-full mt-2 hidden w-max whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white shadow-lg group-hover:block">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 mt-3 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-bold text-slate-950">Notifications</p>
                  <button
                    type="button"
                    onClick={() => api.post('/notifications/mark-all-read/').then(() => fetchNotifications())}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-950"
                  >
                    Mark read
                  </button>
                </div>
                <div className="max-h-96 overflow-auto p-3">
                  {notifications.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500">No notifications.</p>
                  ) : notifications.slice(0, 12).map((item) => (
                    <a key={item.id} href={appHref(item.related_url)} className={`mb-2 block rounded-xl border px-3 py-2 text-sm ${toneClass(item.type)}`}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-semibold">{item.title}</span>
                        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]">
                          {statusLabel(item)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs opacity-80">{item.message}</span>
                      <span className="mt-2 block text-[11px] font-semibold opacity-75">{notificationDateTime(item)}</span>
                    </a>
                  ))}
                </div>
                <div className="border-t border-slate-100 px-4 py-3">
                  <Link
                    to="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-950"
                  >
                    View all notifications
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-[1px] shadow-lg shadow-slate-300/50">
            <button
              onClick={handleLogout}
              className="rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 sm:px-4"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
