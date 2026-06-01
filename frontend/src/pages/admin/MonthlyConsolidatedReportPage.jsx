import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

function currency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function percentage(value) {
  return `${Number(value || 0).toFixed(2)}%`
}

function monthValue(offset = 0) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(value) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function reportParams(period, month) {
  return { month: period === 'current_month' ? monthValue(0) : period === 'last_month' ? monthValue(-1) : month }
}

function SummaryCard({ label, value }) {
  return (
    <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
    </article>
  )
}

function TrendChart({ title, rows, tone = '#334155', format = (value) => value }) {
  const values = rows.map((row) => Number(row.value || 0))
  const maxValue = Math.max(...values, 1)
  const width = 520
  const height = 160
  const pad = 20
  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? pad : pad + (index / (rows.length - 1)) * (width - pad * 2),
    y: pad + (height - pad * 2) - (Number(row.value || 0) / maxValue) * (height - pad * 2),
  }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <article className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <p className="text-xs font-semibold text-slate-500">{format(values.reduce((sum, item) => sum + item, 0))}</p>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label={title}>
          {[0, 1, 2].map((line) => {
            const y = pad + (line / 2) * (height - pad * 2)
            return <line key={line} x1={pad} x2={width - pad} y1={y} y2={y} stroke="#e2e8f0" />
          })}
          <path d={path} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="3.5" fill={tone} />)}
        </svg>
      </div>
    </article>
  )
}

function DataTable({ title, columns, rows, emptyMessage = 'No records found.' }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>{columns.map((column) => <th key={column.key} className="px-5 py-3">{column.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? rows.map((row, index) => (
              <tr key={row.branch_id || row.user_id || index}>
                {columns.map((column) => (
                  <td key={column.key} className="px-5 py-3 font-medium text-slate-700">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="px-5 py-8 text-center text-slate-500">{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function MonthlyConsolidatedReportPage() {
  const [period, setPeriod] = useState('last_month')
  const [month, setMonth] = useState(monthValue(-1))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [downloading, setDownloading] = useState(false)

  const params = useMemo(() => reportParams(period, month), [period, month])

  const updatePeriod = (value) => {
    setPeriod(value)
    if (value === 'current_month') setMonth(monthValue(0))
    if (value === 'last_month') setMonth(monthValue(-1))
  }

  useEffect(() => {
    setLoading(true)
    setMessage('')
    api.get('/reports/analytics-dashboard/', { params })
      .then(({ data: payload }) => setData(payload))
      .catch((error) => {
        setData(null)
        setMessage(apiErrorMessage(error, 'Failed to load consolidated report.'))
      })
      .finally(() => setLoading(false))
  }, [params])

  const downloadPdf = async () => {
    setDownloading(true)
    setMessage('')
    try {
      const response = await api.get('/reports/analytics-dashboard/', {
        params: { ...params, download: 'pdf' },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `IIE-monthly-consolidated-report-${params.month}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to download PDF.'))
    } finally {
      setDownloading(false)
    }
  }

  const metrics = data?.metrics || {}
  const payment = data?.payment_summary || {}
  const trends = data?.trends || {}

  const branchColumns = [
    { key: 'branch_name', header: 'Branch' },
    { key: 'leads', header: 'Leads' },
    { key: 'walkins', header: 'Walk-ins' },
    { key: 'enrollments', header: 'Enrollments' },
    { key: 'revenue', header: 'Revenue', render: (row) => currency(row.revenue) },
    { key: 'conversion_ratio', header: 'Conversion %', render: (row) => percentage(row.conversion_ratio) },
  ]
  const counselorColumns = [
    { key: 'name', header: 'Counselor' },
    { key: 'leads', header: 'Leads' },
    { key: 'walkins', header: 'Walk-ins' },
    { key: 'enrollments', header: 'Enrollments' },
    { key: 'conversion_ratio', header: 'Conversion %', render: (row) => percentage(row.conversion_ratio) },
    { key: 'revenue', header: 'Revenue Contribution', render: (row) => currency(row.revenue) },
  ]

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Monthly Report</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Consolidated Report Dashboard</h1>
          <p className="mt-3 text-sm font-semibold text-slate-500">{monthLabel(params.month)} management overview</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select value={period} onChange={(event) => updatePeriod(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <option value="current_month">Current Month</option>
            <option value="last_month">Last Month</option>
            <option value="custom">Custom Month</option>
          </select>
          <input type="month" value={month} onChange={(event) => { setPeriod('custom'); setMonth(event.target.value) }} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
          <button type="button" onClick={downloadPdf} disabled={!data || downloading} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {downloading ? 'Downloading...' : 'Download PDF'}
          </button>
        </div>
      </section>

      {message && <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">{message}</div>}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">Loading consolidated report...</div>
      ) : data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Total Leads" value={metrics.leads || 0} />
            <SummaryCard label="Total Walk-ins" value={metrics.walkins || 0} />
            <SummaryCard label="Total Enrollments" value={metrics.enrollments || 0} />
            <SummaryCard label="Total Revenue" value={currency(metrics.revenue)} />
            <SummaryCard label="Conversion Ratio" value={percentage(metrics.conversion_ratio)} />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Total Collection" value={currency(payment.total_collection)} />
            <SummaryCard label="Pending Payments" value={payment.pending_payments || 0} />
            <SummaryCard label="Overdue Payments" value={payment.overdue_payments || 0} />
            <SummaryCard label="Collection Ratio" value={percentage(payment.collection_ratio)} />
          </section>

          <section className="grid gap-4 xl:grid-cols-4">
            <TrendChart title="Leads Trend" rows={trends.leads || []} tone="#1d4ed8" />
            <TrendChart title="Walk-ins Trend" rows={trends.walkins || []} tone="#b45309" />
            <TrendChart title="Enrollment Trend" rows={trends.enrollments || []} tone="#047857" />
            <TrendChart title="Revenue Trend" rows={trends.revenue || []} tone="#6d28d9" format={currency} />
          </section>

          <DataTable title="Branch Summary" columns={branchColumns} rows={data.branch_comparison || []} />
          <DataTable title="Counselor Summary" columns={counselorColumns} rows={data.counselor_comparison || []} />
        </>
      )}
    </div>
  )
}
