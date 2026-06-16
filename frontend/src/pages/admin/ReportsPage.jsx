import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'

function currency(value) {
  return `Rs ${Number(value || 0).toLocaleString()}`
}

function percentage(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function starDisplay(stars) {
  const count = Number(stars || 1)
  return '⭐'.repeat(count) + '☆'.repeat(Math.max(0, 5 - count))
}

function monthLabel(value) {
  const date = new Date(Number(value.year), Number(value.month) - 1, 1)
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

function localIso(date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}

function quickRangeDates(range) {
  const today = new Date()
  const start = new Date(today)
  const end = new Date(today)
  if (range === 'today') return { date_from: localIso(today), date_to: localIso(today) }
  if (range === 'yesterday') {
    start.setDate(today.getDate() - 1)
    return { date_from: localIso(start), date_to: localIso(start) }
  }
  if (range === 'last_7_days') start.setDate(today.getDate() - 6)
  if (range === 'last_30_days') start.setDate(today.getDate() - 29)
  if (range === 'this_month') start.setDate(1)
  if (range === 'last_month') {
    start.setDate(1)
    start.setMonth(today.getMonth() - 1)
    end.setDate(0)
  }
  if (range === 'last_3_months') {
    start.setDate(1)
    start.setMonth(today.getMonth() - 2)
  }
  if (range === 'last_6_months') {
    start.setDate(1)
    start.setMonth(today.getMonth() - 5)
  }
  if (range === 'this_year') {
    start.setMonth(0)
    start.setDate(1)
  }
  return { date_from: localIso(start), date_to: localIso(end) }
}

const metricColors = {
  leads: { light: '#93c5fd', dark: '#1d4ed8', soft: 'bg-blue-50', text: 'text-blue-800' },
  walkins: { light: '#fcd34d', dark: '#b45309', soft: 'bg-amber-50', text: 'text-amber-800' },
  enrollments: { light: '#86efac', dark: '#047857', soft: 'bg-emerald-50', text: 'text-emerald-800' },
  revenue: { light: '#c4b5fd', dark: '#6d28d9', soft: 'bg-violet-50', text: 'text-violet-800' },
  conversion: { light: '#cbd5e1', dark: '#334155', soft: 'bg-slate-100', text: 'text-slate-800' },
}

function AnalyticsCard({ label, value, change, tone = 'conversion', detail = '' }) {
  const colors = metricColors[tone] || metricColors.conversion
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.dark }} />
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      <p className={`mt-2 text-xs font-bold ${Number(change || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
        {Number(change || 0) >= 0 ? '+' : ''}{Number(change || 0).toFixed(0)}% from last month
      </p>
      {detail && <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>}
    </div>
  )
}

function ComparisonBar({ label, value, maxValue, tone }) {
  const colors = metricColors[tone] || metricColors.conversion
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-950">{label}</p>
        <p className="text-sm font-black text-slate-800">{value}</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-200">
        <div className="h-2 rounded-full" style={{ width: `${Math.max((Number(value || 0) / Math.max(maxValue, 1)) * 100, 5)}%`, backgroundColor: colors.dark }} />
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

export default function ReportsPage() {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [rows, setRows] = useState([])
  const [ratingMonths, setRatingMonths] = useState([])
  const [ratingRows, setRatingRows] = useState([])
  const [funnelRows, setFunnelRows] = useState([])
  const [branchRows, setBranchRows] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [analyticsFilters, setAnalyticsFilters] = useState({
    branch: '',
    user: '',
    course: '',
    source: '',
    date_range: 'this_month',
    date_from: '',
    date_to: '',
  })

  const fetchReport = async (selectedMonth = month) => {
    const { data } = await api.get(`/reports/user-performance/?month=${selectedMonth}`)
    setRows(data)
  }

  const fetchRatings = async () => {
    const { data } = await api.get('/reports/user-ratings/')
    setRatingMonths(data.months || [])
    setRatingRows(data.results || [])
  }

  const fetchAutomationReports = async () => {
    const [year, monthNumber] = month.split('-')
    const [funnelRes, branchRes] = await Promise.all([
      api.get('/reports/conversion-funnel/', { params: { year, month: monthNumber } }),
      api.get('/reports/branch-performance/', { params: { year, month: monthNumber } }),
    ])
    setFunnelRows(funnelRes.data.funnel || [])
    setBranchRows(branchRes.data || [])
  }

  const fetchAnalytics = async () => {
    const params = { month }
    Object.entries(analyticsFilters).forEach(([key, value]) => {
      if (value) params[key] = value
    })
    const { data } = await api.get('/reports/analytics-dashboard/', { params })
    setAnalytics(data)
  }

  useEffect(() => {
    fetchReport(month)
    fetchAutomationReports()
    fetchAnalytics()
  }, [month])

  useEffect(() => {
    fetchRatings()
  }, [])

  const visibleUsers = useMemo(() => {
    const users = analytics?.filters?.users || []
    if (!analyticsFilters.branch) return users
    return users.filter((item) => String(item.branch_id || '') === String(analyticsFilters.branch))
  }, [analytics, analyticsFilters.branch])

  const updateAnalyticsFilter = (key, value) => {
    if (key === 'date_range') {
      setAnalyticsFilters((current) => ({
        ...current,
        date_range: value,
        ...(value === 'custom' ? {} : quickRangeDates(value)),
      }))
      return
    }
    setAnalyticsFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'branch' ? { user: '' } : {}),
    }))
  }

  const totals = rows.reduce(
    (accumulator, row) => {
      const branchKey = row.branch_id || row.branch_name || row.user_id
      const nextTargets = { ...accumulator.branchTargets }
      if (!nextTargets[branchKey]) {
        nextTargets[branchKey] = {
          lead_target: Number(row.lead_target || 0),
          walkin_target: Number(row.walkin_target || 0),
          enroll_target: Number(row.enroll_target || 0),
          value_target: Number(row.value_target ?? row.revenue_target ?? 0),
        }
      }
      return {
        ...accumulator,
        branchTargets: nextTargets,
        leads: accumulator.leads + Number(row.leads || 0),
        transferredLeads: accumulator.transferredLeads + Number(row.transferred_leads || 0),
        receivedLeads: accumulator.receivedLeads + Number(row.received_leads || 0),
        walkins: accumulator.walkins + Number(row.walkins || 0),
        enrollments: accumulator.enrollments + Number(row.enrollments || 0),
        value: accumulator.value + Number(row.value ?? row.revenue ?? 0),
      }
    },
    {
      branchTargets: {},
      leads: 0,
      transferredLeads: 0,
      receivedLeads: 0,
      walkins: 0,
      enrollments: 0,
      value: 0,
    }
  )
  const targetTotals = Object.values(totals.branchTargets).reduce(
    (accumulator, target) => ({
      lead_target: accumulator.lead_target + target.lead_target,
      walkin_target: accumulator.walkin_target + target.walkin_target,
      enroll_target: accumulator.enroll_target + target.enroll_target,
      value_target: accumulator.value_target + target.value_target,
    }),
    { lead_target: 0, walkin_target: 0, enroll_target: 0, value_target: 0 }
  )

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Reports</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Consolidated user performance</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Compare branch users against their walk-in, enrollment, and value targets for the selected month.
          </p>
        </div>
        <div className="flex gap-3">
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          <button onClick={() => fetchReport(month)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Refresh
          </button>
        </div>
      </section>

      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Analytics Dashboard</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Business performance analytics</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Filter lead, walk-in, enrollment, revenue, follow-up, counselor, and branch performance.
            </p>
          </div>
          <button onClick={fetchAnalytics} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Apply Filters
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select value={analyticsFilters.branch} onChange={(event) => updateAnalyticsFilter('branch', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <option value="">All branches</option>
            {(analytics?.filters?.branches || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={analyticsFilters.user} onChange={(event) => updateAnalyticsFilter('user', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <option value="">All counselors</option>
            {visibleUsers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={analyticsFilters.course} onChange={(event) => updateAnalyticsFilter('course', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <option value="">All courses</option>
            {(analytics?.filters?.courses || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select value={analyticsFilters.source} onChange={(event) => updateAnalyticsFilter('source', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <option value="">All sources</option>
            {(analytics?.filters?.sources || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={analyticsFilters.date_range} onChange={(event) => updateAnalyticsFilter('date_range', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="last_3_months">Last 3 Months</option>
            <option value="last_6_months">Last 6 Months</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          {analyticsFilters.date_range === 'custom' && (
            <>
              <input type="date" value={analyticsFilters.date_from} onChange={(event) => updateAnalyticsFilter('date_from', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900" />
              <input type="date" value={analyticsFilters.date_to} onChange={(event) => updateAnalyticsFilter('date_to', event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900" />
            </>
          )}
        </div>
      </section>

      {analytics && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AnalyticsCard label="Leads" value={analytics.metrics.leads} change={analytics.changes.leads} tone="leads" />
            <AnalyticsCard
              label="Walk-ins"
              value={analytics.metrics.walkins}
              change={analytics.changes.walkins}
              tone="walkins"
              detail={`Direct ${analytics.metrics.direct_walkins || 0} | Friends Reference ${analytics.metrics.friends_reference_walkins || 0} | Staff Referrals ${analytics.metrics.staff_referrals || 0}`}
            />
            <AnalyticsCard label="Enrollments" value={analytics.metrics.enrollments} change={analytics.changes.enrollments} tone="enrollments" />
            <AnalyticsCard label="Revenue" value={currency(analytics.metrics.revenue)} change={analytics.changes.revenue} tone="revenue" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Core KPI Balance</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Pipeline and revenue shape</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {(() => {
                    const maxValue = Math.max(
                      Number(analytics.metrics.leads || 0),
                      Number(analytics.metrics.walkins || 0),
                      Number(analytics.metrics.enrollments || 0),
                      1
                    )
                    return (
                      <>
                        <ComparisonBar label="Leads" value={analytics.metrics.leads} maxValue={maxValue} tone="leads" />
                        <ComparisonBar label="Walk-ins" value={analytics.metrics.walkins} maxValue={maxValue} tone="walkins" />
                        <ComparisonBar label="Enrollments" value={analytics.metrics.enrollments} maxValue={maxValue} tone="enrollments" />
                        <div className="rounded-2xl bg-slate-50 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-slate-950">Revenue</p>
                            <p className="text-sm font-black text-slate-800">{currency(analytics.metrics.revenue)}</p>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full" style={{ width: '78%', backgroundColor: metricColors.revenue.dark }} />
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <div className="border-b border-slate-200 px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Counselor Comparison</p>
                </div>
                <div className="overflow-x-auto">
                  <div className="grid min-w-[860px] grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.9fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <div>Counselor</div><div>Leads</div><div>Walk-ins</div><div>Enrolls</div><div>Conv.</div><div>Revenue</div>
                  </div>
                  {analytics.counselor_comparison.map((row) => (
                    <div key={row.user_id} className="grid min-w-[860px] grid-cols-[1.4fr_0.7fr_0.7fr_0.8fr_0.9fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 text-sm text-slate-700">
                      <div><p className="font-bold text-slate-950">{row.name}</p><p className="text-xs text-slate-500">{row.branch_name}</p></div>
                      <div>{row.leads}</div><div>{row.walkins}</div><div>{row.enrollments}</div><div>{percentage(row.conversion_ratio)}</div><div>{currency(row.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Performance Insights</p>
                <div className="mt-4 grid gap-3">
                  {analytics.insights.map((item) => (
                    <InsightCard key={item}>{item}</InsightCard>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Conversion Funnel</p>
                <div className="mt-4 space-y-3">
                  {analytics.funnel.map((row) => {
                    const tone = row.stage === 'Leads' ? 'leads' : row.stage === 'Walk-ins' ? 'walkins' : 'enrollments'
                    const colors = metricColors[tone]
                    return (
                      <div key={row.stage} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-950">{row.stage}</p>
                          <p className="text-xs font-bold text-slate-500">{percentage(row.conversion_percent)}</p>
                        </div>
                        <p className="mt-2 text-2xl font-black text-slate-950">{row.count}</p>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-2 max-w-full rounded-full"
                            style={{ width: `${Math.min(Math.max(Number(row.conversion_percent || 0), 8), 100)}%`, backgroundColor: colors.dark }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Follow-up Efficiency</p>
                <p className="mt-2 text-2xl font-black text-slate-950">{percentage(analytics.followup_efficiency.completion_ratio)}</p>
                <p className="mt-2 text-sm text-slate-500">{analytics.followup_efficiency.pending_followups} pending follow-ups</p>
              </div>
            </div>
          </section>

          <section>
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <div className="border-b border-slate-200 px-6 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Branch Comparison</p>
                </div>
                <div className="overflow-x-auto">
                  <div className="grid min-w-[760px] grid-cols-[1.4fr_0.7fr_0.8fr_0.9fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <div>Branch</div><div>Leads</div><div>Enrolls</div><div>Conv.</div><div>Revenue</div>
                  </div>
                  {analytics.branch_comparison.map((row) => (
                    <div key={row.branch_id} className="grid min-w-[760px] grid-cols-[1.4fr_0.7fr_0.8fr_0.9fr_1fr] gap-4 border-b border-slate-100 px-6 py-4 text-sm text-slate-700">
                      <div className="font-bold text-slate-950">{row.branch_name}</div><div>{row.leads}</div><div>{row.enrollments}</div><div>{percentage(row.conversion_ratio)}</div><div>{currency(row.revenue)}</div>
                    </div>
                  ))}
                </div>
              </div>
          </section>
        </>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leads</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{totals.leads}</p>
          <p className="mt-2 text-sm text-slate-500">Branch target {targetTotals.lead_target}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Walk-ins</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{totals.walkins}</p>
          <p className="mt-2 text-sm text-slate-500">Branch target {targetTotals.walkin_target}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Enrollments</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{totals.enrollments}</p>
          <p className="mt-2 text-sm text-slate-500">Branch target {targetTotals.enroll_target}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Value</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{currency(totals.value)}</p>
          <p className="mt-2 text-sm text-slate-500">Branch target {currency(targetTotals.value_target)}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Transferred Leads</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{totals.transferredLeads}</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Received Leads</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{totals.receivedLeads}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Conversion Funnel</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Leads to enrollments</h2>
          <div className="mt-5 space-y-3">
            {funnelRows.map((row) => (
              <div key={row.stage} className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-950">{row.stage}</p>
                  <p className="text-sm font-semibold text-slate-500">{percentage(row.conversion_percent)}</p>
                </div>
                <p className="mt-2 text-2xl font-black text-slate-950">{row.count}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Branch Performance</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Branch comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[1220px] grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr_0.6fr_0.75fr_1fr_1fr_1fr_1fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div>Branch</div><div>Leads</div><div>Sent</div><div>Received</div><div>Walk-ins</div><div>Enrolls</div><div>Value</div><div>Target</div><div>Follow-up</div><div>Pending</div><div>Missed</div>
            </div>
            {branchRows.map((row) => (
              <div key={row.branch_id} className="grid min-w-[1220px] grid-cols-[1.2fr_0.6fr_0.6fr_0.6fr_0.6fr_0.75fr_1fr_1fr_1fr_1fr_0.8fr] gap-4 border-b border-slate-100 px-6 py-4 text-sm text-slate-700">
                <div className="font-bold text-slate-950">{row.branch_name}</div>
                <div>{row.leads}</div><div>{row.transferred_leads || 0}</div><div>{row.received_leads || 0}</div><div>{row.walkins}</div><div>{row.enrollments}</div>
                <div>{currency(row.value)}</div><div>{percentage(row.target_achievement)}</div><div>{percentage(row.follow_up_completion)}</div><div>{currency(row.payment_pending)}</div><div>{row.missed_followups}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Monthly User Star Rating</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Last 3 months performance</h2>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-[1.7fr_1fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <div>User</div>
            {ratingMonths.map((item) => <div key={`${item.year}-${item.month}`}>{monthLabel(item)}</div>)}
          </div>
          <div className="divide-y divide-slate-200">
            {ratingRows.map((row) => (
              <div key={row.user_id} className="grid min-w-[900px] grid-cols-[1.7fr_1fr_1fr_1fr] gap-4 px-6 py-5 text-sm text-slate-700">
                <div>
                  <p className="font-bold text-slate-950">{row.full_name}</p>
                  <p className="text-slate-500">{row.username}{row.branch_name ? ` | ${row.branch_name}` : ''}</p>
                </div>
                {row.ratings.map((rating) => (
                  <div key={`${row.user_id}-${rating.year}-${rating.month}`}>
                    <p className="font-semibold text-slate-950">{starDisplay(rating.stars)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{rating.score}%</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1320px] grid-cols-[0.7fr_1.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_1fr_1.1fr_1.1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <div>Pos</div>
            <div>User</div>
            <div>Lead T</div>
            <div>Leads</div>
            <div>Sent</div>
            <div>Received</div>
            <div>Walk T</div>
            <div>Walk-ins</div>
            <div>Enroll T</div>
            <div>Enrolls</div>
            <div>Score</div>
            <div>Value T</div>
            <div>Value</div>
          </div>
          <div className="divide-y divide-slate-200">
            {rows.map((row) => (
              <div key={row.user_id} className="grid min-w-[1320px] grid-cols-[0.7fr_1.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_1fr_1.1fr_1.1fr] gap-4 px-6 py-5 text-sm text-slate-700">
                <div className="flex items-center">
                  <span className="inline-flex min-w-12 items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    #{row.position}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-slate-950">{row.full_name}</p>
                  <p className="text-slate-500">{row.username}{row.branch_name ? ` | ${row.branch_name}` : ''}</p>
                </div>
                <div>{row.lead_target}</div>
                <div>{row.leads}</div>
                <div>{row.transferred_leads || 0}</div>
                <div>{row.received_leads || 0}</div>
                <div>{row.walkin_target}</div>
                <div>{row.walkins}</div>
                <div>{row.enroll_target}</div>
                <div>{row.enrollments}</div>
                <div className="font-semibold text-slate-950">{percentage(row.performance_score)}</div>
                <div>{currency(row.value_target ?? row.revenue_target)}</div>
                <div>{currency(row.value ?? row.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
