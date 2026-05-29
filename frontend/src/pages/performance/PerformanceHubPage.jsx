import { useEffect, useMemo, useState } from 'react'
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

const metricColors = {
  leads: { light: '#93c5fd', dark: '#1d4ed8', soft: 'bg-blue-50', text: 'text-blue-800' },
  walkins: { light: '#fcd34d', dark: '#b45309', soft: 'bg-amber-50', text: 'text-amber-800' },
  enrollments: { light: '#86efac', dark: '#047857', soft: 'bg-emerald-50', text: 'text-emerald-800' },
  conversion_ratio: { light: '#cbd5e1', dark: '#334155', soft: 'bg-slate-100', text: 'text-slate-800' },
  revenue: { light: '#c4b5fd', dark: '#6d28d9', soft: 'bg-violet-50', text: 'text-violet-800' },
}

function MetricCard({ label, value, subtext }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      {subtext ? <p className="mt-2 text-sm font-medium text-slate-500">{subtext}</p> : null}
    </div>
  )
}

function formatMetricValue(row, value) {
  if (row.key === 'revenue') return money(value)
  if (row.key === 'conversion_ratio') return percent(value)
  return Number(value || 0).toLocaleString('en-IN')
}

function CircularProgress({ value, color }) {
  const safeValue = Math.min(Math.max(Number(value || 0), 0), 100)
  const circumference = 2 * Math.PI * 18
  const offset = circumference - (safeValue / 100) * circumference
  return (
    <svg viewBox="0 0 44 44" className="h-16 w-16">
      <circle cx="22" cy="22" r="18" fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="24" textAnchor="middle" className="fill-slate-900 text-[9px] font-black">{Math.round(safeValue)}%</text>
    </svg>
  )
}

function MiniMetricVisual({ row, colors }) {
  const current = Number(row.this_month || 0)
  const previous = Number(row.last_month || 0)
  const maxValue = Math.max(current, previous, 1)
  if (row.key === 'conversion_ratio') {
    return (
      <div className="flex items-center justify-between gap-4">
        <CircularProgress value={current} color={colors.dark} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Last Month</p>
          <p className="mt-1 text-sm font-bold text-slate-700">{formatMetricValue(row, previous)}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="grid gap-2">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${Math.min((current / maxValue) * 100, 100)}%`, backgroundColor: colors.dark }} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${Math.min((previous / maxValue) * 100, 100)}%`, backgroundColor: colors.light }} />
      </div>
    </div>
  )
}

function ComparisonCards({ rows }) {
  return (
    <div className="grid auto-rows-fr gap-4 md:grid-cols-2">
      {(rows || []).map((row) => {
        const colors = metricColors[row.key] || metricColors.conversion_ratio
        const positive = Number(row.change_percent || 0) >= 0
        const isRevenue = row.key === 'revenue'
        return (
          <div
            key={row.key}
            className={`flex min-h-[190px] flex-col justify-between rounded-[24px] border border-slate-200 p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] ${
              isRevenue ? 'bg-gradient-to-br from-white via-violet-50 to-white md:col-span-2' : 'bg-white'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{row.label}</p>
                <p className={`mt-3 ${isRevenue ? 'text-3xl' : 'text-2xl'} font-black tracking-tight text-slate-950`}>
                  {formatMetricValue(row, row.this_month)}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {positive ? '↑' : '↓'} {positive ? '+' : ''}{Number(row.change_percent || 0).toFixed(0)}%
              </span>
            </div>
            <div className="mt-5">
              <MiniMetricVisual row={row} colors={colors} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
              <span>Last Month: {formatMetricValue(row, row.last_month)}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.dark }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function UsageLine({ points }) {
  const values = points || []
  const maxSeconds = Math.max(...values.map((item) => Number(item.seconds || 0)), 1)
  const polyline = values.map((item, index) => {
    const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
    const y = 36 - ((Number(item.seconds || 0) / maxSeconds) * 30)
    return `${x},${y}`
  }).join(' ')
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <svg viewBox="0 0 100 40" className="h-32 w-full overflow-visible">
        <polyline points={polyline} fill="none" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((item, index) => {
          const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
          const y = 36 - ((Number(item.seconds || 0) / maxSeconds) * 30)
          return <circle key={item.date} cx={x} cy={y} r="1.8" fill="#334155" />
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs font-semibold text-slate-500">
        <span>{values[0]?.date || '-'}</span>
        <span>{values[values.length - 1]?.date || '-'}</span>
      </div>
    </div>
  )
}

function InsightCard({ children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-sm font-semibold leading-6 text-slate-700">{children}</p>
    </div>
  )
}

export default function PerformanceHubPage() {
  const [month, setMonth] = useState(monthValue(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

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

  const personal = data?.personal || {}
  const branch = data?.branch_overview || {}
  const personalCards = useMemo(() => [
    ['Leads Added', personal.leads || 0],
    ['Walk-ins Converted', personal.walkins_converted || 0],
    ['Enrollments', personal.enrollments || 0],
    ['Conversion Ratio', percent(personal.conversion_ratio)],
    ['Pending Follow-ups', personal.pending_followups || 0],
    ['Total Follow-ups', personal.total_followups || 0],
    ['Total Revenue Generated', money(personal.revenue)],
    ['Avg Follow-up Response Time', personal.avg_followup_response_time || '0m'],
    ['CRM Usage Time', personal.crm_usage_time || '0m'],
  ], [personal])

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Performance Hub</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Personal Analytics</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Track your own pipeline, follow-up work, revenue contribution, and CRM usage with branch-level summary visibility.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
        />
      </section>

      {message && <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-600">{message}</p>}
      {loading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">Loading analytics...</div>
      ) : data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {personalCards.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Monthly Comparison</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">This month vs last month</h2>
              <div className="mt-5">
                <ComparisonCards rows={data.monthly_comparison || []} />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">CRM Usage Analytics</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Active usage</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <MetricCard label="Today" value={data.usage?.today_display || '0m'} />
                <MetricCard label="This Week" value={data.usage?.week_display || '0m'} />
                <MetricCard label="This Month" value={data.usage?.month_display || '0m'} />
              </div>
              <div className="mt-5">
                <UsageLine points={data.usage?.daily || []} />
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Branch Overview</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{branch.branch_name || 'Branch'} summary</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Branch Leads" value={branch.leads || 0} />
                <MetricCard label="Branch Enrollments" value={branch.enrollments || 0} />
                <MetricCard label="Branch Conversion" value={percent(branch.conversion_ratio)} />
                <MetricCard label="Monthly Growth" value={`${Number(branch.growth_percent || 0).toFixed(0)}%`} />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Insights</p>
              <div className="mt-4 grid gap-3">
                {(data.insights || []).map((item) => (
                  <InsightCard key={item}>{item}</InsightCard>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
