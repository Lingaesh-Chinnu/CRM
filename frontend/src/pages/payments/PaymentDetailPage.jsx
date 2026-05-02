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
      await api.post('/installments/', {
        payment: payment.id,
        enrollment: payment.enrollment,
        amount: Number(form.amount),
        payment_mode: form.payment_mode,
        payment_date: form.payment_date,
        reference_number: form.reference_number,
        notes: form.notes,
      })
      setForm(initialInstallment)
      setMessage('Installment added successfully.')
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
              {schedule.map((item, index) => (
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
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 text-2xl font-black text-slate-950">Rs {Number(item.amount || 0).toLocaleString('en-IN')}</p>
                      <p className="mt-1 text-sm text-slate-500">Due: {item.due_date || 'Not set'}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-black tracking-tight text-slate-950">Installments</h2>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {payment.installments?.length || 0} Entries
              </div>
            </div>

            {!payment.installments?.length ? (
              <div className="p-6 text-slate-500">No installments added yet.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {payment.installments.map((installment) => (
                  <div key={installment.id} className="px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-lg font-bold tracking-tight text-slate-950">
                          {Number(installment.amount).toLocaleString()} via {statusLabel(installment.payment_mode)}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {installment.payment_date} | {installment.reference_number || 'No reference'} | {installment.collected_by_name || 'System'}
                        </p>
                        {installment.bill_is_generated ? (
                          <p className="mt-2 text-sm text-slate-500">
                            {installment.bill_number} | Generated by {installment.bill_generated_by_name || 'Admin'}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Bill not generated yet.</p>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-3 lg:items-end">
                        <p className="max-w-md text-sm text-slate-500">{installment.notes || 'No notes'}</p>
                        <div className="flex flex-wrap gap-3">
                          {isSuperAdmin && !installment.bill_is_generated ? (
                            <button
                              type="button"
                              onClick={() => generateBill(installment.id)}
                              disabled={billActionId === installment.id}
                              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              {billActionId === installment.id ? 'Generating...' : 'Generate Bill'}
                            </button>
                          ) : null}

                          {installment.bill_is_generated ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openBill(installment.id, 'view')}
                                disabled={billActionId === installment.id}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                              >
                                View Bill
                              </button>
                              <button
                                type="button"
                                onClick={() => openBill(installment.id, 'download')}
                                disabled={billActionId === installment.id}
                                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                              >
                                Download Bill
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <form onSubmit={addInstallment} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Add installment</h2>
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
