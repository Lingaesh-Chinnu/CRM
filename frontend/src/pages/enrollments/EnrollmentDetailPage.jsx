import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'
import { openWhatsApp } from '../../utils/whatsappTemplates'
import { apiErrorMessage } from '../../utils/apiErrors'
import { openProtectedFile } from '../../utils/protectedFiles'

const batchTimingOptions = [
  'Weekdays 10 AM - 12 PM',
  'Weekdays 11 AM - 1 PM',
  'Weekdays 12 PM - 2 PM',
  'Weekdays 3 PM - 5 PM',
  'Weekdays 4 PM - 6 PM',
  'Weekdays 5 PM - 7 PM',
  'Weekend Batch'
]

function addOneMonth(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  const day = date.getDate()
  date.setMonth(date.getMonth() + 1)
  if (date.getDate() !== day) date.setDate(0)
  return date.toISOString().slice(0, 10)
}

function buildSchedule(row, startDate) {
  const finalFees = Math.floor(Number(row?.final_fees || 0))
  const enrollmentDate = row?.enrollment_date || new Date().toISOString().slice(0, 10)
  const courseStartDate = startDate || row?.start_date || enrollmentDate
  if (finalFees < 5000) {
    return [{ label: '1st Installment', amount: finalFees, due_date: enrollmentDate }]
  }
  const remaining = finalFees - 5000
  const second = Math.floor(remaining / 2)
  const third = remaining - second
  return [
    { label: '1st Installment', amount: 5000, due_date: enrollmentDate },
    { label: '2nd Installment', amount: second, due_date: courseStartDate },
    { label: '3rd Installment', amount: third, due_date: addOneMonth(courseStartDate) },
  ]
}

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function statusLabel(value) {
  const labels = {
    draft: 'Draft',
    pending_rules_form: 'Pending Rules Form',
    rules_form_sent: 'Rules Form Sent',
    rules_form_submitted: 'Rules Form Submitted',
    enrolled: 'Enrolled',
    active: 'Active',
    completed: 'Completed',
    dropped: 'Dropped',
    on_hold: 'On Hold',
  }
  return labels[value] || 'Pending Enrollment'
}

export default function EnrollmentDetailPage() {
  const { id } = useParams()
  const [row, setRow] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [batchTiming, setBatchTiming] = useState('')
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoadError('')
    api.get(`/enrollments/${id}/`)
      .then(({ data }) => {
        setRow(data)
        setStartDate(data.start_date || '')
        setBatchTiming(data.batch_timing || '')
      })
      .catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load enrollment.')))
  }, [id])

  if (!row) {
    return (
      <div className="p-6 text-slate-500">
        {loadError || 'Loading enrollment...'}
      </div>
    )
  }

  const sendRulesForm = async () => {
    setSaving(true)
    setMessage('')
    try {
      const { data: updatedEnrollment } = await api.patch(`/enrollments/${id}/`, {
        start_date: startDate || null,
        batch_timing: batchTiming || '',
      })
      const { data } = await api.post(`/enrollments/${id}/send-rules-form/`)
      setRow({
        ...updatedEnrollment,
        rules_signing_status: data.status,
        status: data.enrollment_status || updatedEnrollment.status,
        rules_signed_pdf_url: updatedEnrollment.rules_signed_pdf_url,
      })

      openWhatsApp(data.phone || updatedEnrollment.phone || row.phone, data.whatsapp_message)
      setMessage('Rules & Regulation signing link is ready and opened in WhatsApp Web.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to send Rules & Regulation form.')
    } finally {
      setSaving(false)
    }
  }

  const enrollStudent = async () => {
    setSaving(true)
    setMessage('')
    try {
      const { data } = await api.post(`/enrollments/${id}/enroll-student/`)
      setRow(data)
      setMessage('Student enrollment confirmed.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Signed Rules & Regulation form is required before enrollment.')
    } finally {
      setSaving(false)
    }
  }

  const rulesStatus = row.rules_signing_status || 'pending'
  const canEnroll = rulesStatus === 'submitted'
  const isFinalEnrollment = ['enrolled', 'active', 'completed', 'dropped', 'on_hold'].includes(row.status)
  const schedule = buildSchedule(row, startDate)

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Enrollment</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{row.name}</h1>
        <p className="mt-3 text-sm text-slate-500">
          {row.student_number || 'Student ID pending'} | {row.course_name || 'No course'} | {statusLabel(row.status)}
        </p>
        <div className="mt-3 text-sm text-slate-600">
          <PhoneNumberEditor recordType="enrollment" recordId={row.id} phone={row.phone} onSaved={(phone) => setRow((current) => ({ ...current, phone }))} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Actual Fees</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{row.actual_fees}</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Discount</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{row.discount_amount}</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Final Fees</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{row.final_fees}</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payment Status</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{row.payment_info?.status || 'unpaid'}</p>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Rules & Regulation Form</h2>
            <p className="mt-2 text-sm text-slate-500">
              Send the signing link after confirming the course start date and batch timing.
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {rulesStatus}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Course Start Date</p>
            <input
              type="date"
              value={startDate || ''}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Batch Timing</p>
            <select
              value={batchTiming}
              onChange={(e) => setBatchTiming(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">Select batch timing</option>
              {batchTiming && !batchTimingOptions.includes(batchTiming) ? (
                <option value={batchTiming}>{batchTiming}</option>
              ) : null}
              {batchTimingOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Payment Schedule</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {schedule.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-950">{item.label}</p>
                <p className="mt-2 text-xl font-black text-slate-950">{formatCurrency(item.amount)}</p>
                <p className="mt-1 text-sm text-slate-500">Due: {item.due_date || 'Set course start date'}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            This schedule is auto-filled into the Rules & Regulation PDF and payment tracking.
          </p>
        </div>
        {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={sendRulesForm}
            disabled={saving}
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Sending...' : 'Send Rules & Regulation Form'}
          </button>
          <button
            onClick={enrollStudent}
            disabled={saving || !canEnroll || isFinalEnrollment}
            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFinalEnrollment ? 'Student Enrolled' : 'Enroll Student'}
          </button>
          {row.rules_signed_pdf_url && (
            <button
              type="button"
              onClick={() => openProtectedFile(api, row.rules_signed_pdf_url, 'Signed PDF is not available. Please resend and collect the signed form again.', setMessage)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              View Signed PDF
            </button>
          )}
          {row.rules_selfie_url && (
            <button
              type="button"
              onClick={() => openProtectedFile(api, row.rules_selfie_url, 'Selfie is not available.', setMessage)}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              View Selfie
            </button>
          )}
          {rulesStatus === 'submitted' && !row.rules_signed_pdf_url && (
            <span className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Signed PDF is not available. Please resend and collect the signed form again.
            </span>
          )}
        </div>
        {!canEnroll && (
          <p className="mt-3 text-sm text-slate-500">
            The Enroll Student button becomes available after the candidate submits the signed form.
          </p>
        )}
      </section>
    </div>
  )
}
