import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function monthValue(date) {
  return date.toISOString().slice(0, 7)
}

function lastMonthValue() {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - 1)
  return monthValue(date)
}

function formatMetricValue(row, value) {
  if (row.key === 'revenue') return money(value)
  if (row.key === 'conversion_ratio') return percent(value)
  return Number(value || 0).toLocaleString('en-IN')
}

const metricColors = {
  leads: { light: '#bfdbfe', dark: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-800' },
  walkins: { light: '#fed7aa', dark: '#ea580c', bg: 'bg-orange-50', text: 'text-orange-800' },
  walkins_converted: { light: '#fed7aa', dark: '#ea580c', bg: 'bg-orange-50', text: 'text-orange-800' },
  enrollments: { light: '#bbf7d0', dark: '#16a34a', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  conversion_ratio: { light: '#cbd5e1', dark: '#334155', bg: 'bg-slate-100', text: 'text-slate-800' },
  revenue: { light: '#ddd6fe', dark: '#7c3aed', bg: 'bg-violet-50', text: 'text-violet-800' },
}

function changeTone(change) {
  return Number(change || 0) >= 0
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-rose-50 text-rose-700'
}

function ChangeBadge({ value }) {
  const change = Number(value || 0)
  return (
    <span className={`inline-flex min-w-[74px] items-center justify-center rounded-md px-2.5 py-1 text-xs font-bold ${changeTone(change)}`}>
      {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}%
    </span>
  )
}

function BarPair({ row, colors, tall = false }) {
  const current = Number(row.this_month || 0)
  const previous = Number(row.last_month || 0)
  const maxValue = Math.max(current, previous, 1)
  const previousHeight = Math.max((previous / maxValue) * 100, previous > 0 ? 10 : 3)
  const currentHeight = Math.max((current / maxValue) * 100, current > 0 ? 10 : 3)

  return (
    <div className={`grid grid-cols-2 items-end gap-5 rounded-lg bg-slate-50 px-5 pb-4 pt-5 ${tall ? 'h-56' : 'h-40'}`}>
      {[
        ['Last', previous, previousHeight, colors.light],
        ['This', current, currentHeight, colors.dark],
      ].map(([label, value, height, color]) => (
        <div key={label} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
          <div className="flex h-full w-full items-end justify-center overflow-hidden rounded-md bg-white">
            <div className="w-10 max-w-full rounded-t-md" style={{ height: `${Math.min(height, 100)}%`, backgroundColor: color }} />
          </div>
          <div className="w-full min-w-0 text-center">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="truncate text-xs font-bold text-slate-800">{formatMetricValue(row, value)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function ComparisonCard({ row }) {
  const colors = metricColors[row.key] || metricColors.conversion_ratio
  return (
    <article className="flex min-h-[250px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-500">{row.label}</p>
          <p className="mt-2 truncate text-2xl font-black text-slate-950">{formatMetricValue(row, row.this_month)}</p>
        </div>
        <ChangeBadge value={row.change_percent} />
      </div>
      <div className="mt-5">
        <BarPair row={row} colors={colors} />
      </div>
    </article>
  )
}

function RevenueCard({ row }) {
  const colors = metricColors.revenue
  return (
    <article className="rounded-lg border border-violet-100 bg-violet-50 p-6 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-violet-700">{row.label}</p>
          <p className="mt-3 truncate text-4xl font-black text-slate-950">{money(row.this_month)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
            <ChangeBadge value={row.change_percent} />
            <span>Compared to last month</span>
          </div>
        </div>
        <BarPair row={row} colors={colors} tall />
      </div>
    </article>
  )
}

function CircularProgressCard({ row, title = row.label }) {
  const value = Math.max(0, Math.min(Number(row.this_month || 0), 100))
  const circumference = 2 * Math.PI * 42
  const offset = circumference - (value / 100) * circumference
  const colors = metricColors.conversion_ratio

  return (
    <article className="flex min-h-[250px] flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{percent(value)}</p>
        </div>
        <ChangeBadge value={row.change_percent} />
      </div>
      <div className="mt-5 flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="h-36 w-36">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={colors.dark}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="55" textAnchor="middle" className="fill-slate-900 text-lg font-black">
            {value.toFixed(0)}%
          </text>
        </svg>
      </div>
      <p className="text-center text-sm font-semibold text-slate-500">Compared to last month</p>
    </article>
  )
}

function UsageMetricCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-white text-slate-950',
    blue: 'bg-blue-50 text-blue-950',
    orange: 'bg-orange-50 text-orange-950',
  }
  return (
    <article className={`rounded-lg border border-slate-200 p-5 shadow-sm ${tones[tone] || tones.slate}`}>
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black">{value}</p>
    </article>
  )
}

function formatScreenTimeDate(value) {
  if (!value || value === '-') return '-'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function screenTimeDisplay(point) {
  if (point?.display) return point.display
  const totalSeconds = Math.max(Number(point?.seconds || 0), 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function UsageLineChart({ points }) {
  const [activeIndex, setActiveIndex] = useState(null)
  const values = points?.length ? points : [{ date: '-', label: '-', seconds: 0, hours: 0 }]
  const maxHours = Math.max(...values.map((item) => Number(item.seconds || 0) / 3600), 1)
  const width = 640
  const height = 220
  const padX = 36
  const padY = 24
  const usableWidth = width - padX * 2
  const usableHeight = height - padY * 2
  const plotted = values.map((item, index) => {
    const x = values.length <= 1 ? padX : padX + (index / (values.length - 1)) * usableWidth
    const hours = Number(item.seconds || 0) / 3600
    const y = padY + usableHeight - (hours / maxHours) * usableHeight
    return { ...item, hours, x, y }
  })
  const path = plotted.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`
    const previous = plotted[index - 1]
    const midX = (previous.x + point.x) / 2
    return `C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`
  }).join(' ')
  const activePoint = activeIndex !== null ? plotted[activeIndex] : null
  const tooltipLeft = activePoint ? Math.min(Math.max((activePoint.x / width) * 100, 14), 86) : 50
  const tooltipTop = activePoint ? Math.min(Math.max((activePoint.y / height) * 100, 20), 82) : 50

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Screen Time Trend</p>
          <h2 className="text-xl font-black text-slate-950">Daily CRM Usage Trend</h2>
        </div>
        <p className="text-sm font-semibold text-slate-500">Hours per day</p>
      </div>
      <div className="relative mt-5 overflow-hidden rounded-lg bg-slate-50 p-3">
        {activePoint && (
          <div
            className="pointer-events-none absolute z-10 min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xl"
            style={{
              left: `${tooltipLeft}%`,
              top: `${tooltipTop}%`,
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            <p className="font-black text-slate-950">Date: {formatScreenTimeDate(activePoint.date)}</p>
            <p className="mt-1">Screen Time: {screenTimeDisplay(activePoint)}</p>
          </div>
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-64 w-full touch-manipulation"
          role="img"
          aria-label="Daily CRM screen time trend"
          onMouseLeave={() => setActiveIndex(null)}
        >
          {[0, 1, 2, 3].map((line) => {
            const y = padY + (line / 3) * usableHeight
            return <line key={line} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
          })}
          <path d={path} fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
          {plotted.map((point, index) => (
            <g key={`${point.date}-${index}`}>
              {activeIndex === index && (
                <>
                  <line x1={point.x} x2={point.x} y1={padY} y2={height - padY} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1.5" />
                  <circle cx={point.x} cy={point.y} r="9" fill="#334155" opacity="0.16" />
                </>
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={activeIndex === index ? '6' : '4'}
                fill={activeIndex === index ? '#0f172a' : '#334155'}
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="14"
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                tabIndex="0"
                role="button"
                aria-label={`${formatScreenTimeDate(point.date)} screen time ${screenTimeDisplay(point)}`}
              />
            </g>
          ))}
          <text x={padX} y={height - 4} className="fill-slate-500 text-xs font-semibold">{values[0]?.label || '-'}</text>
          <text x={width - padX} y={height - 4} textAnchor="end" className="fill-slate-500 text-xs font-semibold">
            {values[values.length - 1]?.label || '-'}
          </text>
        </svg>
      </div>
    </article>
  )
}

function InsightCard({ item }) {
  const label = typeof item === 'string' ? 'Insight' : item.label
  const value = typeof item === 'string' ? item : item.value
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-3 text-base font-bold leading-6 text-slate-900">{value}</p>
    </article>
  )
}

function Stars({ stars = 5 }) {
  const count = Math.max(0, Math.min(Number(stars || 0), 5))
  return <span className="tracking-wide text-amber-500">{'★'.repeat(count)}{'☆'.repeat(5 - count)}</span>
}

function RankingTable({ title, rows }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Rank</th>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Branch</th>
              <th className="px-5 py-3">Leads</th>
              <th className="px-5 py-3">Walk-ins</th>
              <th className="px-5 py-3">Enrollments</th>
              <th className="px-5 py-3">Revenue</th>
              <th className="px-5 py-3">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows || []).map((row, index) => (
              <tr key={`${title}-${row.user_id || row.branch_id || index}`} className={index === 0 ? 'bg-emerald-50/40' : ''}>
                <td className="px-5 py-3 font-black text-slate-900">{row.rank || index + 1}</td>
                <td className="px-5 py-3 font-semibold text-slate-900">{row.name || row.branch_name}</td>
                <td className="px-5 py-3 text-slate-600">{row.branch_name || '-'}</td>
                <td className="px-5 py-3">{Number(row.leads || 0).toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">{Number(row.walkins || 0).toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">{Number(row.enrollments || 0).toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">{money(row.revenue)}</td>
                <td className="px-5 py-3"><Stars stars={row.rating_stars || 5} /> <span className="ml-2 font-semibold">{Number(row.rating_score || 100)}%</span></td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan="8" className="px-5 py-6 text-center text-slate-500">No records for this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function BranchPerformanceTable({ rows }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black text-slate-950">Branch Performance</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Branch</th>
              <th className="px-5 py-3">Leads</th>
              <th className="px-5 py-3">Walk-ins</th>
              <th className="px-5 py-3">Enrollments</th>
              <th className="px-5 py-3">Conversion</th>
              <th className="px-5 py-3">Revenue</th>
              <th className="px-5 py-3">Screen Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows || []).map((row) => (
              <tr key={row.branch_id}>
                <td className="px-5 py-3 font-semibold text-slate-900">{row.branch_name}</td>
                <td className="px-5 py-3">{Number(row.leads || 0).toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">{Number(row.walkins || 0).toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">{Number(row.enrollments || 0).toLocaleString('en-IN')}</td>
                <td className="px-5 py-3">{percent(row.conversion_ratio)}</td>
                <td className="px-5 py-3">{money(row.revenue)}</td>
                <td className="px-5 py-3 font-semibold">{row.screen_time_display || '0m'}</td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan="7" className="px-5 py-6 text-center text-slate-500">No branch data for this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

function ScreenTimeTable({ title, rows, nameKey = 'name' }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {(rows || []).slice(0, 10).map((row, index) => (
          <div key={`${title}-${row.user_id || row.branch_id || index}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <div>
              <p className="font-bold text-slate-900">{row[nameKey] || row.name}</p>
              {row.branch_name && nameKey !== 'branch_name' && <p className="text-xs font-semibold text-slate-500">{row.branch_name}</p>}
            </div>
            <p className="font-black text-slate-950">{row.display || '0m'}</p>
          </div>
        ))}
        {(!rows || rows.length === 0) && <p className="px-5 py-6 text-center text-sm text-slate-500">No screen time recorded.</p>}
      </div>
    </article>
  )
}

function AdminPerformanceDashboard({ data }) {
  const rows = data?.monthly_comparison || []
  const revenue = rows.find((row) => row.key === 'revenue')
  const nonRevenue = rows.filter((row) => row.key !== 'revenue')
  return (
    <>
      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">This Month vs Last Month</p>
          <h2 className="text-2xl font-black text-slate-950">Organization Performance</h2>
        </div>
        {revenue && <RevenueCard row={revenue} />}
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
          {nonRevenue.filter((row) => row.key !== 'conversion_ratio').map((row) => <ComparisonCard key={row.key} row={row} />)}
          {nonRevenue.filter((row) => row.key === 'conversion_ratio').map((row) => <CircularProgressCard key={row.key} row={row} title="Conversion Ratio" />)}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Branch Performance</p>
          <h2 className="text-2xl font-black text-slate-950">Branch Comparison</h2>
        </div>
        <BranchPerformanceTable rows={data.branch_performance || []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RankingTable title="Top Performers" rows={data.top_performers || []} />
        <RankingTable title="Lowest Performers" rows={data.lowest_performers || []} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">User Performance Ranking</p>
          <h2 className="text-2xl font-black text-slate-950">Monthly Leaderboard</h2>
        </div>
        <RankingTable title="All Users" rows={data.user_performance_ranking || []} />
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Screen Time Reporting</p>
          <h2 className="text-2xl font-black text-slate-950">CRM Usage</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <UsageMetricCard label="Average Screen Time" value={data.screen_time?.average_user_display || '0m'} tone="blue" />
          <UsageMetricCard label="Total Screen Time" value={data.screen_time?.total_display || '0m'} tone="slate" />
          <UsageMetricCard label="Average Daily Activity" value={data.screen_time?.average_daily_display || '0m'} tone="orange" />
        </div>
        <UsageLineChart points={data.screen_time?.daily || []} />
        <div className="grid gap-4 xl:grid-cols-2">
          <ScreenTimeTable title="User-wise Screen Time" rows={data.screen_time?.user_wise || []} />
          <ScreenTimeTable title="Branch-wise Screen Time" rows={data.screen_time?.branch_wise || []} nameKey="branch_name" />
        </div>
      </section>
    </>
  )
}

export default function PerformanceHubPage() {
  const [searchParams] = useSearchParams()
  const [month, setMonth] = useState(() => (
    searchParams.get('period') === 'last_month' ? lastMonthValue() : monthValue(new Date())
  ))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (searchParams.get('period') === 'last_month') {
      setMonth(lastMonthValue())
    }
  }, [searchParams])

  useEffect(() => {
    setLoading(true)
    setMessage('')
    api.get('/performance-hub/', { params: { month } })
      .then(({ data: payload }) => setData(payload))
      .catch((error) => {
        setData(null)
        setMessage(apiErrorMessage(error, 'Failed to load Performance Hub.'))
      })
      .finally(() => setLoading(false))
  }, [month])

  const personalRows = useMemo(() => {
    const rows = data?.my_performance_comparison || data?.monthly_comparison || []
    return rows.filter((row) => ['leads', 'walkins', 'walkins_converted', 'enrollments', 'conversion_ratio'].includes(row.key))
  }, [data])

  const branchRows = useMemo(() => data?.branch_performance_comparison || [], [data])
  const branchRevenue = branchRows.find((row) => row.key === 'revenue') || {
    key: 'revenue',
    label: 'Branch Revenue',
    this_month: data?.branch_overview?.revenue || 0,
    last_month: data?.previous_branch?.revenue || 0,
    change_percent: 0,
  }
  const branchNonRevenue = branchRows.filter((row) => row.key !== 'revenue')

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Performance Hub</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{data?.dashboard_type === 'admin' ? 'Performance Report Dashboard' : 'My Performance Hub'}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {data?.dashboard_type === 'admin'
              ? 'Organization-wide reporting, rankings, branch performance, and CRM usage analytics.'
              : 'My leads, walk-ins, enrollments, conversion, revenue, screen time, and monthly rating.'}
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm sm:w-auto"
        />
      </section>

      {message && <p className="rounded-lg border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">{message}</p>}
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">Loading analytics...</div>
      ) : data?.dashboard_type === 'admin' ? (
        <AdminPerformanceDashboard data={data} />
      ) : data ? (
        <>
          <section className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Section 1</p>
              <h2 className="text-2xl font-black text-slate-950">My Performance</h2>
            </div>
            <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
              {personalRows.filter((row) => row.key !== 'conversion_ratio').map((row) => (
                <ComparisonCard key={row.key} row={row} />
              ))}
              {personalRows.filter((row) => row.key === 'conversion_ratio').map((row) => (
                <CircularProgressCard key={row.key} row={row} title="Conversion Ratio" />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Section 2</p>
              <h2 className="text-2xl font-black text-slate-950">My Screen Time</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <UsageMetricCard label="Average Daily Usage" value={data.usage?.average_daily_display || '0m'} tone="blue" />
              <UsageMetricCard label="Monthly Usage" value={data.usage?.monthly_display || data.usage?.range_display || '0m'} tone="slate" />
              <UsageMetricCard label="Most Active Day" value={data.usage?.most_active_day || 'No activity'} tone="orange" />
            </div>
            <UsageLineChart points={data.usage?.daily || []} />
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Section 3</p>
              <h2 className="text-2xl font-black text-slate-950">My Monthly Rating</h2>
            </div>
            <article className="rounded-lg border border-amber-100 bg-amber-50 p-6 shadow-sm">
              <p className="text-xs font-bold uppercase text-amber-700">Current Month</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-3xl font-black"><Stars stars={data.monthly_rating?.stars || 5} /></div>
                <p className="text-4xl font-black text-slate-950">{Number(data.monthly_rating?.score ?? 100)}%</p>
              </div>
            </article>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Section 4</p>
              <h2 className="text-2xl font-black text-slate-950">My Branch Performance</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{data.branch_overview?.branch_name || 'Assigned branch'}</p>
            </div>
            <RevenueCard row={branchRevenue} />
            <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
              {branchNonRevenue.filter((row) => row.key !== 'conversion_ratio').map((row) => (
                <ComparisonCard key={row.key} row={row} />
              ))}
              {branchNonRevenue.filter((row) => row.key === 'conversion_ratio').map((row) => (
                <CircularProgressCard key={row.key} row={row} title="Branch Conversion Ratio" />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Section 5</p>
              <h2 className="text-2xl font-black text-slate-950">Performance Insights</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {(data.insights || []).map((item, index) => (
                <InsightCard key={`${typeof item === 'string' ? item : item.label}-${index}`} item={item} />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
