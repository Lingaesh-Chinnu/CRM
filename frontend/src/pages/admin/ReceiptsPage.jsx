import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const today = new Date().toISOString().slice(0, 10)

const initialForm = {
  name: '',
  phone: '',
  purpose: '',
  amount: '',
  payment_mode: 'cash',
  payment_date: today,
  notes: '',
}

const paymentModes = [
  ['cash', 'Cash'],
  ['upi', 'UPI'],
  ['bank_transfer', 'Bank Transfer'],
  ['cheque', 'Cheque'],
  ['card', 'Card'],
  ['other', 'Other'],
]

function normaliseListResponse(data) {
  return data.results || data
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState([])
  const [form, setForm] = useState(initialForm)
  const [filters, setFilters] = useState({ search: '', payment_date: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeReceiptId, setActiveReceiptId] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadReceipts()
  }, [])

  const loadReceipts = async (overrideFilters = filters) => {
    setLoading(true)
    try {
      const params = {}
      if (overrideFilters.search) params.search = overrideFilters.search
      if (overrideFilters.payment_date) params.payment_date = overrideFilters.payment_date
      const { data } = await api.get('/admin-receipts/', { params })
      setReceipts(normaliseListResponse(data))
    } catch {
      setMessage('Failed to load receipts.')
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = (event) => {
    event.preventDefault()
    loadReceipts()
  }

  const clearFilters = () => {
    const next = { search: '', payment_date: '' }
    setFilters(next)
    loadReceipts(next)
  }

  const createReceipt = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.post('/admin-receipts/', {
        ...form,
        amount: Number(form.amount),
      })
      setForm(initialForm)
      setMessage('Receipt created successfully.')
      await loadReceipts()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to create receipt.')
    } finally {
      setSaving(false)
    }
  }

  const openReceipt = async (receipt, mode) => {
    setActiveReceiptId(receipt.id)
    setMessage('')
    try {
      const { data } = await api.get(`/admin-receipts/${receipt.id}/${mode === 'download' ? 'download-receipt' : 'view-receipt'}/`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(data)
      if (mode === 'download') {
        const link = document.createElement('a')
        link.href = url
        link.download = `${receipt.receipt_number || `receipt-${receipt.id}`}.pdf`
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      setMessage('Failed to open receipt.')
    } finally {
      setActiveReceiptId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Receipts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Create compact receipts for non-installment payments such as certifications, exam fees, service charges, and other payments.
        </p>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={createReceipt} className="self-start rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Create receipt</h2>

          <div className="mt-5 space-y-4">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Name"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="Phone Number"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />
            <input
              value={form.purpose}
              onChange={(event) => setForm({ ...form, purpose: event.target.value })}
              placeholder="Purpose"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              placeholder="Amount"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />
            <select
              value={form.payment_mode}
              onChange={(event) => setForm({ ...form, payment_mode: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              {paymentModes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              type="date"
              value={form.payment_date}
              onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Notes"
              className="min-h-[100px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </div>

          {message && <p className="mt-4 text-sm font-medium text-slate-600">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create Receipt'}
          </button>
        </form>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-950">Receipt list</h2>
                <p className="mt-1 text-sm text-slate-500">{receipts.length} receipts</p>
              </div>
              <form onSubmit={handleFilter} className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="Search name, phone, purpose"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 sm:w-64"
                />
                <input
                  type="date"
                  value={filters.payment_date}
                  onChange={(event) => setFilters({ ...filters, payment_date: event.target.value })}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
                <button type="submit" className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
                  Filter
                </button>
                <button type="button" onClick={clearFilters} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                  Clear
                </button>
              </form>
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading receipts...</div>
          ) : receipts.length === 0 ? (
            <div className="p-6 text-slate-500">No receipts found.</div>
          ) : (
            <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full table-fixed text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="w-[19%] px-5 py-4">Receipt</th>
                    <th className="w-[17%] px-5 py-4">Name</th>
                    <th className="w-[17%] px-5 py-4">Purpose</th>
                    <th className="w-[14%] px-5 py-4">Amount</th>
                    <th className="w-[17%] px-5 py-4">Payment</th>
                    <th className="w-[16%] px-5 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {receipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td className="px-5 py-4 align-top">
                        <p className="font-bold text-slate-950">{receipt.receipt_number}</p>
                        <p className="mt-1 text-xs text-slate-500">Generated by {receipt.generated_by_name || 'Admin'}</p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="font-semibold text-slate-900">{receipt.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{receipt.phone}</p>
                      </td>
                      <td className="break-words px-5 py-4 align-top text-slate-700">{receipt.purpose}</td>
                      <td className="px-5 py-4 align-top font-bold text-slate-950">Rs {formatAmount(receipt.amount)}</td>
                      <td className="px-5 py-4 align-top">
                        <p className="text-slate-700">{receipt.payment_mode_display}</p>
                        <p className="mt-1 text-xs text-slate-500">{receipt.payment_date}</p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex w-36 flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => openReceipt(receipt, 'view')}
                            disabled={activeReceiptId === receipt.id}
                            className="w-full whitespace-nowrap rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                          >
                            View PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => openReceipt(receipt, 'download')}
                            disabled={activeReceiptId === receipt.id}
                            className="w-full whitespace-nowrap rounded-2xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                          >
                            Download PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-200 lg:hidden">
              {receipts.map((receipt) => (
                <div key={receipt.id} className="p-5">
                  <div className="flex flex-col gap-1">
                    <p className="font-black text-slate-950">{receipt.receipt_number}</p>
                    <p className="text-sm text-slate-500">Generated by {receipt.generated_by_name || 'Admin'}</p>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Name</p><p className="font-bold text-slate-950">{receipt.name}</p><p className="text-xs text-slate-500">{receipt.phone}</p></div>
                    <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Purpose</p><p className="font-bold text-slate-950">{receipt.purpose}</p></div>
                    <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Amount</p><p className="font-bold text-slate-950">Rs {formatAmount(receipt.amount)}</p></div>
                    <div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Payment</p><p className="font-bold text-slate-950">{receipt.payment_mode_display}</p><p className="text-xs text-slate-500">{receipt.payment_date}</p></div>
                  </div>
                  <div className="mt-4 flex w-full flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => openReceipt(receipt, 'view')}
                      disabled={activeReceiptId === receipt.id}
                      className="w-full whitespace-nowrap rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      View PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => openReceipt(receipt, 'download')}
                      disabled={activeReceiptId === receipt.id}
                      className="w-full whitespace-nowrap rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </section>
      </section>
    </div>
  )
}
