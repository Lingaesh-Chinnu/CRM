import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'resolved', label: 'Resolved' },
]

function appHref(url) {
  if (!url || url === '#') return '#'
  return url
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
  if (item.status_display) return item.status_display
  if (item.status === 'resolved') return 'Resolved'
  if (item.status === 'read' || item.is_read) return 'Read'
  return 'Unread'
}

function statusClass(status) {
  if (status === 'resolved') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'read') return 'bg-slate-100 text-slate-700 border-slate-200'
  return 'bg-rose-50 text-rose-700 border-rose-200'
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [status, setStatus] = useState('')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = { scope: 'all' }
    if (status) params.status = status
    if (date) params.date = date
    api.get('/notifications/', { params }).then(({ data }) => {
      setNotifications(data.results || data)
    }).catch(() => {
      setNotifications([])
    }).finally(() => setLoading(false))
  }, [status, date])

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Notifications</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Notification history</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Review unread, read, and resolved notifications without removing completed records.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 border-b border-slate-200 px-6 py-5 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              {statusOptions.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setStatus('')
              setDate('')
            }}
            className="self-end rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <h3 className="text-2xl font-black tracking-tight text-slate-950">No notifications found</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Adjust the filters to view older notifications.</p>
            </div>
          ) : notifications.map((item) => (
            <Link key={item.id} to={appHref(item.related_url)} className="block px-6 py-5 transition hover:bg-slate-50">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-black tracking-tight text-slate-950">{item.title}</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{item.message}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{notificationDateTime(item)}</p>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusClass(item.status)}`}>
                  {statusLabel(item)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
