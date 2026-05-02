import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const defaultFilters = {
  search: '',
  branch: '',
  status: 'all',
  date_filter: '',
  from_date: '',
  to_date: '',
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UserMonitoringPage() {
  const [data, setData] = useState({
    users: [],
    branches: [],
    total_logins_today: 0,
    currently_online_users: 0,
  })
  const [filters, setFilters] = useState(defaultFilters)
  const [loading, setLoading] = useState(true)

  const loadMonitoring = (activeFilters = filters) => {
    const params = new URLSearchParams()
    if (activeFilters.search.trim()) params.append('search', activeFilters.search.trim())
    if (activeFilters.branch) params.append('branch', activeFilters.branch)
    if (activeFilters.status !== 'all') params.append('status', activeFilters.status)
    if (activeFilters.date_filter) params.append('date_filter', activeFilters.date_filter)
    if (activeFilters.date_filter === 'custom') {
      if (activeFilters.from_date) params.append('from_date', activeFilters.from_date)
      if (activeFilters.to_date) params.append('to_date', activeFilters.to_date)
    }

    setLoading(true)
    return api.get(`/admin/user-monitoring/${params.toString() ? `?${params.toString()}` : ''}`).then(({ data: response }) => {
      setData(response)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadMonitoring(defaultFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateFilter = (name, value) => {
    setFilters((current) => ({
      ...current,
      [name]: value,
      ...(name === 'date_filter' && value !== 'custom' ? { from_date: '', to_date: '' } : {}),
    }))
  }

  const handleSearch = (event) => {
    event.preventDefault()
    loadMonitoring(filters)
  }

  const clearFilters = () => {
    setFilters(defaultFilters)
    loadMonitoring(defaultFilters)
  }

  if (loading) return <div className="p-6 text-slate-500">Loading user monitoring...</div>

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">User Monitoring</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Review staff login activity, last seen time, and current online status.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Total Logins Today</p>
          <p className="mt-3 text-3xl font-black text-slate-950">{data.total_logins_today}</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Currently Online Users</p>
          <p className="mt-3 text-3xl font-black text-emerald-700">{data.currently_online_users}</p>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        <form onSubmit={handleSearch} className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">User / Staff</label>
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Search name or username"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Branch</label>
            <select
              value={filters.branch}
              onChange={(event) => updateFilter('branch', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All Branches</option>
              {data.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</label>
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Date</label>
            <select
              value={filters.date_filter}
              onChange={(event) => updateFilter('date_filter', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {filters.date_filter === 'custom' && (
            <>
              <div className="lg:col-span-1">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">From</label>
                <input
                  type="date"
                  value={filters.from_date}
                  onChange={(event) => updateFilter('from_date', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
              </div>
              <div className="lg:col-span-1">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">To</label>
                <input
                  type="date"
                  value={filters.to_date}
                  onChange={(event) => updateFilter('to_date', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
              </div>
            </>
          )}
          <div className={`${filters.date_filter === 'custom' ? 'lg:col-span-12' : 'lg:col-span-3'} flex items-end gap-3`}>
            <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Search
            </button>
            <button type="button" onClick={clearFilters} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Clear Filter
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Username</th>
                <th className="px-5 py-4">Full Name</th>
                <th className="px-5 py-4">Branch</th>
                <th className="px-5 py-4">Login Time</th>
                <th className="px-5 py-4">Logout Time</th>
                <th className="px-5 py-4">Last Seen</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.users.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan="8">No monitoring records yet.</td>
                </tr>
              ) : (
                data.users.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-950">{row.username}</td>
                    <td className="px-5 py-4 text-slate-700">{row.full_name}</td>
                    <td className="px-5 py-4 text-slate-700">{row.branch_name || 'Global'}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(row.login_at)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(row.logout_at)}</td>
                    <td className="px-5 py-4 text-slate-600">{formatDateTime(row.last_seen_at)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.current_status === 'Online'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {row.current_status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{row.ip_address || 'Not available'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
