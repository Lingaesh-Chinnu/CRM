import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import LoginAnimatedBackground from '../../components/common/LoginAnimatedBackground'
import { openWhatsApp, renderWhatsAppTemplate } from '../../utils/whatsappTemplates'

const dashboardQuotes = [
  'Make today count. Every lead matters.',
  'Today is full of opportunities. Use them well.',
  'Stay sharp. Stay focused. Win today.',
  'Every action today builds real results.',
  "Today's effort creates today's success.",
  'Start strong. Finish stronger.',
  'Focus on progress today.',
  'Today is the day to move forward.',
  'Handle every enquiry with purpose today.',
  'Bring energy to every task today.',
  'Today rewards consistent action.',
  'Every follow-up today has value.',
  'Stay disciplined. Deliver today.',
  'Push forward and perform today.',
  'Success begins with what you do today.',
  'Track smart. Respond fast. Grow today.',
  'Today is for action and results.',
  'Own your targets today.',
  'Lead with confidence today.',
  'Perform with focus today.',
]

function selectDashboardQuote() {
  const lastQuote = localStorage.getItem('dashboard_last_quote')
  const availableQuotes = dashboardQuotes.filter((quote) => quote !== lastQuote)
  const quotePool = availableQuotes.length > 0 ? availableQuotes : dashboardQuotes
  const quote = quotePool[Math.floor(Math.random() * quotePool.length)]
  localStorage.setItem('dashboard_last_quote', quote)
  return quote
}

function highlightRows(stats) {
  return [
    {
      label: 'Walk-ins this month',
      actual: Number(stats?.walkins_this_month || 0),
      target: stats?.walkin_target,
      note: 'Fresh branch visits recorded this month',
      kind: 'count',
    },
    {
      label: 'Enrollments this month',
      actual: Number(stats?.enroll_this_month || 0),
      target: stats?.enroll_target,
      note: 'Students converted into active admissions',
      kind: 'count',
    },
    {
      label: 'Value this month',
      actual: Number(stats?.value_this_month || 0),
      target: stats?.value_target,
      note: 'Enrollment value generated this month',
      kind: 'plainCurrency',
    },
  ]
}

function followUpRows(stats) {
  const today = todayIso()

  return [
    {
      label: 'Leads Follow-up Today',
      value: stats?.leads_followup_today || 0,
      to: `/leads?next_follow_up_date_from=${today}&next_follow_up_date_to=${today}&focus=today-follow-up`,
      tone: 'text-cyan-600',
    },
    {
      label: 'Walk-ins Follow-up Today',
      value: stats?.walkins_followup_today || 0,
      to: `/walkins?follow_up_date_from=${today}&follow_up_date_to=${today}&focus=today-follow-up`,
      tone: 'text-emerald-600',
    },
    {
      label: 'Pending Payments Today',
      value: stats?.pending_payments || 0,
      to: '/payments?status=pending',
      tone: 'text-rose-600',
    },
  ]
}

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10)
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

function displayValue(value, kind) {
  if (kind === 'percent') return `${Number(value || 0).toFixed(2)}%`
  if (kind === 'plainCurrency') return formatNumber(value)
  return kind === 'currency' ? formatCurrency(value) : formatNumber(value)
}

function targetIsSet(target) {
  return target !== null && target !== undefined && Number(target) > 0
}

function progressPercent(actual, target) {
  if (!targetIsSet(target)) return 0
  return Math.min((Number(actual || 0) / Number(target)) * 100, 100)
}

const preferredBranchOrder = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']

function branchSortIndex(branch) {
  const index = preferredBranchOrder.findIndex((name) => name.toLowerCase() === String(branch.name || '').toLowerCase())
  return index === -1 ? preferredBranchOrder.length : index
}

function HistoricalAnalyticsChart({ rows }) {
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [
      Number(row.leads || 0),
      Number(row.walkins || 0),
      Number(row.enrollments || 0),
    ])
  )

  return (
    <div className="mt-5">
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={`${row.year}-value`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{row.label} Value</p>
            <p className="mt-2 text-lg font-black text-slate-950">
              Rs {Number(row.value_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-cyan-500"></span>Leads</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-500"></span>Walk-ins</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-violet-500"></span>Enrollments</span>
      </div>
      <div className="mx-auto mt-5 flex h-[320px] max-w-3xl items-end justify-start gap-4 overflow-x-auto border-b border-slate-200 px-1 pb-8 sm:justify-center sm:gap-8 sm:px-4">
          {rows.map((row) => (
            <div key={row.year} className="flex w-32 shrink-0 flex-col items-center justify-end sm:w-40">
              <div className="flex h-[240px] w-full items-end justify-center gap-3 rounded-xl bg-white px-3 py-3 ring-1 ring-slate-200">
                {[
                  ['leads', 'bg-cyan-500'],
                  ['walkins', 'bg-emerald-500'],
                  ['enrollments', 'bg-violet-500'],
                ].map(([field, color]) => {
                  const value = Number(row[field] || 0)
                  const height = Math.max(value > 0 ? 10 : 0, (value / maxValue) * 200)
                  return (
                    <div key={field} className="flex w-7 flex-col items-center justify-end gap-1">
                      <span className="h-4 text-[11px] font-semibold text-slate-500">{value || ''}</span>
                      <div
                        className={`w-full rounded-t-lg ${color}`}
                        style={{ height: `${height}px` }}
                        title={`${field}: ${value}`}
                      />
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-sm font-bold text-slate-700">{row.label}</p>
            </div>
          ))}
      </div>
    </div>
  )
}

function BirthdayReminderCardV2({ birthdays }) {
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    api.get('/whatsapp-templates/', { params: { template_type: 'birthday_wish', is_active: true } })
      .then(({ data }) => setTemplates(data.results || data))
      .catch(() => setTemplates([]))
  }, [])

  const messageTemplates = {
    6: `Hi {{student_name}}! 🎉
Only 6 days to go for your special day.
Have you started planning your birthday look? 😊

-Team IIE`,
    5: `Hi {{student_name}}! 🎉
5 days to go for your birthday.
Wishing you an exciting countdown to your special day! 😊

-Team IIE`,
    4: `Hi {{student_name}}! 🎉
Your birthday is just 4 days away.
Hope this week brings you lots of happiness and good vibes! 😊

-Team IIE`,
    3: `Hi {{student_name}}! 🎉
Only 3 days left for your special day.
Get ready to celebrate yourself! 😊

-Team IIE`,
    2: `Hi {{student_name}}! 🎉
2 days to go for your birthday.
May your special day be as bright and amazing as you are! 😊

-Team IIE`,
    1: `Hi {{student_name}}! 🎉
Just 1 day to go for your birthday.
Advance birthday wishes from Team IIE! 😊

-Team IIE`,
    0: `Happy Birthday {{student_name}} 🎉

Wishing you a day filled with happiness and a year full of success and good moments ahead.
Enjoy your special day, {{student_name}}!

-Team IIE`,
  }

  const birthdayMessageFor = (student) => (
    renderWhatsAppTemplate(
      templates[0],
      student,
      messageTemplates[Number(student.days_left || 0)] || messageTemplates[0]
    )
  )

  const birthdayLabelFor = (student) => {
    const daysLeft = Number(student.days_left || 0)
    if (daysLeft === 0) return 'Birthday Today'
    return `${daysLeft} day${daysLeft === 1 ? '' : 's'} to go`
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">Birthday Reminder</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{birthdays.length}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {birthdays.length} Active
        </div>
      </div>

      {birthdays.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
          No birthdays in the next 7 days.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200">
          {birthdays.map((student) => (
            <div key={student.id} className="flex flex-col gap-3 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-slate-950">{student.name}</p>
                <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>{student.phone || 'No phone'}</span>
                  <span>|</span>
                  <span>{student.birthday_date || 'Birthday date pending'}</span>
                  <span>|</span>
                  <span>{birthdayLabelFor(student)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => openWhatsApp(student.phone, birthdayMessageFor(student))}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Send Wishes
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WeeklyPendingPaymentCard({ amount }) {
  return (
    <Link
      to="/payments?status=pending&due_this_week=1"
      className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50"
    >
      <p className="text-sm font-semibold text-slate-500">Weekly Pending Payment Reminder</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-3xl font-black tracking-tight text-slate-950">{formatCurrency(amount)}</p>
        <span className="text-sm font-semibold text-slate-500">View -&gt;</span>
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const [dashboardStats, setDashboardStats] = useState(null)
  const [summaryStats, setSummaryStats] = useState(null)
  const [actionBoardStats, setActionBoardStats] = useState(null)
  const [branches, setBranches] = useState([])
  const [dashboardBranch, setDashboardBranch] = useState('all')
  const [historicalBranch, setHistoricalBranch] = useState('all')
  const [summaryBranch, setSummaryBranch] = useState('all')
  const [historicalData, setHistoricalData] = useState([])
  const [historicalMeta, setHistoricalMeta] = useState(null)
  const [historicalLoading, setHistoricalLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [quote] = useState(() => selectDashboardQuote())
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    if (!isSuperAdmin) return

    api.get('/branches/').then(({ data }) => {
      const rows = Array.isArray(data) ? data : []
      setBranches(
        rows
          .filter((branch) => branch.is_active !== false)
          .filter((branch) => preferredBranchOrder.some((name) => name.toLowerCase() === String(branch.name || '').toLowerCase()))
          .sort((a, b) => branchSortIndex(a) - branchSortIndex(b) || String(a.name).localeCompare(String(b.name)))
      )
    }).catch((error) => {
      console.error('Failed to fetch dashboard branches:', error)
    })
  }, [isSuperAdmin])

  useEffect(() => {
    fetchDashboardData()
  }, [dashboardBranch, isSuperAdmin])

  useEffect(() => {
    fetchSummaryData()
  }, [summaryBranch, isSuperAdmin])

  useEffect(() => {
    fetchActionBoardStats()
  }, [isSuperAdmin])

  useEffect(() => {
    fetchHistoricalAnalytics()
  }, [historicalBranch, isSuperAdmin])

  const fetchDashboardData = async () => {
    const isInitialLoad = !dashboardStats
    try {
      if (isInitialLoad) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }
      const params = isSuperAdmin && dashboardBranch !== 'all' ? { branch: dashboardBranch } : undefined
      const { data } = await api.get('/dashboard/summary/', { params })
      setDashboardStats(data)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const fetchSummaryData = async () => {
    try {
      const params = isSuperAdmin && summaryBranch !== 'all' ? { branch: summaryBranch } : undefined
      const { data } = await api.get('/dashboard/summary/', { params })
      setSummaryStats(data)
    } catch (error) {
      console.error('Failed to fetch dashboard summary data:', error)
    }
  }

  const fetchActionBoardStats = async () => {
    try {
      const { data } = await api.get('/dashboard/summary/')
      setActionBoardStats(data)
    } catch (error) {
      console.error('Failed to fetch action board stats:', error)
    }
  }

  const fetchHistoricalAnalytics = async () => {
    try {
      setHistoricalLoading(true)
      const params = {}
      if (isSuperAdmin) {
        params.branch = historicalBranch
      }
      const { data } = await api.get('/dashboard/historical-analytics/', { params })
      setHistoricalData(data.results || [])
      setHistoricalMeta(data)
    } catch (error) {
      console.error('Failed to fetch historical analytics:', error)
      setHistoricalData([])
      setHistoricalMeta(null)
    } finally {
      setHistoricalLoading(false)
    }
  }

  const branchTabs = [
    { id: 'all', name: 'All Branches' },
    ...branches.map((branch) => ({ id: String(branch.id), name: branch.name })),
  ]

  const branchNameFor = (branchId) => (
    branchTabs.find((branch) => branch.id === branchId)?.name || 'All Branches'
  )

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"></div>
          <span className="text-sm font-medium text-slate-600">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-[30px] bg-slate-950 text-white shadow-[0_36px_90px_-42px_rgba(15,23,42,0.92)]">
        <LoginAnimatedBackground className="opacity-80" />
        <div className="relative z-10 grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Dashboard
            </p>
            <h1 className="dashboard-quote mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              {quote}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Turn daily actions into measurable growth.
            </p>

            {isSuperAdmin && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                  Dashboard and task filter
                </p>
                <div className="flex flex-wrap gap-2">
                {branchTabs.map((branch) => {
                  const active = dashboardBranch === branch.id
                  return (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => setDashboardBranch(branch.id)}
                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                        active
                          ? 'bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/20'
                          : 'border border-white/10 bg-white/6 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {branch.name}
                    </button>
                  )
                })}
                </div>
              </div>
            )}

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {highlightRows(dashboardStats).map((item) => (
                <div key={item.label} className={`rounded-[22px] border border-white/10 bg-white/6 p-5 backdrop-blur transition ${refreshing ? 'opacity-70' : 'opacity-100'}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                  <p className="mt-3 text-2xl font-black tracking-tight text-white">
                    {displayValue(item.actual, item.kind)}
                    {targetIsSet(item.target) && (
                      <span className="text-slate-400"> / {displayValue(item.target, item.kind)}</span>
                    )}
                  </p>
                  {targetIsSet(item.target) ? (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-300"
                        style={{ width: `${progressPercent(item.actual, item.target)}%` }}
                      />
                    </div>
                  ) : (
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                      Target not set
                    </p>
                  )}
                  <p className="mt-2 text-sm text-slate-300">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Day Track
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
              Today's Task
            </h2>
            <div className="mt-6 space-y-4">
              {followUpRows(dashboardStats).map((item) => (
                <Link key={item.label} to={item.to} className={`block rounded-2xl bg-white p-4 transition hover:-translate-y-0.5 hover:bg-slate-50 ${refreshing ? 'opacity-70' : 'opacity-100'}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className={`text-2xl font-black tracking-tight ${item.tone}`}>{item.value}</p>
                    <span className="text-sm font-semibold text-slate-500">View -&gt;</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              {/* <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Queue
              </p> */}
              <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                Action board
              </h3>
            </div>
            <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Live
            </div>
          </div>

          <div className="mt-8 grid gap-4">
            <div className="rounded-2xl bg-slate-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Historical Analytics</p>
                  <h4 className="mt-2 text-xl font-black tracking-tight text-slate-950">
                    This Month Performance — Year Comparison
                  </h4>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {historicalMeta?.month_name || ''} (Across Years)
                    {historicalMeta?.branch_name ? ` | ${historicalMeta.branch_name}` : ` | ${branchNameFor(historicalBranch)}`}
                  </p>
                </div>
                {isSuperAdmin && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Historical chart filter
                    </p>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                      {branchTabs.map((branch) => (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => setHistoricalBranch(branch.id)}
                          className={`h-10 rounded-xl px-4 text-sm font-semibold transition ${
                            historicalBranch === branch.id
                              ? 'bg-slate-950 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {branch.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {historicalLoading ? (
                <div className="mt-6 rounded-xl bg-white p-5 text-sm font-medium text-slate-500">Loading historical analytics...</div>
              ) : (
                <HistoricalAnalyticsChart rows={historicalData} />
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-500">Total walk-ins</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                  {actionBoardStats?.total_walkins || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-500">Total enrollments</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                  {actionBoardStats?.total_enrollments || 0}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[28px] bg-gradient-to-br from-white via-slate-50 to-slate-100 p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] ring-1 ring-slate-200 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Summary
          </p>
          <div className="mt-3 flex flex-col gap-4">
            <div>
              <h3 className="text-2xl font-black tracking-tight text-slate-950">
                Monthly Collection Summary
              </h3>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {isSuperAdmin ? summaryStats?.selected_branch_name || branchNameFor(summaryBranch) : user?.branch_name || summaryStats?.selected_branch_name || 'Assigned Branch'}
              </p>
            </div>
            {isSuperAdmin && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Collection and pending-payment filter
                </p>
                <div className="flex flex-wrap gap-2">
                  {branchTabs.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      onClick={() => setSummaryBranch(branch.id)}
                      className={`h-10 rounded-xl px-3 text-xs font-semibold transition ${
                        summaryBranch === branch.id
                          ? 'bg-slate-950 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-8">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-semibold text-slate-500">Monthly Collection</p>
              <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                {formatCurrency(summaryStats?.current_month_collected_amount ?? summaryStats?.monthly_collection ?? 0)}
              </p>
            </div>
            <div className="mt-4 grid gap-4">
              <WeeklyPendingPaymentCard amount={summaryStats?.this_week_pending_payments || 0} />
              {!isSuperAdmin && <BirthdayReminderCardV2 birthdays={summaryStats?.today_birthdays || []} />}
            </div>
          </div>
        </article>
      </section>
    </div>
  )
}
