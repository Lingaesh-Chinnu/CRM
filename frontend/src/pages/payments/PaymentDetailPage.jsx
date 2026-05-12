import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'

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

export default function PaymentDetailPage() {
  const { id } = useParams()
  const [payment, setPayment] = useState(null)
  const [form, setForm] = useState(initialInstallment)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [billActionId, setBillActionId] = useState(null)
  const [message, setMessage] = useState('')
  const [schedule, setSchedule] = useState([])
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    loadPayment()
  }, [id])

  const loadPayment = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/payments/${id}/`)
      setPayment(data)
      setSchedule(data.payment_schedule || [])
    } catch {
      setMessage('Failed to load payment details.')
    } finally {
      setLoading(false)
    }
  }

  const addInstallment = async (event) => {
    event.preventDefault()
    if (!payment) return

    setSaving(true)
    setMessage('')
    try {
      const { data } = await api.post('/installments/', {
        payment: payment.id,
        enrollment: payment.enrollment,
        amount: Number(form.amount),
        payment_mode: form.payment_mode,
        payment_date: form.payment_date,
        reference_number: form.reference_number,
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

  const openBill = async (installmentId, mode) => {
    setBillActionId(installmentId)
    setMessage('')
    try {
      const { data } = await api.get(`/installments/${installmentId}/${mode === 'download' ? 'download-bill' : 'view-bill'}/`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(data)
      if (mode === 'download') {
        const link = document.createElement('a')
        link.href = url
        link.download = `bill-${installmentId}.html`
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to open bill.')
    } finally {
      setBillActionId(null)
    }
  }

  const updateSchedule = async () => {
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

  if (loading) {
    return <div className="p-6 text-slate-500">Loading payment details...</div>
  }

  if (!payment) {
    return <div className="p-6 text-slate-500">Payment record not found.</div>
  }

  const installmentSummary = payment.installment_summary || []
  const activeInstallment = installmentSummary.find((item) => item.status !== 'paid') || installmentSummary[installmentSummary.length - 1]
  const enteredAmount = Number(form.amount || 0)
  const paymentNotice = activeInstallment && enteredAmount > 0
    ? enteredAmount + Number(activeInstallment.paid_amount || 0) >= Number(activeInstallment.required_amount || 0)
      ? 'Installment completed successfully. Official bill will be generated.'
      : 'Minimum installment amount not completed. Receipt only will be generated.'
    : ''
  const paymentHistory = [...(payment.installments || [])].sort((a, b) => {
    const dateCompare = String(a.payment_date || '').localeCompare(String(b.payment_date || ''))
    return dateCompare || Number(a.id || 0) - Number(b.id || 0)
  })

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Payments</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{payment.student_name}</h1>
          <p className="mt-3 text-sm text-slate-500">
            {payment.student_number} | Enrollment #{payment.enrollment}
          </p>
        </div>
        <Link
          to="/payments"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Back to Payments
        </Link>
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
                <button
                  type="button"
                  onClick={updateSchedule}
                  disabled={saving}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  Save Schedule
                </button>
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
                        min="0"
                        value={item.amount}
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3 text-right">Amount</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Installment</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Reference</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {paymentHistory.map((installment) => {
                      const documentLabel = installment.document_type_display || (installment.bill_is_generated ? 'Bill' : 'Receipt')
                      return (
                        <tr key={installment.id}>
                          <td className="px-6 py-4 text-slate-700">{formatDate(installment.payment_date)}</td>
                          <td className="px-6 py-4 text-right font-black text-slate-950">Rs {money(installment.amount)}</td>
                          <td className="px-6 py-4">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                              {documentLabel}
                            </span>
                            {installment.document_number ? <p className="mt-1 text-xs text-slate-500">{installment.document_number}</p> : null}
                          </td>
                          <td className="px-6 py-4 text-slate-700">{installment.installment_label || `${installment.installment_index} Installment`}</td>
                          <td className="px-6 py-4 text-slate-700">{statusLabel(installment.installment_status)}</td>
                          <td className="px-6 py-4 text-slate-500">{installment.reference_number || 'No reference'}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              {isSuperAdmin && !installment.bill_is_generated && installment.installment_status === 'paid' ? (
                                <button
                                  type="button"
                                  onClick={() => generateBill(installment.id)}
                                  disabled={billActionId === installment.id}
                                  className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                                >
                                  {billActionId === installment.id ? 'Generating...' : 'Generate Bill'}
                                </button>
                              ) : null}
                              {installment.document_is_generated || installment.bill_is_generated ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openBill(installment.id, 'view')}
                                    disabled={billActionId === installment.id}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    View {documentLabel}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openBill(installment.id, 'download')}
                                    disabled={billActionId === installment.id}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                                  >
                                    Download
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
          ) : null}
          <div className="mt-5 space-y-4">
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="Amount"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />

            <select
              value={form.payment_mode}
              onChange={(event) => setForm({ ...form, payment_mode: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>

            <input
              type="date"
              value={form.payment_date}
              onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />

            <input
              placeholder="Reference number"
              value={form.reference_number}
              onChange={(event) => setForm({ ...form, reference_number: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />

            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </div>

          {paymentNotice && <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">{paymentNotice}</p>}
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Add Installment'}
          </button>
        </form>
      </section>
    </div>
  )
}
