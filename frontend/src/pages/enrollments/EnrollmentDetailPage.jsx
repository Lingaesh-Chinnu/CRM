import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
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

function prettyValue(value) {
  return value || 'Not provided'
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900">{prettyValue(value)}</p>
    </div>
  )
}

function ConfirmChangesModal({ changes, saving, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-black tracking-tight text-slate-950">Confirm changes</h3>
        <div className="mt-4 space-y-3">
          {changes.map((change) => (
            <p key={change.field} className="text-sm leading-6 text-slate-700">
              <span className="font-semibold text-slate-950">{change.label}:</span>{' '}
              {change.oldValue || 'Not provided'} <span className="text-slate-400">→</span> {change.newValue || 'Not provided'}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Confirm & Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EnrollmentDetailPage() {
  const { id } = useParams()
  const { user } = useSelector((state) => state.auth)
  const [row, setRow] = useState(null)
  const [branches, setBranches] = useState([])
  const [startDate, setStartDate] = useState('')
  const [batchTiming, setBatchTiming] = useState('')
  const [phone, setPhone] = useState('')
  const [branch, setBranch] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [pendingDetailChanges, setPendingDetailChanges] = useState([])
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    setLoadError('')
    Promise.all([
      api.get(`/enrollments/${id}/`),
      isSuperAdmin ? api.get('/branches/') : Promise.resolve({ data: [] }),
    ])
      .then(([enrollmentRes, branchesRes]) => {
        const data = enrollmentRes.data
        setRow(data)
        setBranches(branchesRes.data.results || branchesRes.data)
        setBranch(data.branch || '')
        setStartDate(data.start_date || '')
        setBatchTiming(data.batch_timing || '')
        setPhone(data.phone || '')
      })
      .catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load enrollment.')))
  }, [id, isSuperAdmin])

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

      if (data.whatsapp_sent) {
        setMessage('Rules & Regulation signing link sent on WhatsApp.')
      } else {
        openWhatsApp(data.phone || updatedEnrollment.phone || row.phone, data.whatsapp_message)
        setMessage(data.whatsapp_error ? `Automatic WhatsApp failed. Opened WhatsApp Web fallback. ${data.whatsapp_error}` : 'Rules & Regulation signing link is ready and opened in WhatsApp Web.')
      }
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to send Rules & Regulation form.')
    } finally {
      setSaving(false)
    }
  }

  const editableFields = [
    ...(isSuperAdmin ? [{ field: 'branch', label: 'Branch', value: row.branch, draft: branch, displayValue: row.branch_name, displayNew: (value) => branches.find((item) => String(item.id) === String(value))?.name || value }] : []),
    { field: 'phone', label: 'Phone Number', value: row.phone, draft: phone },
    { field: 'start_date', label: 'Course Start Date', value: row.start_date, draft: startDate },
    { field: 'batch_timing', label: 'Batch Timing', value: row.batch_timing, draft: batchTiming },
  ]

  const resetDetailsEdit = () => {
    setPhone(row.phone || '')
    setBranch(row.branch || '')
    setStartDate(row.start_date || '')
    setBatchTiming(row.batch_timing || '')
    setPendingDetailChanges([])
    setEditingDetails(false)
  }

  const requestSaveDetails = () => {
    const changes = editableFields
      .filter(({ value, draft }) => String(draft || '') !== String(value || ''))
      .map(({ field, label, value, draft, displayValue, displayNew }) => ({
        field,
        label,
        oldValue: displayValue ?? value ?? '',
        newValue: displayNew ? displayNew(draft || '') : draft || '',
      }))
    if (changes.length === 0) {
      setMessage('No changes to update.')
      return
    }
    setMessage('')
    setPendingDetailChanges(changes)
  }

  const saveDetails = async () => {
    setSaving(true)
    setMessage('')
    try {
      const payload = {}
      pendingDetailChanges.forEach(({ field }) => {
        if (field === 'branch') payload.branch = Number(branch)
        if (field === 'phone') payload.phone = phone
        if (field === 'start_date') payload.start_date = startDate || null
        if (field === 'batch_timing') payload.batch_timing = batchTiming || ''
      })
      const { data } = await api.patch(`/enrollments/${id}/`, payload)
      setRow(data)
      setBranch(data.branch || '')
      setPhone(data.phone || '')
      setStartDate(data.start_date || '')
      setBatchTiming(data.batch_timing || '')
      setPendingDetailChanges([])
      setEditingDetails(false)
      setMessage('Enrollment details updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update enrollment details.')
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
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{row.name}</h1>
          {!editingDetails && (
            <button type="button" onClick={() => { resetDetailsEdit(); setEditingDetails(true); setMessage('') }} className="w-fit rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
              Edit
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {row.student_number || 'Student ID pending'} | {row.course_name || 'No course'} | {statusLabel(row.status)}
        </p>
        <div className="mt-3 text-sm text-slate-600">
          {editingDetails ? (
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone Number" className="w-full max-w-xs rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          ) : (
            <span className="font-semibold text-slate-900">{row.phone || 'Phone not added'}</span>
          )}
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
        <h2 className="text-xl font-black tracking-tight text-slate-950">Student details</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailCard label="Qualification" value={row.qualification_display || row.qualification} />
          <DetailCard label="Degree" value={row.degree} />
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Branch</p>
            {editingDetails && isSuperAdmin ? (
              <select value={branch || ''} onChange={(event) => setBranch(event.target.value)} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Branch</option>
                {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : (
              <p className="mt-2 font-semibold text-slate-900">{prettyValue(row.branch_name)}</p>
            )}
          </div>
          <DetailCard label="Preferred Timing" value={row.preferred_timing_display} />
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
        {editingDetails && (
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={resetDetailsEdit} disabled={saving} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={requestSaveDetails} disabled={saving} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Update'}
            </button>
          </div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Course Start Date</p>
            {editingDetails ? (
              <input
                type="date"
                value={startDate || ''}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              />
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 font-semibold text-slate-900">{prettyValue(row.start_date)}</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Batch Timing</p>
            {editingDetails ? (
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
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 font-semibold text-slate-900">{prettyValue(row.batch_timing)}</p>
            )}
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
      {pendingDetailChanges.length > 0 && (
        <ConfirmChangesModal
          changes={pendingDetailChanges}
          saving={saving}
          onCancel={() => setPendingDetailChanges([])}
          onConfirm={saveDetails}
        />
      )}
    </div>
  )
}
