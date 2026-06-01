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
      {change >= 0 ? '^' : 'v'} {Math.abs(change).toFixed(0)}%
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

function UsageLineChart({ points }) {
  const values = points?.length ? points : [{ date: '-', label: '-', seconds: 0, hours: 0 }]
  const maxHours = Math.max(...values.map((item) => Number(item.hours || 0)), 1)
  const width = 640
  const height = 220
  const padX = 36
  const padY = 24
  const usableWidth = width - padX * 2
  const usableHeight = height - padY * 2
  const plotted = values.map((item, index) => {
    const x = values.length <= 1 ? padX : padX + (index / (values.length - 1)) * usableWidth
    const y = padY + usableHeight - (Number(item.hours || 0) / maxHours) * usableHeight
    return { ...item, x, y }
  })
  const path = plotted.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`
    const previous = plotted[index - 1]
    const midX = (previous.x + point.x) / 2
    return `C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`
  }).join(' ')

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Screen Time Trend</p>
          <h2 className="text-xl font-black text-slate-950">Daily CRM Usage Trend</h2>
        </div>
        <p className="text-sm font-semibold text-slate-500">Hours per day</p>
      </div>
      <div className="mt-5 overflow-hidden rounded-lg bg-slate-50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" role="img" aria-label="Daily CRM usage trend">
          {[0, 1, 2, 3].map((line) => {
            const y = padY + (line / 3) * usableHeight
            return <line key={line} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
          })}
          <path d={path} fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
          {plotted.map((point) => (
            <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="#334155" />
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
          <h1 className="mt-2 text-3xl font-black text-slate-950">My Performance Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Personal pipeline, CRM usage, and branch analytics for your assigned branch.
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
              <h2 className="text-2xl font-black text-slate-950">CRM Usage Analytics</h2>
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
              <p className="text-xs font-bold uppercase text-slate-500">Section 4</p>
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
