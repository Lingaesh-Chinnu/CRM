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

function ComparisonBars({ rows }) {
  const maxValue = Math.max(...(rows || []).map((row) => Math.max(Number(row.this_month || 0), Number(row.last_month || 0))), 1)
  return (
    <div className="space-y-4">
      {(rows || []).map((row) => {
        const colors = metricColors[row.key] || metricColors.conversion_ratio
        return (
        <div key={row.key} className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-950">{row.label}</p>
            <p className={`text-xs font-bold ${Number(row.change_percent || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {Number(row.change_percent || 0) >= 0 ? '+' : ''}{Number(row.change_percent || 0).toFixed(0)}%
            </p>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs font-semibold text-slate-500">This</span>
              <div className="h-2 flex-1 rounded-full bg-slate-200">
                <div className="h-2 rounded-full" style={{ width: `${Math.max((Number(row.this_month || 0) / maxValue) * 100, 4)}%`, backgroundColor: colors.dark }} />
              </div>
              <span className="w-20 text-right text-xs font-bold text-slate-700">{row.key === 'revenue' ? money(row.this_month) : row.this_month}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-20 text-xs font-semibold text-slate-500">Last</span>
              <div className="h-2 flex-1 rounded-full bg-slate-200">
                <div className="h-2 rounded-full" style={{ width: `${Math.max((Number(row.last_month || 0) / maxValue) * 100, 4)}%`, backgroundColor: colors.light }} />
              </div>
              <span className="w-20 text-right text-xs font-bold text-slate-700">{row.key === 'revenue' ? money(row.last_month) : row.last_month}</span>
            </div>
          </div>
        </div>
      )})}
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
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Personal analytics</h1>
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

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Monthly Comparison</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">This month vs last month</h2>
              <div className="mt-5">
                <ComparisonBars rows={data.monthly_comparison || []} />
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
