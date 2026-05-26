import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import ModalCloseButton from '../../components/common/ModalCloseButton'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
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

function activeReasonRequestFor(row, installmentIndex) {
  return (row.active_reason_requests || []).find((item) => Number(item.installment_index) === Number(installmentIndex)) || null
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
  const [reasonRequest, setReasonRequest] = useState(null)
  const [reasonMode, setReasonMode] = useState('')
  const [reasonForm, setReasonForm] = useState({ staff_response: '', promised_payment_date: '' })
  const [reasonSubmitting, setReasonSubmitting] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const options = useMemo(() => monthOptions(), [])
  const [month, setMonth] = useState(searchParams.get('month') || options[0]?.value || monthValue(new Date()))
  const [branch, setBranch] = useState(searchParams.get('branch') || '')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const statusFilter = searchParams.get('status') || ''
  const dueThisWeek = searchParams.get('due_this_week') || ''
  const duePaymentsFilter = statusFilter === 'due' || statusFilter === 'pending_today'
  const weeklyPendingFilter = statusFilter === 'weekly_pending'
  const reasonRequestId = searchParams.get('reason_request') || ''
  const todayValue = new Date().toISOString().slice(0, 10)
  const overdueCount = rows.filter((row) => {
    const nextPending = nextPendingInstallment(row)
    return ['unpaid', 'partial'].includes(row.status) && nextPending?.due_date && nextPending.due_date < todayValue
  }).length
  const paymentSummary = [
    { label: 'Total', value: '', count: rows.length },
    { label: 'Paid', value: 'paid', count: rows.filter((row) => row.status === 'paid').length },
    { label: 'Partial', value: 'partial', count: rows.filter((row) => row.status === 'partial').length },
    { label: 'Overdue', value: 'due', count: overdueCount },
  ]

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

  useEffect(() => {
    if (!reasonRequestId) return
    api.get(`/payment-reason-requests/${reasonRequestId}/`)
      .then(({ data }) => openReasonRequest(data))
      .catch(() => setMessage('Payment reason request could not be opened.'))
  }, [reasonRequestId])

  const clearStatusFilter = () => {
    setBranch('')
    navigate('/payments')
  }

  const applyStatusFilter = (value) => {
    const nextParams = new URLSearchParams()
    if (month) nextParams.set('month', month)
    if (isSuperAdmin && branch) nextParams.set('branch', branch)
    if (search.trim()) nextParams.set('search', search.trim())
    if (dueThisWeek && value) nextParams.set('due_this_week', dueThisWeek)
    if (value) nextParams.set('status', value)
    setSearchParams(nextParams)
  }

  const closeReasonModal = () => {
    setReasonRequest(null)
    setReasonMode('')
    setReasonForm({ staff_response: '', promised_payment_date: '' })
    if (reasonRequestId) {
      const nextParams = new URLSearchParams(location.search)
      nextParams.delete('reason_request')
      navigate({
        pathname: location.pathname,
        search: nextParams.toString() ? `?${nextParams.toString()}` : '',
      }, { replace: true })
    }
  }

  const openReasonRequest = (request) => {
    setReasonRequest(request)
    setReasonForm({
      staff_response: request.staff_response || '',
      promised_payment_date: request.promised_payment_date || '',
    })
    if (!isSuperAdmin && request.status === 'pending_response') {
      setReasonMode('respond')
    } else {
      setReasonMode('review')
    }
  }

  const upsertReasonRequest = (request) => {
    setRows((currentRows) => currentRows.map((row) => {
      if (Number(row.id) !== Number(request.payment)) return row
      const existing = row.active_reason_requests || []
      const filtered = existing.filter((item) => Number(item.id) !== Number(request.id))
      const isActive = ['pending_response', 'pending_admin_approval'].includes(request.status)
      return {
        ...row,
        active_reason_requests: isActive ? [...filtered, request] : filtered,
      }
    }))
  }

  const askReason = async (row, installment) => {
    setMessage('')
    setReasonSubmitting(true)
    try {
      const { data } = await api.post('/payment-reason-requests/', {
        payment: row.id,
        installment_index: installment.index,
      })
      upsertReasonRequest(data)
      setMessage(data.status === 'pending_response' ? 'Reason request sent to branch staff.' : 'Reason request already exists.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to create reason request.'))
    } finally {
      setReasonSubmitting(false)
    }
  }

  const submitReasonResponse = async () => {
    if (!reasonRequest) return
    setReasonSubmitting(true)
    setMessage('')
    try {
      const { data } = await api.post(`/payment-reason-requests/${reasonRequest.id}/respond/`, reasonForm)
      upsertReasonRequest(data)
      closeReasonModal()
      setMessage('Response submitted to Admin.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to submit response.'))
    } finally {
      setReasonSubmitting(false)
    }
  }

  const reviewReasonResponse = async (decision) => {
    if (!reasonRequest) return
    setReasonSubmitting(true)
    setMessage('')
    try {
      const { data } = await api.post(`/payment-reason-requests/${reasonRequest.id}/${decision}/`)
      upsertReasonRequest(data)
      closeReasonModal()
      setMessage(decision === 'approve' ? 'Promised payment date approved.' : 'Reason response rejected.')
      if (decision === 'approve') {
        const refreshed = await api.get('/payments/', {
          params: {
            month,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...(dueThisWeek ? { due_this_week: dueThisWeek } : {}),
            ...(isSuperAdmin && branch ? { branch } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        })
        setRows(refreshed.data.results || refreshed.data)
        setSummary(refreshed.data.summary || summary)
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, `Failed to ${decision} response.`))
    } finally {
      setReasonSubmitting(false)
    }
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

  const actionControls = (row, compact = false) => {
    const nextPending = nextPendingInstallment(row)
    const reason = nextPending ? activeReasonRequestFor(row, nextPending.index) : null
    const buttonClass = compact
      ? 'whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-semibold'
      : 'inline-flex whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold'
    const secondaryClass = `${buttonClass} border border-slate-200 bg-white text-slate-700`
    const primaryClass = `${buttonClass} bg-slate-950 text-white disabled:opacity-60`

    if (isSuperAdmin) {
      if (!nextPending || !['unpaid', 'partial'].includes(row.status)) {
        return null
      }
      if (reason?.status === 'pending_response') {
        return <span className="inline-flex whitespace-nowrap rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Reason Requested</span>
      }
      if (reason?.status === 'pending_admin_approval') {
        return (
          <button type="button" onClick={() => openReasonRequest(reason)} className={primaryClass}>
            Review Response
          </button>
        )
      }
      return (
        <button type="button" onClick={() => askReason(row, nextPending)} disabled={reasonSubmitting} className={primaryClass}>
          Ask Reason
        </button>
      )
    }

    return (
      <div className="flex flex-wrap gap-2">
        {Number(row.balance || 0) > 0 ? (
          <button
            type="button"
            onClick={() => sendReminder(row)}
            disabled={sendingId === row.id}
            className={primaryClass}
          >
            {sendingId === row.id ? 'Sending...' : 'Reminder'}
          </button>
        ) : (
          null
        )}
        {reason?.status === 'pending_response' && (
          <button type="button" onClick={() => openReasonRequest(reason)} className={secondaryClass}>
            Respond to Admin
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Payments</p>
        <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              {weeklyPendingFilter ? 'Weekly Pending Payments' : duePaymentsFilter ? 'Due & Overdue Payments' : 'Payment Tracker'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {weeklyPendingFilter
                ? 'Students with payments due this week.'
                : duePaymentsFilter
                ? 'Students with pending payments due today or earlier.'
                : 'Track collections, dues, balances, and student installment history month by month.'}
            </p>
            {(duePaymentsFilter || weeklyPendingFilter) && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-700 ring-1 ring-rose-100">
                  {weeklyPendingFilter ? 'Weekly Pending Payments' : 'Due & Overdue Payments'}
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
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              {weeklyPendingFilter ? 'Weekly Pending Payments' : duePaymentsFilter ? 'Due & Overdue Payments' : 'Payment tracking'}
            </h2>
            <StatusFilterChips
              items={paymentSummary}
              value={statusFilter}
              onChange={applyStatusFilter}
              className="xl:justify-end"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading payments...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">
            {weeklyPendingFilter
              ? 'No weekly pending payments found.'
              : duePaymentsFilter
              ? 'No due or overdue pending payments found.'
              : 'No payment records found for this month.'}
          </div>
        ) : (
          <div className="p-4">
            <CRMTable
              rows={rows}
              columns={[
                {
                  key: 'student',
                  header: 'Student',
                  width: 'minmax(150px,1.25fr)',
                  render: (row) => (
                    <div className="min-w-0">
                      <Link to={`/payments/${row.id}`} className="truncate font-bold text-slate-950 hover:text-cyan-700">{row.student_name}</Link>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.student_phone || row.student_number || '-'}</p>
                    </div>
                  ),
                },
                { key: 'course', header: 'Course', width: 'minmax(140px,1fr)', render: (row) => <span className="truncate text-slate-700">{row.course_name || '-'}</span> },
                { key: 'paid', header: 'Paid', width: '105px', render: (row) => <span className="font-semibold text-slate-900">Rs {money(row.paid_amount)}</span> },
                { key: 'balance', header: 'Balance', width: '110px', render: (row) => <span className="font-black text-slate-950">Rs {money(row.balance)}</span> },
                { key: 'dueDate', header: 'Due Date', width: '120px', render: (row) => <span className="text-slate-700">{formatDate(nextPendingInstallment(row)?.due_date || row.next_payment_date)}</span> },
                { key: 'status', header: 'Status', width: '115px', render: (row) => <StatusBadge tone={row.status === 'paid' ? 'green' : row.status === 'partial' ? 'amber' : 'red'}>{statusLabel(row.status)}</StatusBadge> },
                {
                  key: 'actions',
                  header: 'Actions',
                  width: 'minmax(120px,0.9fr)',
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      {actionControls(row)}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}
      </section>

      {reasonRequest && (
        <div onClick={closeReasonModal} className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div onClick={(event) => event.stopPropagation()} className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white shadow-2xl">
            <ModalCloseButton onClick={closeReasonModal} label="Close payment reason request" />
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="pr-10">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Payment Reason Request</p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {reasonMode === 'respond' ? 'Respond to Admin' : 'Review Staff Response'}
                  </h3>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Student</p>
                  <p className="mt-1 font-bold text-slate-950">{reasonRequest.student_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Course</p>
                  <p className="mt-1 font-bold text-slate-950">{reasonRequest.course_name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Installment</p>
                  <p className="mt-1 font-bold text-slate-950">{reasonRequest.installment_label || `${reasonRequest.installment_index} Installment`}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current Due Date</p>
                  <p className="mt-1 font-bold text-slate-950">{formatDate(reasonRequest.current_installment_due_date || reasonRequest.installment_due_date)}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Admin Question</p>
                <p className="mt-2 font-semibold text-slate-950">{reasonRequest.question}</p>
              </div>

              {reasonMode === 'respond' ? (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Response / Reason</label>
                    <textarea
                      value={reasonForm.staff_response}
                      onChange={(event) => setReasonForm((current) => ({ ...current, staff_response: event.target.value }))}
                      rows={5}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Promised Payment Date</label>
                    <input
                      type="date"
                      value={reasonForm.promised_payment_date}
                      onChange={(event) => setReasonForm((current) => ({ ...current, promised_payment_date: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={submitReasonResponse}
                    disabled={reasonSubmitting}
                    className="w-full rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {reasonSubmitting ? 'Submitting...' : 'Submit Response'}
                  </button>
                </>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Staff Reason</p>
                      <p className="mt-2 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        {reasonRequest.staff_response || '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Promised Payment Date</p>
                      <p className="mt-1 font-bold text-slate-950">{formatDate(reasonRequest.promised_payment_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Submitted By</p>
                      <p className="mt-1 font-bold text-slate-950">{reasonRequest.submitted_by || reasonRequest.branch_staff_name || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Submitted Date/Time</p>
                      <p className="mt-1 font-bold text-slate-950">{reasonRequest.submitted_display || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                      <p className="mt-1 font-bold text-slate-950">{statusLabel(reasonRequest.status)}</p>
                    </div>
                  </div>
                  {isSuperAdmin && reasonRequest.status === 'pending_admin_approval' && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => reviewReasonResponse('approve')}
                        disabled={reasonSubmitting}
                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewReasonResponse('reject')}
                        disabled={reasonSubmitting}
                        className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
