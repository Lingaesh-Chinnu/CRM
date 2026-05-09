import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { openWhatsApp, renderWhatsAppTemplate } from '../../utils/whatsappTemplates'

function statusLabel(status) {
  if (!status) return 'Unknown'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
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

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function PaymentsListPage() {
  const [rows, setRows] = useState([])
  const [templates, setTemplates] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sendingId, setSendingId] = useState(null)
  const [searchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const dueThisWeek = searchParams.get('due_this_week') || ''

  useEffect(() => {
    const params = {}
    if (statusFilter) params.status = statusFilter
    if (dueThisWeek) params.due_this_week = dueThisWeek

    api.get('/payments/', { params }).then(({ data }) => {
      setRows(data.results || data)
      setLoading(false)
    })
  }, [statusFilter, dueThisWeek])

  useEffect(() => {
    api.get('/whatsapp-templates/', { params: { template_type: 'payment_reminder', is_active: true } })
      .then(({ data }) => setTemplates(data.results || data))
      .catch(() => setTemplates([]))
  }, [])

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

  if (loading) return <div className="p-6 text-slate-500">Loading payments...</div>

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Payments</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Student fee payments</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Review every student fee record, track balances, and open payment history from one place.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {message && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-medium text-slate-600">
            {message}
          </div>
        )}
        {statusFilter && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-medium text-slate-600">
            Showing {dueThisWeek ? 'this week due ' : ''}{statusLabel(statusFilter)} payment records.
          </div>
        )}
        {rows.length === 0 ? (
          <div className="p-6 text-slate-500">No payment records available yet.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {rows.map((row) => (
              <div key={row.id} className="px-6 py-5 transition hover:bg-slate-50">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <Link to={`/payments/${row.id}`} className="text-lg font-bold tracking-tight text-slate-950 hover:text-cyan-700">
                      {row.student_name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">
                      {row.student_number} | Total {Number(row.total_fees).toLocaleString()} | Paid {Number(row.paid_amount).toLocaleString()} | Balance {Number(row.balance).toLocaleString()}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Next Payment: {formatDate(row.next_payment_date)} | Phone: {row.student_phone || 'No phone'} | Branch: {row.branch_name || 'No branch'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {Number(row.balance || 0) > 0 && (
                      <>
                        {templates.length > 0 && (
                          <select
                            value={selectedTemplate}
                            onChange={(event) => setSelectedTemplate(event.target.value)}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                          >
                            <option value="">Default message</option>
                            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => sendReminder(row)}
                          disabled={sendingId === row.id}
                          className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          {sendingId === row.id ? 'Sending...' : 'Send Reminder'}
                        </button>
                      </>
                    )}
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {statusLabel(row.status)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
