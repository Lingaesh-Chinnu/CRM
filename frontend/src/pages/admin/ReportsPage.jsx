import { useEffect, useState } from 'react'
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

export default function ReportsPage() {
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [rows, setRows] = useState([])
  const [ratingMonths, setRatingMonths] = useState([])
  const [ratingRows, setRatingRows] = useState([])
  const [funnelRows, setFunnelRows] = useState([])
  const [branchRows, setBranchRows] = useState([])

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

  useEffect(() => {
    fetchReport(month)
    fetchAutomationReports()
  }, [month])

  useEffect(() => {
    fetchRatings()
  }, [])

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
        walkins: accumulator.walkins + Number(row.walkins || 0),
        enrollments: accumulator.enrollments + Number(row.enrollments || 0),
        value: accumulator.value + Number(row.value ?? row.revenue ?? 0),
      }
    },
    {
      branchTargets: {},
      leads: 0,
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
            <div className="grid min-w-[1040px] grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_1fr_1fr_1fr_1fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <div>Branch</div><div>Leads</div><div>Walk-ins</div><div>Enrolls</div><div>Value</div><div>Target</div><div>Follow-up</div><div>Pending</div><div>Missed</div>
            </div>
            {branchRows.map((row) => (
              <div key={row.branch_id} className="grid min-w-[1040px] grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_1fr_1fr_1fr_1fr_0.8fr] gap-4 border-b border-slate-100 px-6 py-4 text-sm text-slate-700">
                <div className="font-bold text-slate-950">{row.branch_name}</div>
                <div>{row.leads}</div><div>{row.walkins}</div><div>{row.enrollments}</div>
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
          <div className="grid min-w-[1180px] grid-cols-[0.7fr_1.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_1fr_1.1fr_1.1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <div>Pos</div>
            <div>User</div>
            <div>Lead T</div>
            <div>Leads</div>
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
              <div key={row.user_id} className="grid min-w-[1180px] grid-cols-[0.7fr_1.6fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.9fr_1fr_1.1fr_1.1fr] gap-4 px-6 py-5 text-sm text-slate-700">
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
