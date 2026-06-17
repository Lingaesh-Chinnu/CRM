import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import { openProtectedFile } from '../../utils/protectedFiles'
import AdminDeleteButton from '../../components/common/AdminDeleteButton'
import CourseChangeModal, { CourseChangeHistorySection } from '../../components/common/CourseChangeModal'
import ModalCloseButton from '../../components/common/ModalCloseButton'
import CounselorReassignmentPanel from '../../components/common/CounselorReassignmentPanel'
import CandidateTimeline from '../../components/common/CandidateTimeline'

const batchTimingOptions = [
  'Weekdays 10 AM - 12 PM',
  'Weekdays 11 AM - 1 PM',
  'Weekdays 12 PM - 2 PM',
  'Weekdays 3 PM - 5 PM',
  'Weekdays 4 PM - 6 PM',
  'Weekdays 5 PM - 7 PM',
  'Weekend Batch'
]

const SINGLE_INSTALLMENT_MAX_COURSE_FEE = 18900
const LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE = 6900

function addOneMonth(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  const day = date.getDate()
  date.setMonth(date.getMonth() + 1)
  if (date.getDate() !== day) date.setDate(0)
  return date.toISOString().slice(0, 10)
}

function splitAmount(total, parts) {
  const safeTotal = Math.max(Math.round(Number(total || 0)), 0)
  const count = Math.max(Number(parts || 1), 1)
  const base = Math.floor(safeTotal / count)
  const amounts = Array.from({ length: count }, () => base)
  amounts[count - 1] += safeTotal - base * count
  return amounts
}

function splitInstallmentAmount(total, parts) {
  const safeTotal = Math.max(Math.round(Number(total || 0)), 0)
  const maxParts = Math.max(Math.floor((safeTotal - 1) / 5000) + 1, 1)
  const count = Math.min(Math.max(Number(parts || 1), 1), maxParts)
  if (count > 1 && Math.floor(safeTotal / count) < 5000) {
    return [...Array(count - 1).fill(5000), safeTotal - ((count - 1) * 5000)]
  }
  return splitAmount(safeTotal, count)
}

function installmentLabel(index) {
  const known = {
    1: '1st Installment',
    2: '2nd Installment',
    3: '3rd Installment',
  }
  if (known[index]) return known[index]
  const suffix = index % 100 >= 10 && index % 100 <= 20
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[index % 10] || 'th')
  return `${index}${suffix} Installment`
}

function buildSchedule(row, startDate, splitCount = 2) {
  const finalFees = Math.round(Number(row?.net_payable_fee || row?.final_fees || 0))
  const enrollmentDate = row?.enrollment_date || new Date().toISOString().slice(0, 10)
  const courseStartDate = startDate || row?.start_date || addOneMonth(enrollmentDate) || enrollmentDate
  if (finalFees > 0 && finalFees <= LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE) {
    return [{ label: 'Single Payment', amount: finalFees, due_date: enrollmentDate, paid_amount: 0, pending_amount: finalFees, status: 'pending' }]
  }
  if (finalFees < 5000) return []
  let dueDate = courseStartDate
  const rows = [{ label: 'Enrollment', amount: 5000, due_date: enrollmentDate, paid_amount: 0, pending_amount: 5000, status: 'pending' }]
  const defaultInstallmentCount = finalFees <= SINGLE_INSTALLMENT_MAX_COURSE_FEE
    ? 1
    : Math.min(Math.max(Number(splitCount || 2), 1), 12)
  splitInstallmentAmount(finalFees - 5000, defaultInstallmentCount).forEach((amount, index) => {
    if (amount <= 0) return
    rows.push({ label: installmentLabel(index + 1), amount, due_date: dueDate, paid_amount: 0, pending_amount: amount, status: 'pending' })
    dueDate = addOneMonth(dueDate) || dueDate
  })
  return rows
}

function recalculateInstallmentPlan(row, startDate, rows, installmentCount) {
  const finalFees = Math.round(Number(row?.net_payable_fee || row?.final_fees || 0))
  if (finalFees > 0 && finalFees <= LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE) {
    const existingRows = cloneSchedule(rows)
    const dueDate = existingRows[0]?.due_date || row?.enrollment_date || new Date().toISOString().slice(0, 10)
    return [{
      label: 'Single Payment',
      amount: finalFees,
      due_date: dueDate,
      paid_amount: existingRows[0]?.paid_amount || 0,
      pending_amount: finalFees,
      status: existingRows[0]?.status || 'pending',
    }]
  }
  if (finalFees < 5000) return []

  const existingRows = cloneSchedule(rows)
  const enrollmentDate = row?.enrollment_date || new Date().toISOString().slice(0, 10)
  let dueDate = existingRows[1]?.due_date || startDate || row?.start_date || addOneMonth(enrollmentDate) || enrollmentDate
  const count = Math.min(Math.max(Number(installmentCount || existingRows.length - 1 || 1), 1), 12)
  const amounts = splitInstallmentAmount(finalFees - 5000, count)
  const nextRows = [{
    label: 'Enrollment',
    amount: 5000,
    due_date: existingRows[0]?.due_date || enrollmentDate,
    paid_amount: existingRows[0]?.paid_amount || 0,
    pending_amount: 5000,
    status: existingRows[0]?.status || 'pending',
  }]

  amounts.forEach((amount, index) => {
    const existing = existingRows[index + 1] || {}
    nextRows.push({
      label: installmentLabel(index + 1),
      amount,
      due_date: existing.due_date || dueDate,
      paid_amount: existing.paid_amount || 0,
      pending_amount: amount,
      status: existing.status || 'pending',
    })
    dueDate = addOneMonth(existing.due_date || dueDate) || dueDate
  })

  return nextRows
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
    enrolled: 'Active',
    active: 'Active',
    completed: 'Completed',
    dropped: 'Dropped',
    inactive: 'Inactive',
    on_hold: 'Hold',
    transferred: 'Transferred',
  }
  return labels[value] || 'Pending Enrollment'
}

function prettyValue(value) {
  return value || 'Not provided'
}

function formatDate(value) {
  if (!value) return 'Not provided'

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function cloneSchedule(schedule) {
  return (schedule || []).map((item) => ({
    label: item.label || '',
    amount: item.amount ?? '',
    due_date: item.due_date || '',
    paid_amount: item.paid_amount || 0,
    pending_amount: item.pending_amount ?? item.amount ?? 0,
    status: item.status || 'pending',
  }))
}

function scheduleTotal(schedule) {
  return (schedule || []).reduce((total, item) => total + Number(item.amount || 0), 0)
}

function scheduleValidation(schedule, finalFees) {
  const rows = schedule || []
  if (!rows.length) return 'Payment schedule is required.'
  if (finalFees > 0 && finalFees <= LOW_FEE_SINGLE_PAYMENT_MAX_COURSE_FEE) {
    const row = rows[0]
    const amount = Number(row.amount)
    if (rows.length !== 1) return 'Small fee courses must use a single payment schedule.'
    if (!Number.isFinite(amount) || amount <= 0) return 'Each installment amount must be greater than zero.'
    if (amount !== finalFees) return 'Total planned amount must match course fee.'
    if (!row.due_date) return 'Each installment needs a due date.'
    return ''
  }
  if (finalFees < 5000) return 'Course fee must be at least Rs 5,000.'
  for (const [index, item] of rows.entries()) {
    const amount = Number(item.amount)
    if (!Number.isFinite(amount) || amount <= 0) return 'Each installment amount must be greater than zero.'
    if (index === 0 && amount !== 5000) return 'Enrollment Fee must be Rs 5,000.'
    if (index > 0 && index < rows.length - 1 && amount < 5000) return 'Each installment must be Rs 5,000 or above.'
    if (!item.due_date) return 'Each installment needs a due date.'
  }
  const total = Math.round(scheduleTotal(rows) * 100) / 100
  if (total > finalFees) return 'Installment total cannot exceed course fee.'
  if (total !== finalFees) return 'Total planned amount must match course fee.'
  return ''
}

function StatusBadge({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  }
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone] || tones.slate}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  )
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
    <div onClick={saving ? undefined : onCancel} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div onClick={(event) => event.stopPropagation()} className="relative w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
        <ModalCloseButton onClick={onCancel} disabled={saving} label="Close confirm changes modal" />
        <h3 className="pr-10 text-lg font-black tracking-tight text-slate-950">Confirm changes</h3>
        <div className="mt-4 space-y-3">
          {changes.map((change) => (
            <p key={change.field} className="text-sm leading-6 text-slate-700">
              <span className="font-semibold text-slate-950">{change.label}:</span>{' '}
              {change.oldValue || 'Not provided'} <span className="text-slate-400">→</span> {change.newValue || 'Not provided'}
            </p>
          ))}
        </div>
        <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
          <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Confirm & Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EnrollmentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const [row, setRow] = useState(null)
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [counselors, setCounselors] = useState([])
  const [startDate, setStartDate] = useState('')
  const [batchTiming, setBatchTiming] = useState('')
  const [splitCount, setSplitCount] = useState(2)
  const [phone, setPhone] = useState('')
  const [branch, setBranch] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState([])
  const [pendingDetailChanges, setPendingDetailChanges] = useState([])
  const [message, setMessage] = useState('')
  const [rulesErrors, setRulesErrors] = useState({})
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCourseChange, setShowCourseChange] = useState(false)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    let cancelled = false
    setLoadError('')
    const loadEnrollment = async () => {
      try {
        const [enrollmentRes, branchesRes, coursesRes] = await Promise.all([
          api.get(`/enrollments/${id}/`),
          isSuperAdmin ? api.get('/branches/') : Promise.resolve({ data: [] }),
          api.get('/courses/'),
        ])
        if (cancelled) return
        const data = enrollmentRes.data
        const usersRes = await api.get('/walkins/staff-options/', {
          params: data.branch ? { branch: data.branch } : {},
        })
        if (cancelled) return
        setRow(data)
        setBranches(branchesRes.data.results || branchesRes.data)
        setCourses(coursesRes.data.results || coursesRes.data)
        const users = usersRes.data.results || usersRes.data || []
        setCounselors(users)
        setBranch(data.branch || '')
        setStartDate(data.start_date || '')
        setBatchTiming(data.batch_timing || '')
        setPhone(data.phone || '')
        const installmentCount = Math.max((data.installment_schedule || []).length - 1, 2)
        setSplitCount(Math.min(installmentCount, 12))
        setScheduleDraft(cloneSchedule(data.installment_schedule?.length ? data.installment_schedule : buildSchedule(data, data.start_date || '', Math.min(installmentCount, 12))))
      } catch (error) {
        if (!cancelled) setLoadError(apiErrorMessage(error, 'Failed to load enrollment.'))
      }
    }
    loadEnrollment()
    return () => {
      cancelled = true
    }
  }, [id, isSuperAdmin])

  useEffect(() => {
    if (!row || ['enrolled', 'active', 'completed', 'dropped', 'on_hold', 'inactive', 'transferred'].includes(row.status)) return undefined

    let cancelled = false
    const refreshEnrollmentStatus = async () => {
      if (saving || editingDetails || editingSchedule) return
      try {
        const { data } = await api.get(`/enrollments/${id}/`)
        if (cancelled) return
        setRow(data)
        setScheduleDraft(cloneSchedule(data.installment_schedule || []))
      } catch {
        // Keep the current detail visible and retry on the next interval.
      }
    }
    const interval = window.setInterval(refreshEnrollmentStatus, 5000)
    window.addEventListener('focus', refreshEnrollmentStatus)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshEnrollmentStatus)
    }
  }, [id, row?.status, saving, editingDetails, editingSchedule])

  if (!row) {
    return (
      <div className="p-6 text-slate-500">
        {loadError || 'Loading enrollment...'}
      </div>
    )
  }

  const sendRulesForm = async () => {
    const errors = {}
    if (!String(startDate || '').trim()) errors.start_date = 'Course start date is required.'
    if (!String(batchTiming || '').trim()) errors.batch_timing = 'Batch timing is required.'
    if (Object.keys(errors).length > 0) {
      setRulesErrors(errors)
      setMessage('')
      return
    }

    setSaving(true)
    setMessage('')
    setRulesErrors({})
    try {
      let currentEnrollment = row
      if (editingSchedule || !row.payment_schedule?.length) {
        currentEnrollment = await saveSchedule({ silent: true })
      } else {
        const { data } = await api.patch(`/enrollments/${id}/`, {
          start_date: startDate || null,
          batch_timing: batchTiming || '',
        })
        currentEnrollment = data
      }
      const { data } = await api.post(`/enrollments/${id}/send-rules-form/`)
      const nextEnrollment = data.enrollment || {
        ...currentEnrollment,
        payment_schedule_locked: true,
        rules_signing_status: data.status,
        status: data.enrollment_status || currentEnrollment.status,
      }
      setRow(nextEnrollment)
      setScheduleDraft(cloneSchedule(nextEnrollment.installment_schedule || []))
      setEditingSchedule(false)

      if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank', 'noopener,noreferrer')
      }

      if (data.whatsapp_sent || data.whatsapp_url) {
        setMessage(data.detail || 'Rules & Regulation form sent successfully.')
      } else {
        setMessage(data.whatsapp_error || data.detail || 'Failed to send Rules & Regulation form.')
      }
    } catch (error) {
      const data = error.response?.data
      setRulesErrors({
        start_date: data?.start_date || '',
        batch_timing: data?.batch_timing || '',
      })
      setMessage(data?.detail ? `Failed to send Rules & Regulation form. ${data.detail}` : error.message || 'Failed to send Rules & Regulation form.')
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
    setRulesErrors({})
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
      setScheduleDraft(cloneSchedule(data.installment_schedule || []))
      setPendingDetailChanges([])
      setEditingDetails(false)
      setRulesErrors({})
      setMessage('Enrollment updated successfully.')
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
      setScheduleDraft(cloneSchedule(data.installment_schedule || []))
      setMessage('Student enrollment confirmed.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Signed Rules & Regulation form is required before enrollment.')
    } finally {
      setSaving(false)
    }
  }

  const addToPayment = async () => {
    setMessage('')
    if (!row.start_date) {
      setMessage('Course start date is required to create payment schedule.')
      return
    }

    setSaving(true)
    try {
      const { data } = await api.post(`/enrollments/${id}/add-to-payment/`)
      setRow(data.enrollment || row)
      setMessage('Payment record created. Student will appear in Payments page.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to create payment record.'))
    } finally {
      setSaving(false)
    }
  }

  const saveSchedule = async ({ silent = false } = {}) => {
    if (!startDate) {
      const error = new Error('Course start date is required before saving payment schedule.')
      if (!silent) setMessage(error.message)
      throw error
    }
    const rows = cloneSchedule(scheduleDraft.length ? scheduleDraft : buildSchedule(row, startDate, splitCount))
    if (!rows.length) {
      const error = new Error('Payment schedule is required.')
      if (!silent) setMessage(error.message)
      throw error
    }
    const validationError = scheduleValidation(rows, finalFees)
    if (validationError) {
      const error = new Error(validationError)
      if (!silent) setMessage(error.message)
      throw error
    }
    if (!silent) {
      setSaving(true)
      setMessage('')
    }
    try {
      await api.patch(`/enrollments/${id}/`, {
        start_date: startDate || null,
        batch_timing: batchTiming || '',
      })
      const { data } = await api.post(`/enrollments/${id}/payment-schedule/`, {
        payment_schedule: rows.map((item) => ({
          label: item.label,
          amount: item.amount,
          due_date: item.due_date,
        })),
      })
      setRow(data)
      setStartDate(data.start_date || '')
      setBatchTiming(data.batch_timing || '')
      setScheduleDraft(cloneSchedule(data.installment_schedule || []))
      setEditingSchedule(false)
      if (!silent) setMessage('Payment schedule saved.')
      return data
    } catch (error) {
      if (!silent) setMessage(apiErrorMessage(error, 'Failed to save payment schedule.'))
      throw error
    } finally {
      if (!silent) setSaving(false)
    }
  }

  const regenerateSchedule = async () => {
    if (!startDate) {
      setMessage('Course start date is required before regenerating payment schedule.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await api.patch(`/enrollments/${id}/`, {
        start_date: startDate || null,
        batch_timing: batchTiming || '',
      })
      const { data } = await api.post(`/enrollments/${id}/payment-schedule/`, { split_count: splitCount })
      setRow(data)
      setStartDate(data.start_date || '')
      setBatchTiming(data.batch_timing || '')
      setScheduleDraft(cloneSchedule(data.installment_schedule || []))
      setEditingSchedule(false)
      setMessage('Payment schedule regenerated.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to regenerate payment schedule.'))
    } finally {
      setSaving(false)
    }
  }

  const resetEnrollmentWorkflow = async () => {
    if (!isSuperAdmin) return
    const signedWarning = rulesStatus === 'submitted'
      ? ' This enrollment already has a signed form; the old signed link will be invalidated and a new form must be sent.'
      : ''
    const confirmed = window.confirm(`This will unlock the payment schedule, reset the Rules Form to Not Sent, and require a fresh Rules & Regulation form to be sent.${signedWarning} Continue?`)
    if (!confirmed) return
    const reason = window.prompt('Enter reset reason')
    if (!String(reason || '').trim()) {
      setMessage('Reset reason is required.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const { data } = await api.post(`/enrollments/${id}/reset-enrollment-workflow/`, { reason: reason.trim() })
      const nextEnrollment = data.enrollment || data
      setRow(nextEnrollment)
      setStartDate(nextEnrollment.start_date || '')
      setBatchTiming(nextEnrollment.batch_timing || '')
      const nextSplitCount = Math.max((nextEnrollment.installment_schedule || []).length - 1, 2)
      setSplitCount(Math.min(nextSplitCount, 12))
      setScheduleDraft(cloneSchedule(nextEnrollment.installment_schedule?.length ? nextEnrollment.installment_schedule : buildSchedule(nextEnrollment, nextEnrollment.start_date || '', Math.min(nextSplitCount, 12))))
      setEditingSchedule(true)
      setEditingDetails(true)
      setMessage(data.detail || 'Enrollment workflow reset.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to reset enrollment workflow.'))
    } finally {
      setSaving(false)
    }
  }

  const addInstallment = () => {
    if (!startDate) {
      setMessage('Course start date is required before adding an installment.')
      return
    }
    const currentRows = scheduleDraft.length ? scheduleDraft : schedule
    const pendingBalance = finalFees - 5000
    const currentInstallmentCount = Math.max(currentRows.length - 1, 0)
    const nextSplitCount = currentInstallmentCount + 1
    if (pendingBalance <= currentInstallmentCount * 5000) {
      setMessage('Remaining pending amount cannot be split into another valid installment.')
      return
    }
    setSplitCount(nextSplitCount)
    setScheduleDraft(recalculateInstallmentPlan(row, startDate, currentRows, nextSplitCount))
    setEditingSchedule(true)
    setMessage('')
  }

  const submitCourseChange = async (payload) => {
    setSaving(true)
    setMessage('')
    try {
      const endpoint = isSuperAdmin ? `/enrollments/${id}/change-course/` : `/enrollments/${id}/request-course-change/`
      const { data } = await api.post(endpoint, payload)
      if (isSuperAdmin) {
        setRow(data)
        setScheduleDraft(cloneSchedule(data.installment_schedule || []))
      }
      setShowCourseChange(false)
      setMessage(isSuperAdmin ? 'Course changed. Fees and pending installments were recalculated.' : 'Course change request submitted for admin approval.')
    } catch (error) {
      setMessage(apiErrorMessage(error, isSuperAdmin ? 'Failed to change course.' : 'Failed to submit course change request.'))
    } finally {
      setSaving(false)
    }
  }

  const reassignCounselor = async (payload) => {
    setSaving(true)
    setMessage('')
    try {
      await api.post(`/enrollments/${id}/request-counselor-change/`, payload)
      setMessage('Counselor change request submitted for current counselor approval.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to submit counselor change request.'))
      throw error
    } finally {
      setSaving(false)
    }
  }

  const deleteEnrollment = async () => {
    await api.delete(`/enrollments/${id}/`)
    navigate('/enrollments', { replace: true })
  }

  const rulesStatus = row.rules_signing_status || 'pending'
  const isFinalEnrollment = ['enrolled', 'active', 'completed', 'dropped', 'on_hold'].includes(row.status)
  const canAddToPayment = ['enrolled', 'active', 'completed'].includes(row.status) && !row.payment_info
  const finalFees = Math.round(Number(row?.net_payable_fee || row?.final_fees || 0))
  const savedSchedule = row.installment_schedule?.length ? row.installment_schedule : []
  const schedule = editingSchedule
    ? scheduleDraft
    : (savedSchedule.length ? savedSchedule : cloneSchedule(buildSchedule(row, startDate, splitCount)))
  const plannedTotal = Math.round(scheduleTotal(schedule) * 100) / 100
  const remainingPlanned = Math.round((finalFees - plannedTotal) * 100) / 100
  const currentScheduleError = scheduleValidation(schedule, finalFees)
  const hasSavedSchedule = Boolean(row.payment_schedule?.length)
  const rulesSentOrBeyond = ['sent', 'viewed', 'submitted'].includes(rulesStatus)
  const scheduleIsReadOnly = isFinalEnrollment || rulesSentOrBeyond
  const canManageSchedule = !scheduleIsReadOnly
  const canAddInstallment = schedule.length < 13 && canManageSchedule
  const canEnroll = hasSavedSchedule && rulesStatus === 'submitted'
  const scheduleBadge = scheduleIsReadOnly || row.payment_schedule_locked
    ? 'Locked'
    : hasSavedSchedule
      ? 'Saved'
      : 'Draft'
  const rulesBadge = {
    pending: 'Not Sent',
    sent: 'Sent',
    viewed: 'Viewed',
    submitted: 'Signed',
  }[rulesStatus] || statusLabel(rulesStatus)
  const enrollmentBadge = isFinalEnrollment ? 'Enrolled' : canEnroll ? 'Ready to Enroll' : 'Pending'
  const canResetRulesProcess = isSuperAdmin && !isFinalEnrollment && (rulesSentOrBeyond || row.payment_schedule_locked)
  const enrollBlockedReason = isFinalEnrollment
    ? ''
    : !hasSavedSchedule
      ? 'Configure and save the payment schedule.'
      : rulesStatus === 'pending'
        ? 'Send the Rules & Regulation form.'
        : rulesStatus === 'sent' || rulesStatus === 'viewed'
          ? 'Waiting for Rules & Regulation submission.'
          : rulesStatus !== 'submitted'
            ? 'Waiting for Rules & Regulation submission.'
            : ''

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Enrollment</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{row.name}</h1>
          {!editingDetails && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { resetDetailsEdit(); setEditingDetails(true); setMessage('') }} className="w-fit rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                Edit
              </button>
              <button type="button" onClick={() => { setShowCourseChange(true); setMessage('') }} className="w-fit rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800 hover:bg-cyan-100">
                {isSuperAdmin ? 'Change Course' : 'Request Course Change'}
              </button>
              {isSuperAdmin && <AdminDeleteButton label="enrollment" onConfirm={deleteEnrollment} />}
            </div>
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
        {canResetRulesProcess && (
          <button
            type="button"
            onClick={resetEnrollmentWorkflow}
            disabled={saving}
            className="mt-5 w-fit rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
          >
            Reset Enrollment Workflow
          </button>
        )}
      </section>
      <CounselorReassignmentPanel
        enrollment={row}
        counselors={counselors}
        isAdmin
        saving={saving}
        onReassign={reassignCounselor}
      />

      <CandidateTimeline candidate={row} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Spot Discount</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{row.spot_conversion_discount_amount || '0.00'}</p>
        </div>
        <div className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Net Payable</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{row.net_payable_fee || row.final_fees}</p>
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
          <DetailCard label="Walkin Date" value={formatDate(row.walkin_date)} />
          <DetailCard label="Enrollment Date" value={formatDate(row.enrollment_date)} />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Rules & Regulation Form</h2>
            <p className="mt-2 text-sm text-slate-500">
              Configure and save the payment schedule, send the signing link, then enroll after the candidate submits the form.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatusBadge label="Payment Schedule" value={scheduleBadge} tone={scheduleBadge === 'Locked' ? 'amber' : scheduleBadge === 'Saved' ? 'emerald' : 'slate'} />
            <StatusBadge label="Rules Form" value={rulesBadge} tone={rulesStatus === 'submitted' ? 'emerald' : rulesSentOrBeyond ? 'cyan' : 'slate'} />
            <StatusBadge label="Enrollment" value={enrollmentBadge} tone={isFinalEnrollment || canEnroll ? 'emerald' : 'amber'} />
          </div>
        </div>
        {editingDetails && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={resetDetailsEdit} disabled={saving} className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={requestSaveDetails} disabled={saving} className="inline-flex min-w-[130px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Update'}
            </button>
          </div>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Course Start Date <span className="text-rose-600">*</span></p>
            {editingDetails ? (
              <input
                type="date"
                value={startDate || ''}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setRulesErrors((current) => ({ ...current, start_date: '' }))
                }}
                className={`w-full rounded-2xl border bg-slate-50 px-4 py-3 ${rulesErrors.start_date ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100' : 'border-slate-200'}`}
              />
            ) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 font-semibold text-slate-900">{prettyValue(row.start_date)}</p>
            )}
            {rulesErrors.start_date && <p className="mt-2 text-sm font-semibold text-rose-600">{rulesErrors.start_date}</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Batch Timing <span className="text-rose-600">*</span></p>
            {editingDetails ? (
              <select
                value={batchTiming}
                onChange={(e) => {
                  setBatchTiming(e.target.value)
                  setRulesErrors((current) => ({ ...current, batch_timing: '' }))
                }}
                className={`w-full rounded-2xl border bg-slate-50 px-4 py-3 ${rulesErrors.batch_timing ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100' : 'border-slate-200'}`}
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
            {rulesErrors.batch_timing && <p className="mt-2 text-sm font-semibold text-rose-600">{rulesErrors.batch_timing}</p>}
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Payment Schedule</p>
              <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-3">
                <p>Total Course Fee: {formatCurrency(finalFees)}</p>
                <p>Total Planned: {formatCurrency(plannedTotal)}</p>
                <p className={remainingPlanned === 0 ? 'text-emerald-700' : remainingPlanned < 0 ? 'text-rose-700' : 'text-amber-700'}>
                  Remaining: {formatCurrency(remainingPlanned)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {canManageSchedule && !editingSchedule && (
                <button
                  type="button"
                  onClick={() => {
                    setScheduleDraft(cloneSchedule(schedule.length ? schedule : buildSchedule(row, startDate, splitCount)))
                    setEditingSchedule(true)
                    setMessage('')
                  }}
                  disabled={saving}
                  className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Edit Schedule
                </button>
              )}
              {canManageSchedule && (
                <button
                  type="button"
                  onClick={regenerateSchedule}
                  disabled={saving}
                  className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Regenerate Schedule
                </button>
              )}
              {canAddInstallment && (
                <button
                  type="button"
                  onClick={addInstallment}
                  disabled={saving}
                  className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Add Installment
                </button>
              )}
              {canManageSchedule && editingSchedule && (
                <button
                  type="button"
                  onClick={() => saveSchedule()}
                  disabled={saving || Boolean(currentScheduleError)}
                  className="w-fit rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  Save Schedule
                </button>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {schedule.map((item, index) => (
              <div key={item.label} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-950">{item.label}</p>
                {editingSchedule ? (
                  <div className="mt-3 space-y-3">
                    <input
                      type="number"
                      min={index === 0 ? '5000' : '0.01'}
                      step="0.01"
                      value={item.amount}
                      disabled={index === 0}
                      onChange={(event) => {
                        const next = cloneSchedule(scheduleDraft)
                        next[index] = { ...next[index], amount: event.target.value, pending_amount: event.target.value }
                        setScheduleDraft(next)
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                    <input
                      type="date"
                      value={item.due_date || ''}
                      onChange={(event) => {
                        const next = cloneSchedule(scheduleDraft)
                        next[index] = { ...next[index], due_date: event.target.value }
                        setScheduleDraft(next)
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                    />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-xl font-black text-slate-950">{formatCurrency(item.amount)}</p>
                    <p className="mt-1 text-sm text-slate-500">Due: {item.due_date || 'Set course start date'}</p>
                  </>
                )}
                <div className="mt-3 space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <p>Paid: {formatCurrency(item.paid_amount || 0)}</p>
                  <p>Pending: {formatCurrency(item.pending_amount ?? item.amount)}</p>
                  <p>Status: {item.status || 'pending'}</p>
                </div>
              </div>
            ))}
          </div>
          {currentScheduleError && editingSchedule && (
            <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {currentScheduleError}
            </p>
          )}
          <p className="mt-3 text-sm text-slate-500">
            This schedule is auto-filled into the Rules & Regulation PDF and payment tracking.
          </p>
          {scheduleIsReadOnly && (
            <p className="mt-2 text-sm font-semibold text-amber-800">
              Payment schedule is locked after Rules & Regulation sending.
            </p>
          )}
        </div>
        {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            onClick={sendRulesForm}
            disabled={saving || isFinalEnrollment || rulesStatus === 'submitted' || Boolean(currentScheduleError)}
            className="inline-flex min-w-[230px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Sending...' : rulesSentOrBeyond && rulesStatus !== 'submitted' ? 'Resend Rules & Regulation Form' : 'Send Rules & Regulation Form'}
          </button>
          <button
            onClick={enrollStudent}
            disabled={saving || !canEnroll || isFinalEnrollment}
            className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isFinalEnrollment ? 'Student Enrolled' : 'Enroll Student'}
          </button>
          {canAddToPayment && (
            <button
              type="button"
              onClick={addToPayment}
              disabled={saving}
              className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to Payment
            </button>
          )}
          {row.rules_signed_pdf_url && (
            <button
              type="button"
              onClick={() => openProtectedFile(api, row.rules_signed_pdf_url, 'Signed PDF is not available. Please resend and collect the signed form again.', setMessage)}
              className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              View Signed PDF
            </button>
          )}
          {row.rules_selfie_url && (
            <button
              type="button"
              onClick={() => openProtectedFile(api, row.rules_selfie_url, 'Selfie is not available.', setMessage)}
              className="inline-flex min-w-[120px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
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
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {enrollBlockedReason || 'Enrollment is already completed.'}
          </p>
        )}
      </section>
      <CourseChangeHistorySection history={row.course_change_history || []} />
      {row.rules_reset_history?.length > 0 && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Rules Reset History</h2>
          <div className="mt-4 space-y-3">
            {row.rules_reset_history.map((item) => (
              <div key={item.id} className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">
                  {formatDate(item.reset_at)} by {item.reset_by_name || 'Admin'}
                </p>
                <p className="mt-1">{item.reason}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Previous: {item.previous_rules_status || 'pending'} | Schedule {item.previous_schedule_locked ? 'Locked' : 'Unlocked'}{item.previous_signed ? ' | Signed form reset' : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
      {pendingDetailChanges.length > 0 && (
        <ConfirmChangesModal
          changes={pendingDetailChanges}
          saving={saving}
          onCancel={() => setPendingDetailChanges([])}
          onConfirm={saveDetails}
        />
      )}
      {showCourseChange && (
        <CourseChangeModal
          enrollment={row}
          courses={courses}
          saving={saving}
          mode={isSuperAdmin ? 'direct' : 'request'}
          onCancel={() => setShowCourseChange(false)}
          onSubmit={submitCourseChange}
        />
      )}
    </div>
  )
}
