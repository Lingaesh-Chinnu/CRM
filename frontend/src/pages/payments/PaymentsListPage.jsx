import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import { openWhatsApp, renderWhatsAppTemplate } from '../../utils/whatsappTemplates'

function statusLabel(status) {
  if (!status) return 'Unknown'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function money(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function monthValue(date) {
  return date.toISOString().slice(0, 7)
}

function monthOptions() {
  const options = []
  const cursor = new Date()
  cursor.setDate(1)
  for (let index = 0; index < 6; index += 1) {
    const value = monthValue(cursor)
    options.push({
      value,
      label: cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    })
    cursor.setMonth(cursor.getMonth() - 1)
  }
  return options
}

function orderedInstallments(row) {
  return [...(row.installments || [])].sort((a, b) => {
    const dateCompare = String(a.payment_date || '').localeCompare(String(b.payment_date || ''))
    return dateCompare || Number(a.id || 0) - Number(b.id || 0)
  })
}

function lastPaidInstallment(row) {
  const installments = orderedInstallments(row).filter((installment) => Number(installment.amount || 0) > 0)
  return installments[installments.length - 1] || null
}

function nextPendingInstallment(row) {
  return (row.installment_summary || []).find((item) => Number(item.pending_amount || 0) > 0) || null
}

function feeReminderMessage(row) {
  return `Hi ${row.student_name},

This is a gentle reminder regarding your pending course fee payment.

Total Fee: {{total_fee}}
Paid: {{paid_amount}}
Balance: {{pending_amount}}

Kindly complete the pending payment at your earliest convenience.

-Team IIE`
}

export default function PaymentsListPage() {
  const { user } = useSelector((state) => state.auth)
  const location = useLocation()
  const navigate = useNavigate()
  const navigationMessage = location.state?.message || ''
  const isSuperAdmin = user?.role === 'super_admin'
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({
    total_pending_amount: 0,
    this_month_pending: 0,
    last_month_pending: 0,
    next_month_pending: 0,
  })
  const [branches, setBranches] = useState([])
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState(navigationMessage)
  const [sendingId, setSendingId] = useState(null)
  const [searchParams] = useSearchParams()
  const options = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState(searchParams.get('month') || options[0]?.value || monthValue(new Date()))
  const [branch, setBranch] = useState(searchParams.get('branch') || '')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const statusFilter = searchParams.get('status') || ''
  const dueThisWeek = searchParams.get('due_this_week') || ''
  const duePaymentsFilter = statusFilter === 'due' || statusFilter === 'pending_today'

  useEffect(() => {
    if (navigationMessage) {
      setMessage(navigationMessage)
      window.history.replaceState({}, '')
    }
  }, [navigationMessage])

  useEffect(() => {
    if (!location.search) {
      setBranch('')
    }
  }, [location.search])

  useEffect(() => {
    if (!isSuperAdmin) return
    api.get('/branches/')
      .then(({ data }) => setBranches(data.results || data))
      .catch(() => setBranches([]))
  }, [isSuperAdmin])

  useEffect(() => {
    api.get('/whatsapp-templates/', { params: { template_type: 'payment_reminder', is_active: true } })
      .then(({ data }) => setTemplates(data.results || data))
      .catch(() => setTemplates([]))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const params = { month }
    if (statusFilter) params.status = statusFilter
    if (dueThisWeek) params.due_this_week = dueThisWeek
    if (isSuperAdmin && branch) params.branch = branch
    if (search.trim()) params.search = search.trim()

    setLoading(true)
    if (!navigationMessage) setMessage('')
    api.get('/payments/', { params, signal: controller.signal })
      .then(({ data }) => {
        setRows(data.results || data)
        setSummary(data.summary || {
          total_pending_amount: 0,
          this_month_pending: 0,
          last_month_pending: 0,
          next_month_pending: 0,
        })
      })
      .catch((error) => {
        if (error.name === 'CanceledError') return
        setRows([])
        setMessage(apiErrorMessage(error, 'Failed to load payments.'))
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [month, branch, search, isSuperAdmin, statusFilter, dueThisWeek, navigationMessage])

  const clearStatusFilter = () => {
    setBranch('')
    navigate('/payments')
  }

  const sendReminder = async (row) => {
    setSendingId(row.id)
    setMessage('')
    try {
      const { data } = await api.post(`/payments/${row.id}/send-reminder/`, {
        template_id: selectedTemplate || undefined,
      })
      if (data.whatsapp_sent) {
        setMessage(`Reminder sent to ${row.student_name}.`)
        return
      }
      const template = templates.find((item) => String(item.id) === String(selectedTemplate))
      openWhatsApp(row.student_phone, data.whatsapp_message || renderWhatsAppTemplate(template, row, feeReminderMessage(row)))
      setMessage(data.whatsapp_error ? `Automatic send failed. Opened WhatsApp Web fallback. ${data.whatsapp_error}` : 'Opened WhatsApp Web fallback.')
    } catch (error) {
      const template = templates.find((item) => String(item.id) === String(selectedTemplate))
      openWhatsApp(row.student_phone, renderWhatsAppTemplate(template, row, feeReminderMessage(row)))
      setMessage(error.response?.data?.detail || 'Automatic send failed. Opened WhatsApp Web fallback.')
    } finally {
      setSendingId(null)
    }
  }

  const exportWorksheet = async () => {
    setExporting(true)
    setMessage('')
    try {
      const params = { month }
      if (statusFilter) params.status = statusFilter
      if (dueThisWeek) params.due_this_week = dueThisWeek
      if (isSuperAdmin && branch) params.branch = branch
      if (search.trim()) params.search = search.trim()
      const response = await api.get('/payments/export/', { params, responseType: 'blob' })
      const { data, headers } = response
      const url = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      const disposition = headers?.['content-disposition'] || ''
      const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] || `payment-worksheet-${month}.xlsx`
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to export payment worksheet.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Payments</p>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {duePaymentsFilter ? 'Due & Overdue Payments' : 'Payment Tracker'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {duePaymentsFilter
                ? 'Students with pending payments due today or earlier.'
                : 'Track collections, dues, balances, and student installment history month by month.'}
            </p>
            {duePaymentsFilter && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
                  Due & Overdue Payments
                </span>
                <button
                  type="button"
                  onClick={clearStatusFilter}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={exportWorksheet}
            disabled={exporting}
            className="w-fit rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ['Total Pending Amount', `Rs ${money(summary.total_pending_amount)}`],
          ['This Month Pending', `Rs ${money(summary.this_month_pending)}`],
          ['Last Month Pending', `Rs ${money(summary.last_month_pending)}`],
          ['Next Month Pending', `Rs ${money(summary.next_month_pending)}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_220px_220px]">
          <select
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
          >
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, phone, or ID"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
          />
          {isSuperAdmin ? (
            <select
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
            >
              <option value="">All branches</option>
              {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : (
            <div className="hidden lg:block" />
          )}
          {templates.length > 0 ? (
            <select
              value={selectedTemplate}
              onChange={(event) => setSelectedTemplate(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
            >
              <option value="">Default reminder</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
        {message && <p className="mt-4 text-sm font-medium text-slate-600">{message}</p>}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {duePaymentsFilter ? 'Due & Overdue Payments' : 'Payment tracking'}
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading payments...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">
            {duePaymentsFilter ? 'No due or overdue pending payments found.' : 'No payment records found for this month.'}
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="w-[16%] px-3 py-3">Name</th>
                    <th className="w-[14%] px-3 py-3">Course</th>
                    <th className="w-[10%] px-3 py-3 text-right">Course Fees</th>
                    <th className="w-[10%] px-3 py-3 text-right">Last Paid Amount</th>
                    <th className="w-[10%] px-3 py-3">Last Paid Date</th>
                    <th className="w-[10%] px-3 py-3 text-right">Balance Amount</th>
                    <th className="w-[10%] px-3 py-3 text-right">Next Payment Amount</th>
                    <th className="w-[10%] px-3 py-3">Next Payment Date</th>
                    <th className="w-[10%] px-3 py-3">Payment Status</th>
                    <th className="w-[10%] px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => {
                    const lastPaid = lastPaidInstallment(row)
                    const nextPending = nextPendingInstallment(row)
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-3 py-4 align-top">
                          <Link to={`/payments/${row.id}`} className="break-words font-bold text-slate-950 hover:text-cyan-700">{row.student_name}</Link>
                          <p className="mt-1 text-xs text-slate-500">{row.student_phone || 'No phone'}</p>
                        </td>
                        <td className="break-words px-3 py-4 align-top text-slate-700">{row.course_name || '-'}</td>
                        <td className="px-3 py-4 text-right align-top font-semibold text-slate-900">{money(row.total_fees)}</td>
                        <td className="px-3 py-4 text-right align-top font-semibold text-slate-900">{lastPaid ? money(lastPaid.amount) : '-'}</td>
                        <td className="px-3 py-4 align-top text-slate-600">{lastPaid ? formatDate(lastPaid.payment_date) : '-'}</td>
                        <td className="px-3 py-4 text-right align-top font-black text-slate-950">{money(row.balance)}</td>
                        <td className="px-3 py-4 text-right align-top font-semibold text-slate-900">{nextPending ? money(nextPending.pending_amount) : '-'}</td>
                        <td className="px-3 py-4 align-top text-slate-600">{nextPending ? formatDate(nextPending.due_date) : '-'}</td>
                        <td className="px-3 py-4 align-top">
                          <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-3 py-4 align-top">
                          {Number(row.balance || 0) > 0 ? (
                            <button
                              type="button"
                              onClick={() => sendReminder(row)}
                              disabled={sendingId === row.id}
                              className="inline-flex whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {sendingId === row.id ? 'Sending...' : 'Reminder'}
                            </button>
                          ) : (
                            <Link to={`/payments/${row.id}`} className="inline-flex whitespace-nowrap text-xs font-semibold text-slate-600 hover:text-slate-950">Open</Link>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-200 lg:hidden">
              {rows.map((row) => {
                const lastPaid = lastPaidInstallment(row)
                const nextPending = nextPendingInstallment(row)
                return (
                  <div key={row.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link to={`/payments/${row.id}`} className="text-lg font-black tracking-tight text-slate-950">{row.student_name}</Link>
                        <p className="mt-1 text-sm text-slate-500">{row.student_phone || 'No phone'}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Course</p><p className="font-bold text-slate-950">{row.course_name || '-'}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Course Fees</p><p className="font-bold text-slate-950">Rs {money(row.total_fees)}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Last Paid</p><p className="font-bold text-slate-950">{lastPaid ? `Rs ${money(lastPaid.amount)}` : '-'}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Last Paid Date</p><p className="font-bold text-slate-950">{lastPaid ? formatDate(lastPaid.payment_date) : '-'}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Balance Amount</p><p className="font-bold text-slate-950">Rs {money(row.balance)}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next Payment Amount</p><p className="font-bold text-slate-950">{nextPending ? `Rs ${money(nextPending.pending_amount)}` : '-'}</p></div>
                      <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Next Payment Date</p><p className="font-bold text-slate-950">{nextPending ? formatDate(nextPending.due_date) : '-'}</p></div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link to={`/payments/${row.id}`} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                        Open Details
                      </Link>
                      {Number(row.balance || 0) > 0 && (
                        <button type="button" onClick={() => sendReminder(row)} disabled={sendingId === row.id} className="whitespace-nowrap rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                          {sendingId === row.id ? 'Sending...' : 'Send Reminder'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
