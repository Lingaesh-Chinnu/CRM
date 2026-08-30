import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import AdminDeleteButton from '../../components/common/AdminDeleteButton'

const LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE = 6900

const initialInstallment = {
  amount: '',
  payment_mode: 'cash',
  payment_date: new Date().toISOString().slice(0, 10),
  reference_number: '',
  notes: '',
}

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

function billWasSent(installment) {
  return Boolean(installment?.bill_last_sent_at || installment?.bill_last_sent_at_display)
}

function sendBillButtonClass(installment, mobile = false) {
  const radius = mobile ? 'rounded-2xl' : 'rounded-xl'
  const padding = mobile ? 'px-4 py-3 text-sm' : 'px-2 py-2 text-xs'
  const color = billWasSent(installment)
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-slate-950 text-white hover:bg-slate-800'
  return `w-full whitespace-nowrap ${radius} ${color} ${padding} font-semibold transition disabled:opacity-60`
}

function blobFromBase64(value, contentType) {
  const byteCharacters = window.atob(value || '')
  const byteArrays = []
  for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
    const slice = byteCharacters.slice(offset, offset + 1024)
    byteArrays.push(new Uint8Array([...slice].map((char) => char.charCodeAt(0))))
  }
  return new Blob(byteArrays, { type: contentType })
}

function billPdfBlob(data) {
  if (!data.bill_pdf_data) {
    throw new Error('Bill PDF was not returned by the server.')
  }
  return blobFromBase64(data.bill_pdf_data, data.bill_pdf_content_type || 'application/pdf')
}

async function shareBillPdfFile(data) {
  const blob = billPdfBlob(data)
  const file = new File(
    [blob],
    data.document_filename || `${data.document_number || 'bill'}.pdf`,
    { type: blob.type || 'application/pdf' },
  )
  const sharePayload = {
    files: [file],
    text: data.whatsapp_message || '',
    title: 'Payment Bill',
  }
  if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
    throw new Error('PDF file sharing is not supported in this browser.')
  }
  await navigator.share(sharePayload)
}

function openBillPdfBlob(data) {
  const blob = billPdfBlob(data)
  const url = window.URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
}

function downloadBillPdfBlob(data) {
  const blob = billPdfBlob(data)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = data.document_filename || `${data.document_number || 'bill'}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function openWhatsAppBillHandoff(data, targetWindow = null) {
  if (data.whatsapp_url) {
    if (targetWindow && !targetWindow.closed) {
      targetWindow.opener = null
      targetWindow.location.href = data.whatsapp_url
      return
    }
    window.open(data.whatsapp_url, '_blank', 'noopener,noreferrer')
  }
}

function referenceConfig(mode) {
  const config = {
    cash: {
      label: 'Payment Reference',
      placeholder: 'Auto-generated cash reference',
    },
    upi: {
      label: 'UPI Transaction ID',
      placeholder: 'Enter UPI transaction ID',
    },
    cash_upi: {
      label: 'UPI Transaction ID',
      placeholder: 'Enter UPI transaction ID',
    },
    cheque: {
      label: 'Cheque Number',
      placeholder: 'Enter cheque number',
    },
    bank_transfer: {
      label: 'Transfer ID / Reference ID',
      placeholder: 'Enter transfer reference ID',
    },
    card: {
      label: 'Card Last 4 Digits',
      placeholder: 'Enter 4 digits',
    },
    other: {
      label: 'Reference Number',
      placeholder: 'Enter reference number',
    },
  }
  return config[mode] || config.other
}

function nextCashReference(payment) {
  if (!payment) return ''
  const studentId = payment.student_number || `ENR${payment.enrollment || payment.id || ''}`
  const paymentCount = Array.isArray(payment.installments) ? payment.installments.length : 0
  return `${studentId}-P${String(paymentCount + 1).padStart(2, '0')}`
}

function allocationPreview(installments, amount) {
  let remaining = Number(amount || 0)
  const rows = []
  for (const item of installments || []) {
    if (remaining <= 0) break
    const pending = Number(item.pending_amount || 0)
    if (pending <= 0) continue
    const allocated = Math.min(remaining, pending)
    rows.push({
      index: item.index,
      label: item.label,
      amount: allocated,
    })
    remaining -= allocated
  }
  return rows
}

function validateSchedule(schedule, totalFees) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return 'Payment schedule is required.'
  }
  const expectedTotal = Number(totalFees || 0)
  if (expectedTotal > 0 && expectedTotal <= LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE) {
    const row = schedule[0]
    const amount = Number(row?.amount)
    if (schedule.length !== 1) return 'Small fee courses must use a single payment schedule.'
    if (!Number.isFinite(amount) || amount <= 0) return 'Installment amount must be greater than zero.'
    if (amount !== expectedTotal) return 'Payment schedule total must match course fee.'
    if (!row.due_date) return 'Each installment needs a due date.'
    return ''
  }
  let total = 0
  for (const [index, item] of schedule.entries()) {
    if (item.amount === '' || item.amount === null || item.amount === undefined) {
      return 'Each installment needs an amount.'
    }
    const amount = Number(item.amount)
    if (!Number.isFinite(amount)) {
      return 'Installment amounts must be numeric.'
    }
    if (amount <= 0) {
      return 'Installment amount must be greater than zero.'
    }
    if (index === 0 && amount !== 5000) return 'Enrollment Fee must be Rs 5,000.'
    if (index > 0 && index < schedule.length - 1 && amount < 5000) return 'Each installment must be Rs 5,000 or above.'
    if (!item.due_date) {
      return 'Each installment needs a due date.'
    }
    total += amount
  }
  if (total <= 0) {
    return 'Payment schedule total must be greater than zero.'
  }
  return ''
}

function addPendingInstallment(schedule, summary) {
  const rows = schedule.map((item, index) => ({
    ...item,
    paid_amount: Number(summary[index]?.paid_amount || 0),
  }))
  const firstPendingIndex = rows.findIndex((item) => item.paid_amount <= 0)
  if (firstPendingIndex < 0) return null

  const pendingRows = rows.slice(firstPendingIndex)
  const pendingTotal = pendingRows.reduce((total, item) => total + Number(item.amount || 0), 0)
  const nextCount = pendingRows.length + 1
  if (pendingTotal <= (nextCount - 1) * 5000) return null

  const base = Math.floor(pendingTotal / nextCount)
  const amounts = base >= 5000
    ? [...Array(nextCount).fill(base)]
    : [...Array(nextCount - 1).fill(5000), pendingTotal - ((nextCount - 1) * 5000)]
  if (base >= 5000) amounts[amounts.length - 1] += pendingTotal - (base * nextCount)

  let dueDate = pendingRows[0]?.due_date || new Date().toISOString().slice(0, 10)
  const rebuiltPending = amounts.map((amount, offset) => {
    const existing = pendingRows[offset] || {}
    const row = {
      label: `${firstPendingIndex + offset}${['st', 'nd', 'rd'][firstPendingIndex + offset - 1] || 'th'} Installment`,
      amount,
      due_date: existing.due_date || dueDate,
    }
    const nextDate = new Date(`${row.due_date}T00:00:00`)
    nextDate.setMonth(nextDate.getMonth() + 1)
    dueDate = nextDate.toISOString().slice(0, 10)
    return row
  })
  return [...rows.slice(0, firstPendingIndex).map(({ paid_amount, ...item }) => item), ...rebuiltPending]
}

export default function PaymentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [payment, setPayment] = useState(null)
  const [form, setForm] = useState(initialInstallment)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [billActionId, setBillActionId] = useState(null)
  const [message, setMessage] = useState('')
  const [schedule, setSchedule] = useState([])
  const [branches, setBranches] = useState([])
  const [paymentBranch, setPaymentBranch] = useState('')
  const [branchSaving, setBranchSaving] = useState(false)
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    loadPayment()
  }, [id])

  useEffect(() => {
    if (!isSuperAdmin) return
    api.get('/branches/')
      .then(({ data }) => setBranches(data.results || data || []))
      .catch(() => setBranches([]))
  }, [isSuperAdmin])

  const loadPayment = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/payments/${id}/`)
      setPayment(data)
      setSchedule(data.payment_schedule || [])
      setPaymentBranch(data.branch ? String(data.branch) : '')
    } catch {
      setMessage('Failed to load payment details.')
    } finally {
      setLoading(false)
    }
  }

  const changePaymentBranch = async () => {
    if (!paymentBranch || !payment) return
    setBranchSaving(true)
    setMessage('')
    try {
      const { data } = await api.post(`/payments/${payment.id}/change-payment-branch/`, { branch: Number(paymentBranch) })
      setPayment(data)
      setSchedule(data.payment_schedule || [])
      setPaymentBranch(data.branch ? String(data.branch) : '')
      setMessage('Payment branch updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || error.response?.data?.branch || 'Failed to change payment branch.')
    } finally {
      setBranchSaving(false)
    }
  }

  const addInstallment = async (event) => {
    event.preventDefault()
    if (!payment) return
    if (allInstallmentsCompleted) {
      setMessage('All installments are already completed.')
      return
    }

    const amount = Number(form.amount || 0)
    if (amount > Number(payment.balance || 0)) {
      setMessage('Payment amount cannot exceed the pending total fee balance.')
      return
    }

    const refConfig = referenceConfig(form.payment_mode)
    const referenceNumber = form.payment_mode === 'cash'
      ? nextCashReference(payment)
      : String(form.reference_number || '').trim()

    if (!referenceNumber) {
      setMessage(`${refConfig.label} is required.`)
      return
    }

    if (form.payment_mode === 'card' && !/^\d{4}$/.test(referenceNumber)) {
      setMessage('Card Last 4 Digits must be exactly 4 digits.')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      const { data } = await api.post('/installments/', {
        payment: payment.id,
        enrollment: payment.enrollment,
        amount,
        payment_mode: form.payment_mode,
        payment_date: form.payment_date,
        reference_number: referenceNumber,
        notes: form.notes,
      })
      setForm(initialInstallment)
      setMessage(data.detail || 'Payment entry added successfully.')
      await loadPayment()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to add installment.')
    } finally {
      setSaving(false)
    }
  }

  const generateBill = async (installmentId) => {
    setBillActionId(installmentId)
    setMessage('')
    try {
      await api.post(`/installments/${installmentId}/generate-bill/`)
      setMessage('Bill generated successfully.')
      await loadPayment()
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to generate bill.')
    } finally {
      setBillActionId(null)
    }
  }

  const openBill = async (installment) => {
    if (!installment) return
    setBillActionId(installment.id)
    setMessage('')
    try {
      const { data } = await api.get(`/installments/${installment.id}/view-bill/`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(data)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to open bill.')
    } finally {
      setBillActionId(null)
    }
  }

  const downloadBill = async (installment) => {
    if (!installment) return
    setBillActionId(installment.id)
    setMessage('')
    try {
      const { data } = await api.get(`/installments/${installment.id}/download-bill/`, {
        responseType: 'blob',
      })
      const documentNumber = installment.document_number || installment.bill_number || 'bill'
      const url = window.URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `${documentNumber}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to download bill.')
    } finally {
      setBillActionId(null)
    }
  }

  const sendBill = async (installment) => {
    if (!installment) return
    setBillActionId(installment.id)
    setMessage('')
    const whatsappWindow = window.open('about:blank', '_blank')
    try {
      const { data } = await api.post(`/installments/${installment.id}/send-bill/`)
      let sentData = data
      if (data.share_mode === 'whatsapp_web_pdf_share') {
        openWhatsAppBillHandoff(data, whatsappWindow)
        try {
          await shareBillPdfFile(data)
          const confirmation = await api.post(`/installments/${installment.id}/confirm-bill-sent/`)
          sentData = confirmation.data
        } catch (shareError) {
          openBillPdfBlob(data)
          downloadBillPdfBlob(data)
          sentData = {
            ...data,
            detail: data.detail || shareError.message || 'WhatsApp Web opened. The generated Bill PDF has been opened/downloaded for attachment.',
          }
        }
      } else if (data.whatsapp_url) {
        openWhatsAppBillHandoff(data, whatsappWindow)
      } else if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.close()
      }
      setMessage(sentData.whatsapp_sent ? 'Bill sent successfully.' : sentData.whatsapp_error || sentData.detail || 'Bill send request failed.')
      await loadPayment()
    } catch (error) {
      if (whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.close()
      }
      setMessage(error.response?.data?.detail || error.message || 'Failed to send bill.')
    } finally {
      setBillActionId(null)
    }
  }

  const updateSchedule = async () => {
    const validationMessage = validateSchedule(schedule, payment?.total_fees)
    if (validationMessage) {
      setMessage(validationMessage)
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const { data } = await api.post(`/payments/${id}/update-schedule/`, {
        payment_schedule: schedule,
      })
      setPayment(data)
      setSchedule(data.payment_schedule || [])
      setMessage('Payment schedule updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update payment schedule.')
    } finally {
      setSaving(false)
    }
  }

  const addScheduleInstallment = () => {
    if (Number(payment?.total_fees || 0) <= LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE) {
      setMessage('Small fee courses use a single payment schedule.')
      return
    }
    const next = addPendingInstallment(schedule, installmentSummary)
    if (!next) {
      setMessage('Remaining pending amount cannot be split into another valid installment.')
      return
    }
    setSchedule(next)
    setMessage('')
  }

  const deletePayment = async () => {
    await api.delete(`/payments/${id}/`)
    navigate('/payments', {
      replace: true,
      state: { message: 'Payment deleted. Enrollment remains active and can be added to payments again.' },
    })
  }

  if (loading) {
    return <div className="p-6 text-slate-500">Loading payment details...</div>
  }

  if (!payment) {
    return <div className="p-6 text-slate-500">Payment record not found.</div>
  }

  const installmentSummary = payment.installment_summary || []
  const activeInstallment = installmentSummary.find((item) => item.status !== 'paid')
  const allInstallmentsCompleted = installmentSummary.length > 0 && !activeInstallment
  const enteredAmount = Number(form.amount || 0)
  const previewRows = allocationPreview(installmentSummary, enteredAmount)
  const paymentNotice = allInstallmentsCompleted
    ? 'All installments are already completed.'
    : activeInstallment && enteredAmount > 0
      ? previewRows.length > 1
        ? 'Payment will be carried forward across installments and saved as one payment entry.'
        : enteredAmount + Number(activeInstallment.paid_amount || 0) >= Number(activeInstallment.required_amount || 0)
          ? 'Installment will be completed. Admin can generate the official bill after saving.'
          : 'Partial payment will be saved as Pending Approval. Admin can generate the receipt.'
    : ''
  const paymentHistory = [...(payment.installments || [])].sort((a, b) => {
    const dateCompare = String(a.payment_date || '').localeCompare(String(b.payment_date || ''))
    return dateCompare || Number(a.id || 0) - Number(b.id || 0)
  })
  const currentReferenceConfig = referenceConfig(form.payment_mode)
  const referenceValue = form.payment_mode === 'cash' ? nextCashReference(payment) : form.reference_number
  const headerMeta = [
    payment.student_number || 'Student ID pending',
    payment.course_name || 'Course not set',
    ...(isSuperAdmin ? [
      `Payment: ${payment.branch_name || 'Branch not set'}`,
      `Enrollment: ${payment.enrollment_branch_name || 'Branch not set'}`,
      payment.counselor_name || 'Counselor not assigned',
    ] : []),
  ]

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Payments</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{payment.student_name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-500">
            {headerMeta.map((item, index) => (
              <span key={`${item}-${index}`} className="inline-flex items-center gap-2">
                <span className={index === 0 ? 'font-semibold text-slate-700' : ''}>{item}</span>
                {index < headerMeta.length - 1 && <span className="text-slate-300">•</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {isSuperAdmin && (
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
              <select
                value={paymentBranch}
                onChange={(event) => setPaymentBranch(event.target.value)}
                className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
              >
                <option value="">Select payment branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={changePaymentBranch}
                disabled={branchSaving || !paymentBranch || String(paymentBranch) === String(payment.branch || '')}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {branchSaving ? 'Saving...' : 'Change Payment Branch'}
              </button>
            </div>
          )}
          {isSuperAdmin && (
            <AdminDeleteButton label="payment" onConfirm={deletePayment} />
          )}
          <Link
            to="/payments"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back to Payments
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_420px]">
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            {[
              { label: 'Total Fees', value: Number(payment.total_fees).toLocaleString() },
              { label: 'Paid Amount', value: Number(payment.paid_amount).toLocaleString() },
              { label: 'Balance', value: Number(payment.balance).toLocaleString() },
              { label: 'Status', value: statusLabel(payment.status) },
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{item.value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">Payment Schedule</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Auto-generated from final fees, enrollment date, and course start date.
                </p>
              </div>
              {isSuperAdmin && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addScheduleInstallment}
                    disabled={saving}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Add Installment
                  </button>
                  <button
                    type="button"
                    onClick={updateSchedule}
                    disabled={saving}
                    className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    Save Schedule
                  </button>
                </div>
              )}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {schedule.map((item, index) => {
                const summary = installmentSummary[index]
                return (
                <div key={`${item.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-950">{item.label}</p>
                  {isSuperAdmin ? (
                    <div className="mt-3 space-y-3">
                      <input
                        type="number"
                        min={index === 0 ? '5000' : '0.01'}
                        value={item.amount}
                        disabled={index === 0 || Number(summary?.paid_amount || 0) > 0}
                        onChange={(event) => {
                          const next = [...schedule]
                          next[index] = { ...next[index], amount: event.target.value }
                          setSchedule(next)
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="date"
                        value={item.due_date || ''}
                        disabled={Number(summary?.paid_amount || 0) > 0}
                        onChange={(event) => {
                          const next = [...schedule]
                          next[index] = { ...next[index], due_date: event.target.value }
                          setSchedule(next)
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      {summary ? (
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Paid Rs {money(summary.paid_amount)} | Pending Rs {money(summary.pending_amount)} | {statusLabel(summary.status)}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 text-2xl font-black text-slate-950">Rs {money(summary?.required_amount || item.amount)}</p>
                      <p className="mt-1 text-sm text-slate-500">Paid: Rs {money(summary?.paid_amount)} | Pending: Rs {money(summary?.pending_amount)}</p>
                      <p className="mt-1 text-sm text-slate-500">Due: {formatDate(summary?.due_date || item.due_date)} | {statusLabel(summary?.status)}</p>
                    </>
                  )}
                </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-black tracking-tight text-slate-950">Payment History</h2>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {paymentHistory.length || 0} Entries
              </div>
            </div>

            {!paymentHistory.length ? (
              <div className="p-6 text-slate-500">No payment entries added yet.</div>
            ) : (
              <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="w-[12%] px-4 py-3">Date</th>
                      <th className="w-[12%] px-4 py-3 text-right">Amount</th>
                      <th className="w-[22%] px-4 py-3">Document</th>
                      <th className="w-[18%] px-4 py-3">Installment</th>
                      <th className="w-[10%] px-4 py-3">Status</th>
                      <th className="w-[14%] px-4 py-3">Reference</th>
                      <th className="w-[14%] px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paymentHistory.map((installment) => {
                      const documentStatus = installment.document_status_display || 'Pending Approval'
                      return (
                        <tr key={installment.id}>
                          <td className="px-4 py-4 align-top text-slate-700">{formatDate(installment.payment_date)}</td>
                          <td className="px-4 py-4 text-right align-top font-black text-slate-950">Rs {money(installment.amount)}</td>
                          <td className="px-4 py-4 align-top">
                            <span className="inline-flex max-w-full whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                              {documentStatus}
                            </span>
                            {installment.document_number ? <p className="mt-2 break-words text-xs leading-5 text-slate-500 [word-break:break-word]">{installment.document_number}</p> : null}
                          </td>
                          <td className="break-words px-4 py-4 align-top text-slate-700 [word-break:break-word]">{installment.installment_label || `${installment.installment_index} Installment`}</td>
                          <td className="px-4 py-4 align-top text-slate-700">{statusLabel(installment.installment_status)}</td>
                          <td className="break-words px-4 py-4 align-top text-slate-500 [word-break:break-word]">{installment.reference_number || 'Not provided'}</td>
                          <td className="px-4 py-4 align-top">
                            <div className="ml-auto flex w-full flex-col gap-2">
                              {isSuperAdmin ? (
                                !installment.bill_number && installment.installment_status === 'paid' ? (
                                  <button
                                    type="button"
                                    onClick={() => generateBill(installment.id)}
                                    disabled={billActionId === installment.id}
                                    className="w-full whitespace-nowrap rounded-xl bg-slate-950 px-2 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                                  >
                                    {billActionId === installment.id ? 'Generating...' : 'Generate Bill'}
                                  </button>
                                ) : null
                              ) : null}
                              {installment.bill_number ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openBill(installment)}
                                    disabled={billActionId === installment.id}
                                    className="w-full whitespace-nowrap rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {billActionId === installment.id ? 'Opening...' : 'View Bill'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadBill(installment)}
                                    disabled={billActionId === installment.id}
                                    className="w-full whitespace-nowrap rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    {billActionId === installment.id ? 'Downloading...' : 'Download Bill'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => sendBill(installment)}
                                    disabled={billActionId === installment.id}
                                    className={sendBillButtonClass(installment)}
                                  >
                                    {billActionId === installment.id ? 'Sending...' : billWasSent(installment) ? 'Bill Sent' : 'Send Bill'}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-200 md:hidden">
                {paymentHistory.map((installment) => {
                  const documentStatus = installment.document_status_display || 'Pending Approval'
                  return (
                    <div key={installment.id} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-950">Rs {money(installment.amount)}</p>
                          <p className="mt-1 text-sm text-slate-500">{formatDate(installment.payment_date)}</p>
                        </div>
                        <span className="max-w-[56%] shrink-0 whitespace-normal rounded-full bg-slate-100 px-3 py-1 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                          {documentStatus}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 text-sm">
                        <div><span className="font-semibold text-slate-900">Installment: </span>{installment.installment_label || `${installment.installment_index} Installment`}</div>
                        <div><span className="font-semibold text-slate-900">Status: </span>{statusLabel(installment.installment_status)}</div>
                        <div><span className="font-semibold text-slate-900">Reference: </span>{installment.reference_number || 'Not provided'}</div>
                        {installment.document_number ? <div><span className="font-semibold text-slate-900">Document: </span>{installment.document_number}</div> : null}
                      </div>
                      <div className="mt-4 flex w-full flex-col gap-2">
                        {isSuperAdmin ? (
                          !installment.bill_number && installment.installment_status === 'paid' ? (
                            <button
                              type="button"
                              onClick={() => generateBill(installment.id)}
                              disabled={billActionId === installment.id}
                              className="w-full whitespace-nowrap rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              {billActionId === installment.id ? 'Generating...' : 'Generate Bill'}
                            </button>
                          ) : null
                        ) : null}
                        {installment.bill_number ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openBill(installment)}
                              disabled={billActionId === installment.id}
                              className="w-full whitespace-nowrap rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              {billActionId === installment.id ? 'Opening...' : 'View Bill'}
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadBill(installment)}
                              disabled={billActionId === installment.id}
                              className="w-full whitespace-nowrap rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                            >
                              {billActionId === installment.id ? 'Downloading...' : 'Download Bill'}
                            </button>
                            <button
                              type="button"
                              onClick={() => sendBill(installment)}
                              disabled={billActionId === installment.id}
                              className={sendBillButtonClass(installment, true)}
                            >
                              {billActionId === installment.id ? 'Sending...' : billWasSent(installment) ? 'Bill Sent' : 'Send Bill'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
              </>
            )}
          </section>
        </div>

        <form onSubmit={addInstallment} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Add installment</h2>
          {activeInstallment ? (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-950">{activeInstallment.label}</p>
              <p className="mt-1">
                Required Rs {money(activeInstallment.required_amount)} | Paid Rs {money(activeInstallment.paid_amount)} | Pending Rs {money(activeInstallment.pending_amount)}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              All installments are already completed.
            </div>
          )}
          <div className="mt-5 space-y-4">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{0,2})?"
              placeholder="Amount"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />

            <select
              value={form.payment_mode}
              onChange={(event) => setForm({ ...form, payment_mode: event.target.value, reference_number: '' })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="cash_upi">Cash + UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
            </select>

            <input
              type="date"
              value={form.payment_date}
              onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {currentReferenceConfig.label}
              </span>
              <input
                placeholder={currentReferenceConfig.placeholder}
                value={referenceValue}
                onChange={(event) => setForm({ ...form, reference_number: event.target.value })}
                readOnly={form.payment_mode === 'cash'}
                inputMode={form.payment_mode === 'card' ? 'numeric' : undefined}
                maxLength={form.payment_mode === 'card' ? 4 : undefined}
                pattern={form.payment_mode === 'card' ? '\\d{4}' : undefined}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 read-only:cursor-not-allowed read-only:bg-slate-100 read-only:text-slate-600"
                required
              />
            </label>

            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </div>

          {previewRows.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">Payment will be allocated as:</p>
              <div className="mt-3 space-y-2">
                {previewRows.map((row) => (
                  <div key={`${row.index}-${row.label}`} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-slate-700">{row.label}</span>
                    <span className="font-black text-slate-950">Rs {money(row.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {paymentNotice && <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{paymentNotice}</p>}
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}

          <button
            type="submit"
            disabled={saving || allInstallmentsCompleted}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Add Installment'}
          </button>
        </form>
      </section>
    </div>
  )
}
