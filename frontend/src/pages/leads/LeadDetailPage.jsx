import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import FollowUpHistory from '../../components/common/FollowUpHistory'
import StatusHistory from '../../components/common/StatusHistory'
import AdminDeleteButton from '../../components/common/AdminDeleteButton'
import ModalCloseButton from '../../components/common/ModalCloseButton'
import { apiErrorMessage } from '../../utils/apiErrors'
import { FOLLOW_UP_SUCCESS_MESSAGE, resolveReturnTo } from '../../utils/returnNavigation'

const todayIso = () => new Date().toISOString().slice(0, 10)
const SPOT_CONVERSION_DISCOUNT = 2000

function sameDate(first, second) {
  return Boolean(first && second && first === second)
}

const requiredLabels = {
  name: 'Name',
  phone: 'Phone Number',
  dob: 'Date of Birth',
  email: 'Email',
  pincode: 'Pincode',
  location: 'Address',
  source: 'Source',
  course: 'Course Interested',
  branch: 'Branch',
  preferred_timing: 'Preferred Timing',
  qualification: 'Qualification',
  degree: 'Degree',
  year_of_passing: 'Passed Out Year',
  college_company: 'College / Company Name',
  conversion_date: 'Visit Date / Enrollment Date',
  visit_date: 'Visit Date',
  enrollment_date: 'Enrollment Date',
  start_date: 'Course Start Date',
  actual_fees: 'Course Fees',
}

function formatBackendError(error, fallback) {
  const data = error.response?.data
  if (!data) {
    if (error.request) return 'Could not reach the server. Please try again.'
    return fallback
  }
  if (typeof data === 'string') {
    return data.includes('<!doctype html') || data.includes('<html') ? fallback : data
  }
  if (data.detail) {
    const missing = data.missing_fields?.length
      ? ` Missing: ${data.missing_fields.map((field) => requiredLabels[field] || field).join(', ')}.`
      : ''
    return `${data.detail}${missing}`
  }
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([field, value]) => {
        const message = Array.isArray(value) ? value.join(', ') : String(value)
        return `${requiredLabels[field] || field}: ${message}`
      })
      .join(' ')
  }
  return fallback
}

const qualificationOptions = [
  { value: 'school_student', label: 'School Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'working_professional', label: 'Working Professional' },
  { value: 'housewife', label: 'Housewife' },
]

const sourceOptions = [
  { value: 'manual', label: 'Manual' },
  { value: 'google', label: 'Google' },
  { value: 'website', label: 'Website' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'direct_walkin', label: 'Direct Walk-in' },
  { value: 'student_reference', label: 'Student Reference' },
  { value: 'staff_reference', label: 'Staff Reference' },
  { value: 'justdial', label: 'JustDial' },
  { value: 'team_reference', label: 'Team Reference' },
  { value: 'friends_reference', label: 'Friends Reference' },
  { value: 'others', label: 'Others' },
]

const crmStatusOptions = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'continuous_no_answer', label: 'Continuous No Answer' },
  { value: 'na', label: 'NA' },
  { value: 'cna', label: 'CNA' },
  { value: 'will_walk_in', label: 'Will Walk-in' },
  { value: 'walk_in_completed', label: 'Walk-in Completed' },
  { value: 'demo_attended', label: 'Demo Attended' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'ready_to_join', label: 'Ready to Join' },
  { value: 'joined', label: 'Joined' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'lost_to_competitor', label: 'Lost to Competitor' },
]

const competitorStatusOptions = [
  { value: 'not_enquired_elsewhere', label: 'Not Enquired Elsewhere' },
  { value: 'enquired_1', label: 'Enquired at 1 Institute' },
  { value: 'enquired_2_3', label: 'Enquired at 2-3 Institutes' },
  { value: 'enquired_more_3', label: 'Enquired at More Than 3 Institutes' },
  { value: 'fake_enquiry', label: 'Fake Enquiry' },
]

const followUpPriorityOptions = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const conversionProbabilityOptions = [
  { value: '90', label: '90%' },
  { value: '75', label: '75%' },
  { value: '50', label: '50%' },
  { value: '25', label: '25%' },
  { value: '10', label: '10%' },
]

function qualificationSelectOptions(value) {
  if (!value || qualificationOptions.some((option) => option.value === value)) return qualificationOptions
  return [{ value, label: value }, ...qualificationOptions]
}

function sourceLabel(value) {
  return sourceOptions.find((option) => option.value === value)?.label || statusLabel(value)
}

function statusLabel(status) {
  if (!status) return 'New'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildConversionForm(lead) {
  return {
    name: lead?.name || '',
    phone: lead?.phone || '',
    dob: lead?.dob || '',
    email: lead?.email || '',
    pincode: lead?.pincode || '',
    location: lead?.location || '',
    course: lead?.course || '',
    branch: lead?.branch || '',
    preferred_timing: lead?.preferred_timing || '',
    qualification: lead?.qualification || '',
    degree: lead?.degree || '',
    year_of_passing: '',
    college_company: '',
    conversion_date: lead?.walkin_date || todayIso(),
    actual_fees: '',
    discount: '',
    spot_conversion_discount_applied: false,
    start_date: '',
    batch_timing: '',
    demo_class: false,
    interested_global_certification: false,
    status: lead?.status || 'new',
    assigned_to: lead?.assigned_to || lead?.follow_up_by || lead?.assigned_user?.id || '',
    source: lead?.source || 'manual',
    source_description: lead?.source_description || '',
    remarks: lead?.remarks || lead?.latest_remark || '',
    counselor_status: lead?.counselor_status || '',
    competitor_status: lead?.competitor_status || '',
    follow_up_priority: lead?.follow_up_priority || '',
    conversion_probability: lead?.conversion_probability || '',
  }
}

function timingLabel(value) {
  if (value === 'weekday_morning') return 'Weekdays (Morning)'
  if (value === 'weekday_evening') return 'Weekdays (Evening)'
  if (value === 'weekends') return 'Weekends'
  return ''
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function conversionStatusLabel(lead) {
  if (lead?.status_display) return lead.status_display
  if (lead?.converted_to_type === 'walkin') return 'Converted to Walk-in'
  if (lead?.converted_to_type === 'enrollment') return 'Enrolled'
  if (lead?.status === 'walk_in' || lead?.status === 'converted_to_walkin') return 'Converted to Walk-in'
  if (lead?.status === 'enrolled' || lead?.status === 'converted') return 'Enrolled'
  if (lead?.status === 'not_interested') return 'Not Interested'
  if (lead?.source === 'manual' && lead?.status === 'new') return 'Follow-up'
  return statusLabel(lead?.status)
}

function discountAmount(discount, courseFee) {
  if (!discount) return 0
  const fee = Number(courseFee || 0)
  const value = Number(discount.value || 0)
  return Math.min(value, fee)
}

function DetailField({ label, value, editing = false, children }) {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== ''
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      {editing && children ? (
        <div className="mt-3">{children}</div>
      ) : (
        <p className="mt-2 font-semibold text-slate-900">{hasValue ? value : 'Not provided'}</p>
      )}
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

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function ConversionFormModal({ type, lead, courses, branches, canChooseBranch, saving, error, onCancel, onSubmit }) {
  const isEnrollment = type === 'enrollment'
  const label = isEnrollment ? 'Enrollment' : 'Walk-in'
  const showBranchField = canChooseBranch
  const [form, setForm] = useState(() => {
    const initial = buildConversionForm(lead)
    const course = courses.find((row) => String(row.id) === String(initial.course))
    return {
      ...initial,
      actual_fees: course?.actual_fees ?? course?.final_fees ?? '',
    }
  })
  const [availableDiscounts, setAvailableDiscounts] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [pendingCourseChangePayload, setPendingCourseChangePayload] = useState(null)

  const updateField = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'conversion_date' && !sameDate(lead?.walkin_date, value)) {
        next.spot_conversion_discount_applied = false
      }
      return next
    })
    setFieldErrors((current) => ({ ...current, [field]: '' }))
  }

  useEffect(() => {
    if (!isEnrollment || !form.course || !form.branch) {
      setAvailableDiscounts([])
      return
    }
    api.get('/discounts/', { params: { course: form.course, branch: form.branch, available: 1 } })
      .then(({ data }) => setAvailableDiscounts(data.results || data))
      .catch(() => setAvailableDiscounts([]))
  }, [form.course, form.branch, isEnrollment])

  const updateCourse = (courseId) => {
    const course = courses.find((row) => String(row.id) === String(courseId))
    setForm((current) => ({
      ...current,
      course: courseId,
      actual_fees: course?.actual_fees ?? course?.final_fees ?? current.actual_fees,
      discount: '',
    }))
    setFieldErrors((current) => ({ ...current, course: '' }))
  }

  const selectedCourse = courses.find((course) => String(course.id) === String(form.course))
  const courseNameFor = (courseId) => courses.find((course) => String(course.id) === String(courseId))?.name || 'selected course'
  const selectedDiscount = availableDiscounts.find((discount) => String(discount.id) === String(form.discount))
  const courseFee = Number(selectedCourse?.final_fees ?? form.actual_fees ?? 0)
  const discountBaseFee = Number(form.actual_fees || selectedCourse?.actual_fees || selectedCourse?.final_fees || 0)
  const appliedDiscount = discountAmount(selectedDiscount, discountBaseFee)
  const finalFees = selectedDiscount ? Math.max(discountBaseFee - appliedDiscount, 0) : courseFee
  const spotDiscountEnabled = isEnrollment && sameDate(lead?.walkin_date, form.conversion_date)
  const spotDiscountApplied = spotDiscountEnabled && form.spot_conversion_discount_applied
  const spotDiscountAmount = spotDiscountApplied ? SPOT_CONVERSION_DISCOUNT : 0
  const netPayableFees = Math.max(finalFees - spotDiscountAmount, 0)
  const requiredFields = isEnrollment
    ? [
        'name', 'phone', 'course',
        ...(showBranchField ? ['branch'] : []),
        'preferred_timing', 'conversion_date', 'start_date',
      ]
    : ['name', 'phone', 'course', ...(showBranchField ? ['branch'] : []), 'conversion_date']
  const shouldShowField = (field) => {
    if (field === 'branch') return showBranchField && (isEnrollment || !form.branch)
    if (!isEnrollment) return ['preferred_timing', 'conversion_date'].includes(field)
    return ['name', 'phone', 'course', 'branch', 'preferred_timing', 'conversion_date', 'start_date'].includes(field)
  }
  const errorFor = (field) => fieldErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors[field]}</p> : null

  const submit = (event) => {
    event.preventDefault()
    const nextErrors = {}
    requiredFields.forEach((field) => {
      if (!String(form[field] || '').trim()) {
        nextErrors[field] = `${requiredLabels[field] || field} is required.`
      }
    })
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      dob: form.dob,
      email: form.email.trim(),
      pincode: form.pincode.trim(),
      location: form.location.trim(),
      course: form.course ? Number(form.course) : '',
      preferred_timing: form.preferred_timing,
      demo_class: Boolean(form.demo_class),
      interested_global_certification: Boolean(form.interested_global_certification),
    }
    if (showBranchField) {
      payload.branch = form.branch ? Number(form.branch) : ''
    }

    if (isEnrollment) {
      payload.enrollment_date = form.conversion_date
      payload.actual_fees = selectedDiscount ? discountBaseFee : courseFee
      payload.discount = form.discount || null
      payload.spot_conversion_discount_applied = spotDiscountApplied
      payload.start_date = form.start_date || null
      payload.batch_timing = form.batch_timing || ''
      payload.qualification = form.qualification.trim()
      payload.degree = form.degree.trim()
    } else {
      payload.visit_date = form.conversion_date
      payload.qualification = form.qualification
      payload.degree = form.degree.trim()
      payload.year_of_passing = form.year_of_passing
      payload.college_company = form.college_company.trim()
      payload.remarks = form.remarks.trim()
    }

    if (isEnrollment && lead?.course && String(lead.course) !== String(payload.course)) {
      setPendingCourseChangePayload(payload)
      return
    }

    onSubmit(payload)
  }

  return (
    <div onClick={saving ? undefined : onCancel} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <form onClick={(event) => event.stopPropagation()} onSubmit={submit} className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.65)]">
        <ModalCloseButton onClick={onCancel} disabled={saving} label="Close lead conversion modal" />
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <p className="pr-10 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Convert Lead</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Convert to {label}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {isEnrollment ? 'Fill the enrollment details.' : 'Lead details are copied automatically. Update only the visit details if needed.'}
          </p>
        </div>
        <div className="overflow-y-auto px-5 pb-5 sm:px-6">
        {pendingCourseChangePayload && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold leading-6 text-amber-950">
              Candidate originally enquired for {lead.course_name || courseNameFor(lead.course)}, but now enrolling for {courseNameFor(pendingCourseChangePayload.course)}. Do you want to continue?
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onSubmit(pendingCourseChangePayload)}
                disabled={saving}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Confirm & Continue
              </button>
              <button
                type="button"
                onClick={() => setPendingCourseChangePayload(null)}
                disabled={saving}
                className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-100 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!isEnrollment && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Copied from lead</p>
            <div className="mt-3 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <p><span className="font-semibold text-slate-950">Name:</span> {form.name || 'Not provided'}</p>
              <p><span className="font-semibold text-slate-950">Phone:</span> {form.phone || 'Not provided'}</p>
              <p><span className="font-semibold text-slate-950">Email:</span> {form.email || 'Not provided'}</p>
              <p><span className="font-semibold text-slate-950">Qualification:</span> {qualificationSelectOptions(form.qualification).find((option) => option.value === form.qualification)?.label || form.qualification || 'Not provided'}</p>
              <p><span className="font-semibold text-slate-950">Course:</span> {selectedCourse?.name || lead?.course_name || 'Not provided'}</p>
              <p><span className="font-semibold text-slate-950">Location:</span> {form.location || 'Not provided'}</p>
              <p><span className="font-semibold text-slate-950">Source:</span> {sourceLabel(form.source)}</p>
              <p><span className="font-semibold text-slate-950">Existing Remarks:</span> {form.remarks || 'Not provided'}</p>
            </div>
          </div>
        )}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {isEnrollment && (
            <>
              <div>
                <FormField label="Full Name">
                  <input value={form.name} onChange={(event) => updateField('name', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                </FormField>
                {errorFor('name')}
              </div>
              <div>
                <FormField label="Phone Number">
                  <input value={form.phone} onChange={(event) => updateField('phone', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                </FormField>
                {errorFor('phone')}
              </div>
            </>
          )}
          {shouldShowField('dob') && (
            <div>
              <FormField label="Date of Birth">
                <input type="date" value={form.dob} onChange={(event) => updateField('dob', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
              </FormField>
              {errorFor('dob')}
            </div>
          )}
          {shouldShowField('email') && (
            <div>
              <FormField label="Email">
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
              </FormField>
              {errorFor('email')}
            </div>
          )}
          {shouldShowField('pincode') && (
            <div>
              <FormField label="Pincode">
                <input value={form.pincode} onChange={(event) => updateField('pincode', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
              </FormField>
              {errorFor('pincode')}
            </div>
          )}
          <div>
            <FormField label="Course Interested">
              <select value={form.course} onChange={(event) => updateCourse(event.target.value)} disabled={!isEnrollment} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100">
                <option value="">Select course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </FormField>
            {errorFor('course')}
          </div>
          {shouldShowField('branch') && (
            <div>
              <FormField label="Branch">
                <select value={form.branch} onChange={(event) => { updateField('branch', event.target.value); setForm((current) => ({ ...current, branch: event.target.value, discount: '' })) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <option value="">Select branch</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </FormField>
              {errorFor('branch')}
            </div>
          )}
          <div>
            <FormField label="Preferred Timing">
              <select value={form.preferred_timing} onChange={(event) => updateField('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <option value="">Select timing</option>
                <option value="weekday_morning">Weekdays (Morning)</option>
                <option value="weekday_evening">Weekdays (Evening)</option>
                <option value="weekends">Weekends</option>
              </select>
            </FormField>
            {errorFor('preferred_timing')}
          </div>
          {shouldShowField('location') && (
            <div className="md:col-span-2">
              <FormField label="Address">
                <textarea value={form.location} onChange={(event) => updateField('location', event.target.value)} className="min-h-[92px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
              </FormField>
              {errorFor('location')}
            </div>
          )}
          {!isEnrollment && (
            <>
              <div className="md:col-span-2">
                <FormField label="Walk-in Remarks">
                  <textarea value={form.remarks} onChange={(event) => updateField('remarks', event.target.value)} className="min-h-[92px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                </FormField>
              </div>
            </>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {isEnrollment ? 'Enrollment Date' : 'Visit Date'}
            </span>
            <input type="date" value={form.conversion_date} onChange={(event) => updateField('conversion_date', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
            {errorFor('conversion_date')}
          </label>
          {!isEnrollment && (
            <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 md:col-span-1">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.demo_class} onChange={(event) => updateField('demo_class', event.target.checked)} className="h-4 w-4 accent-slate-950" />
                Demo class required
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.interested_global_certification} onChange={(event) => updateField('interested_global_certification', event.target.checked)} className="h-4 w-4 accent-slate-950" />
                Interested in global certification
              </label>
            </div>
          )}
          {isEnrollment && (
            <>
              <FormField label="Qualification">
                <select value={form.qualification} onChange={(event) => updateField('qualification', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <option value="">Select qualification</option>
                  {qualificationSelectOptions(form.qualification).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormField>
              <FormField label="Degree">
                <input value={form.degree} onChange={(event) => updateField('degree', event.target.value)} placeholder="Example: BCA, B.Com, BE CSE, MBA" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
              </FormField>
              <div className="md:col-span-2">
                <FormField label="Available Discount">
                  <select value={form.discount || ''} onChange={(event) => updateField('discount', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <option value="">No discount</option>
                    {availableDiscounts.map((discount) => (
                      <option key={discount.id} value={discount.id}>
                        {discount.name} - Rs {formatMoney(discount.value)}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 md:col-span-2">
                <div className="grid gap-2 text-sm text-emerald-950">
                  <p className="font-semibold">Actual Fees: Rs {formatMoney(discountBaseFee || courseFee)}</p>
                  <p className="font-semibold">Course Discount: Rs {formatMoney(appliedDiscount)}</p>
                  <p className="font-black">Final Fees: Rs {formatMoney(finalFees)}</p>
                  <p className="font-semibold">Spot Conversion Discount: Rs {formatMoney(spotDiscountAmount)}</p>
                  <p className="text-xl font-black tracking-tight">Net Payable Fees: Rs {formatMoney(netPayableFees)}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={spotDiscountApplied}
                    disabled={!spotDiscountEnabled}
                    onChange={(event) => updateField('spot_conversion_discount_applied', event.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-none accent-slate-950 disabled:opacity-50"
                  />
                  <span>Apply Spot Conversion Discount</span>
                </label>
                {!spotDiscountEnabled && (
                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    Spot conversion discount is available only when visit date and enrollment date are the same.
                  </p>
                )}
                {spotDiscountEnabled && (
                  <p className="mt-2 text-xs font-medium leading-5 text-emerald-700">
                    Same-day walk-in enrollment is eligible for Rs {formatMoney(SPOT_CONVERSION_DISCOUNT)} off net payable fees.
                  </p>
                )}
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Course Start Date
                </span>
                <input type="date" value={form.start_date} onChange={(event) => updateField('start_date', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                {errorFor('start_date')}
              </label>
            </>
          )}
        </div>
        {error && (
          <p className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
        </div>
        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : `Create ${label}`}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useSelector((state) => state.auth)
  const [lead, setLead] = useState(null)
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [transferTo, setTransferTo] = useState('')
  const [conversionType, setConversionType] = useState('')
  const [converting, setConverting] = useState(false)
  const [conversionError, setConversionError] = useState('')
  const [detailsForm, setDetailsForm] = useState({})
  const [detailErrors, setDetailErrors] = useState({})
  const [editingDetails, setEditingDetails] = useState(false)
  const [pendingDetailChanges, setPendingDetailChanges] = useState([])
  const [savingDetails, setSavingDetails] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    setLoadError('')
    Promise.all([api.get(`/leads/${id}/`), api.get('/courses/'), api.get('/branches/')]).then(([leadRes, coursesRes, branchesRes]) => {
      const data = leadRes.data
      setLead(data)
      setCourses(coursesRes.data.results || coursesRes.data)
      setBranches(branchesRes.data.results || branchesRes.data)
      setDetailsForm(buildConversionForm(data))
    }).catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load lead.')))
  }, [id])

  useEffect(() => {
    api.get('/leads/transfer-options/')
      .then(({ data }) => setStaffUsers(data || []))
      .catch(() => setStaffUsers([]))
  }, [])

  if (!lead) return <div className="p-6 text-slate-500">{loadError || 'Loading lead...'}</div>

  const handleConverted = (data, type) => {
    setMessage(type === 'enrollment' ? 'Lead converted to enrollment successfully.' : 'Lead converted to walk-in successfully.')
    setLead((prev) => ({
      ...prev,
      name: data.name || prev.name,
      phone: data.phone || prev.phone,
      location: data.location || prev.location,
      branch: data.branch || prev.branch,
      branch_name: data.branch_name || prev.branch_name,
      course: data.course || prev.course,
      course_name: data.course_name || prev.course_name,
      status: type === 'enrollment' ? 'converted' : 'converted_to_walkin',
      converted_to_type: type,
      converted_record_id: data.id,
      converted_at: new Date().toISOString(),
    }))
    setConversionType('')
  }

  const directConvertToWalkIn = async () => {
    if (converting) return
    setConverting(true)
    setConversionError('')
    setMessage('')
    try {
      const { data } = await api.post(`/leads/${lead.id}/convert-to-walkin/`, {})
      handleConverted(data, 'walkin')
    } catch (err) {
      setConversionError(formatBackendError(err, 'Conversion failed. Please check the details and try again.'))
      setConversionType('walkin')
    } finally {
      setConverting(false)
    }
  }

  const startConversion = (type) => {
    setConversionType(type)
    setConversionError('')
  }

  const closeConversionModal = () => {
    if (converting) return
    setConversionType('')
    setConversionError('')
  }

  const confirmConversion = async (payload) => {
    if (!conversionType) return

    setConverting(true)
    setConversionError('')
    try {
      const endpoint = conversionType === 'enrollment' ? 'convert-to-enrollment' : 'convert-to-walkin'
      const { data } = await api.post(`/leads/${lead.id}/${endpoint}/`, payload)
      handleConverted(data, conversionType)
    } catch (err) {
      setConversionError(formatBackendError(err, 'Conversion failed. Please check the details and try again.'))
    } finally {
      setConverting(false)
    }
  }

  const saveFollowUp = async (payload) => {
    const { data } = await api.post(`/leads/${id}/follow-ups/`, payload)
    setLead((prev) => ({
      ...prev,
      next_follow_up_date: data.next_follow_up_date,
      follow_ups: [data, ...(prev.follow_ups || [])],
    }))
    navigate(resolveReturnTo(location, '/leads'), {
      replace: true,
      state: { message: FOLLOW_UP_SUCCESS_MESSAGE, listFilters: location.state?.listFilters },
    })
  }

  const transferLead = async () => {
    if (!transferTo) {
      setMessage('Select a counselor to transfer this lead.')
      return
    }
    setSavingDetails(true)
    setMessage('')
    try {
      const { data } = await api.post(`/leads/${lead.id}/transfer/`, { transfer_to: transferTo })
      setLead(data)
      setDetailsForm(buildConversionForm(data))
      setTransferTo('')
      setMessage(data.detail || 'Lead transferred successfully.')
    } catch (error) {
      const data = error.response?.data
      setMessage(data?.error || data?.message || apiErrorMessage(error, 'Failed to transfer lead.'))
    } finally {
      setSavingDetails(false)
    }
  }

  const updateDetail = (field, value) => {
    setDetailsForm((current) => ({ ...current, [field]: value }))
    setDetailErrors((current) => ({ ...current, [field]: '' }))
  }

  const convertedType = lead.converted_to_type || (lead.status === 'walk_in' ? 'walkin' : lead.status === 'converted' ? 'enrollment' : '')
  const canEditLeadCourse = !convertedType && !['enrolled', 'converted_to_walkin'].includes(lead.status)

  const detailFields = [
    { field: 'name', label: 'Name', value: lead.name },
    { field: 'phone', label: 'Phone Number', value: lead.phone },
    { field: 'dob', label: 'Date of Birth', value: lead.dob },
    { field: 'email', label: 'Email', value: lead.email },
    { field: 'pincode', label: 'Pincode', value: lead.pincode },
    { field: 'location', label: 'Address', value: lead.location },
    { field: 'source', label: 'Source', value: lead.source, displayValue: lead.source_display || sourceLabel(lead.source), displayNew: sourceLabel },
    { field: 'conversion_date', payloadField: 'walkin_date', label: 'Visit Date', value: lead.walkin_date },
    ...(isSuperAdmin ? [{ field: 'branch', label: 'Branch', value: lead.branch, displayValue: lead.branch_name, displayNew: (value) => branches.find((branch) => String(branch.id) === String(value))?.name || value }] : []),
    ...(canEditLeadCourse ? [{ field: 'course', label: 'Course Interested', value: lead.course, displayValue: lead.course_name, displayNew: (value) => courses.find((course) => String(course.id) === String(value))?.name || value }] : []),
    { field: 'preferred_timing', label: 'Preferred Timing', value: lead.preferred_timing, displayValue: timingLabel(lead.preferred_timing), displayNew: timingLabel },
    { field: 'qualification', label: 'Qualification', value: lead.qualification, displayValue: lead.qualification_display || lead.qualification, displayNew: (value) => qualificationSelectOptions(value).find((option) => option.value === value)?.label || value },
    { field: 'degree', label: 'Degree', value: lead.degree },
    { field: 'source_description', label: 'Source Description', value: lead.source_description },
    { field: 'counselor_status', label: 'Status', value: lead.counselor_status, displayValue: crmStatusOptions.find((option) => option.value === lead.counselor_status)?.label || '', displayNew: (value) => crmStatusOptions.find((option) => option.value === value)?.label || value },
    { field: 'competitor_status', label: 'Competitor Status', value: lead.competitor_status, displayValue: competitorStatusOptions.find((option) => option.value === lead.competitor_status)?.label || '', displayNew: (value) => competitorStatusOptions.find((option) => option.value === value)?.label || value },
    { field: 'follow_up_priority', label: 'Follow-up Priority', value: lead.follow_up_priority, displayValue: followUpPriorityOptions.find((option) => option.value === lead.follow_up_priority)?.label || '', displayNew: (value) => followUpPriorityOptions.find((option) => option.value === value)?.label || value },
    { field: 'conversion_probability', label: 'Conversion Probability', value: lead.conversion_probability, displayValue: conversionProbabilityOptions.find((option) => option.value === lead.conversion_probability)?.label || '', displayNew: (value) => conversionProbabilityOptions.find((option) => option.value === value)?.label || value },
    { field: 'remarks', label: 'Remarks', value: lead.remarks || lead.latest_remark || '' },
  ]

  const detailChanges = () => detailFields
    .filter(({ field, value }) => String(detailsForm[field] || '') !== String(value || ''))
    .map((config) => ({
      ...config,
      oldValue: config.displayValue ?? config.value ?? '',
      newValue: config.displayNew ? config.displayNew(detailsForm[config.field] || '') : detailsForm[config.field] || '',
    }))

  const resetDetailsEdit = () => {
    setDetailsForm(buildConversionForm(lead))
    setDetailErrors({})
    setEditingDetails(false)
    setPendingDetailChanges([])
  }

  const requestSaveCandidateDetails = () => {
    const changes = detailChanges()
    if (changes.length === 0) {
      setMessage('No changes to update.')
      return
    }
    const optionalFields = new Set(['source_description'])
    const missing = changes.filter(({ field }) => !optionalFields.has(field) && !String(detailsForm[field] || '').trim())
    if (missing.length > 0) {
      setDetailErrors((current) => ({
        ...current,
        ...Object.fromEntries(missing.map(({ field, label }) => [field, `${label || requiredLabels[field] || field} is required.`])),
      }))
      setMessage(`Please fill: ${missing.map(({ label, field }) => label || requiredLabels[field]).join(', ')}.`)
      return
    }
    setMessage('')
    setPendingDetailChanges(changes)
  }

  const saveCandidateDetails = async () => {
    setSavingDetails(true)
    setMessage('')
    setDetailErrors({})
    try {
      const payload = {}
      pendingDetailChanges.forEach(({ field, payloadField }) => {
        if (field === 'course' || field === 'branch' || field === 'assigned_to') payload[payloadField || field] = detailsForm[field] ? Number(detailsForm[field]) : null
        else payload[payloadField || field] = detailsForm[field]
      })
      const { data } = await api.patch(`/leads/${id}/`, payload)
      setLead(data)
      setDetailsForm(buildConversionForm(data))
      setMessage('Candidate details updated.')
      setEditingDetails(false)
      setPendingDetailChanges([])
    } catch (error) {
      setMessage(error.response?.data?.detail || error.response?.data?.error || 'Failed to update candidate details.')
    } finally {
      setSavingDetails(false)
    }
  }

  const deleteLead = async () => {
    await api.delete(`/leads/${id}/`)
    navigate('/leads', { replace: true })
  }

  const detailErrorFor = (field) => detailErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{detailErrors[field]}</p> : null
  const convertedLabel = convertedType === 'walkin' ? 'Converted to Walk-in' : convertedType === 'enrollment' ? 'Enrolled' : ''
  const convertedLink = convertedType === 'walkin'
    ? `/walkins/${lead.converted_record_id}`
    : convertedType === 'enrollment'
      ? `/enrollments/${lead.converted_record_id}`
      : ''

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Lead</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{lead.name}</h1>
          {!editingDetails && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setDetailsForm(buildConversionForm(lead)); setEditingDetails(true); setMessage('') }} className="w-fit rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                Edit
              </button>
              {isSuperAdmin && <AdminDeleteButton label="lead" onConfirm={deleteLead} />}
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {lead.lead_number} • {lead.phone} • {lead.course_name || 'No course'} • {conversionStatusLabel(lead)}
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ownership</p>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">{lead.assigned_to_name || lead.assigned_user?.name || 'Unassigned'}</h2>
              <p className="mt-2 text-sm text-slate-500">Created by {lead.created_by_name || 'Not recorded'}</p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <select
                value={transferTo}
                onChange={(event) => setTransferTo(event.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
              >
                <option value="">Transfer to counselor</option>
                {staffUsers.map((staff) => (
                  <option key={staff.id} value={staff.id} disabled={String(staff.id) === String(lead.assigned_to || lead.follow_up_by || '')}>
                    {staff.name}{staff.branch_name ? ` - ${staff.branch_name}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={transferLead}
                disabled={savingDetails || !transferTo}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                Transfer
              </button>
            </div>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Transfer Timeline</p>
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-bold text-slate-950">Created by {lead.created_by_name || 'Not recorded'}</span>
                <span className="ml-2 text-slate-500">{formatDateTime(lead.created_at)}</span>
              </div>
              {(lead.transfer_history || []).length === 0 ? (
                <p className="text-sm font-medium text-slate-500">No transfers recorded.</p>
              ) : lead.transfer_history.map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-bold text-slate-950">
                    {item.from_user_name || 'Unassigned'} to {item.to_user_name || 'Unassigned'}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {formatDateTime(item.created_at)} by {item.transferred_by_name || 'Unknown'}
                    {item.from_branch_name || item.to_branch_name ? ` | ${item.from_branch_name || 'No branch'} to ${item.to_branch_name || 'No branch'}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Lead details</h2>
            {editingDetails && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={resetDetailsEdit} disabled={savingDetails} className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
                  Cancel
                </button>
                <button type="button" onClick={requestSaveCandidateDetails} disabled={savingDetails} className="inline-flex min-w-[130px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                  {savingDetails ? 'Saving...' : 'Save Update'}
                </button>
              </div>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailField label="Lead Status" value={conversionStatusLabel(lead)} />
            <DetailField label="Status" value={crmStatusOptions.find((option) => option.value === lead.counselor_status)?.label || 'Not provided'} editing={editingDetails}>
              <select value={detailsForm.counselor_status || ''} onChange={(event) => updateDetail('counselor_status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Status</option>
                {crmStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Competitor Status" value={competitorStatusOptions.find((option) => option.value === lead.competitor_status)?.label || 'Not provided'} editing={editingDetails}>
              <select value={detailsForm.competitor_status || ''} onChange={(event) => updateDetail('competitor_status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Competitor Status</option>
                {competitorStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Follow-up Priority" value={followUpPriorityOptions.find((option) => option.value === lead.follow_up_priority)?.label || 'Not provided'} editing={editingDetails}>
              <select value={detailsForm.follow_up_priority || ''} onChange={(event) => updateDetail('follow_up_priority', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Priority</option>
                {followUpPriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Conversion Probability" value={conversionProbabilityOptions.find((option) => option.value === lead.conversion_probability)?.label || 'Not provided'} editing={editingDetails}>
              <select value={detailsForm.conversion_probability || ''} onChange={(event) => updateDetail('conversion_probability', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Probability</option>
                {conversionProbabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Remarks" value={lead.remarks || lead.latest_remark} editing={editingDetails}>
              <textarea value={detailsForm.remarks || ''} onChange={(event) => updateDetail('remarks', event.target.value)} className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            </DetailField>
            <DetailField label="Name" value={lead.name} editing={editingDetails}>
              <input value={detailsForm.name || ''} onChange={(event) => updateDetail('name', event.target.value)} placeholder="Enter Name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('name')}
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone Number</p>
              {editingDetails ? (
                <div className="mt-3">
                  <input value={detailsForm.phone || ''} onChange={(event) => updateDetail('phone', event.target.value)} placeholder="Enter Phone Number" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                  {detailErrorFor('phone')}
                </div>
              ) : (
                <p className="mt-2 font-semibold text-slate-900">{lead.phone || 'Not provided'}</p>
              )}
            </div>
            <DetailField label="Date of Birth" value={lead.dob} editing={editingDetails}>
              <input type="date" value={detailsForm.dob || ''} onChange={(event) => updateDetail('dob', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('dob')}
            </DetailField>
            <DetailField label="Email" value={lead.email} editing={editingDetails}>
              <input type="email" value={detailsForm.email || ''} onChange={(event) => updateDetail('email', event.target.value)} placeholder="Enter Email" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('email')}
            </DetailField>
            <DetailField label="Pincode" value={lead.pincode} editing={editingDetails}>
              <input value={detailsForm.pincode || ''} onChange={(event) => updateDetail('pincode', event.target.value)} placeholder="Enter Pincode" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('pincode')}
            </DetailField>
            <DetailField label="Address" value={lead.location} editing={editingDetails}>
              <textarea value={detailsForm.location || ''} onChange={(event) => updateDetail('location', event.target.value)} placeholder="Enter Address" className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('location')}
            </DetailField>
            <DetailField label="Source" value={lead.source_display || sourceLabel(lead.source)} editing={editingDetails}>
              <select value={detailsForm.source || 'manual'} onChange={(event) => updateDetail('source', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {detailErrorFor('source')}
            </DetailField>
            <DetailField label="Source Description" value={lead.source_description} editing={editingDetails}>
              <textarea value={detailsForm.source_description || ''} onChange={(event) => updateDetail('source_description', event.target.value)} placeholder="Example: Saw Instagram AI placement reel" className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            </DetailField>
            <DetailField label="Visit Date" value={lead.walkin_date} editing={editingDetails}>
              <input type="date" value={detailsForm.conversion_date || ''} onChange={(event) => updateDetail('conversion_date', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('conversion_date')}
            </DetailField>
            <DetailField label="Branch" value={lead.branch_name} editing={editingDetails && isSuperAdmin}>
              <select value={detailsForm.branch || ''} onChange={(event) => updateDetail('branch', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              {detailErrorFor('branch')}
            </DetailField>
            <DetailField label="Course Interested" value={lead.course_name} editing={editingDetails && canEditLeadCourse}>
              <select value={detailsForm.course || ''} onChange={(event) => updateDetail('course', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
              {detailErrorFor('course')}
            </DetailField>
            <DetailField label="Preferred Timing" value={timingLabel(lead.preferred_timing)} editing={editingDetails}>
              <select value={detailsForm.preferred_timing || ''} onChange={(event) => updateDetail('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Preferred Timing</option>
                <option value="weekday_morning">Weekdays (Morning)</option>
                <option value="weekday_evening">Weekdays (Evening)</option>
                <option value="weekends">Weekends</option>
              </select>
              {detailErrorFor('preferred_timing')}
            </DetailField>
            <DetailField label="Qualification" value={lead.qualification_display || lead.qualification} editing={editingDetails}>
              <select value={detailsForm.qualification || ''} onChange={(event) => updateDetail('qualification', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Qualification</option>
                {qualificationSelectOptions(detailsForm.qualification || '').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {detailErrorFor('qualification')}
            </DetailField>
            <DetailField label="Degree" value={lead.degree} editing={editingDetails}>
              <input value={detailsForm.degree || ''} onChange={(event) => updateDetail('degree', event.target.value)} placeholder="Example: BCA, B.Com, BE CSE, MBA" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            </DetailField>
          </div>
          <FollowUpHistory
            followUps={lead.follow_ups || []}
            onSave={saveFollowUp}
          />
          <StatusHistory rows={lead.status_history || []} />
        </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Next action</h2>
          {convertedType ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                {convertedLabel}
              </span>
              <p className="mt-3 text-sm font-semibold text-emerald-950">
                {lead.converted_at
                  ? `${convertedType === 'enrollment' ? 'Enrolled' : 'Converted'} on ${formatDateTime(lead.converted_at)}`
                  : `${convertedType === 'enrollment' ? 'Enrollment' : 'Converted'} record available.`}
              </p>
              {convertedLink && lead.converted_record_id && (
                <Link to={convertedLink} className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                  View {convertedType === 'walkin' ? 'Walk-in' : 'Enrollment'}
                </Link>
              )}
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Complete any missing candidate details before conversion.
              </p>
              <div className="mt-6 grid gap-3">
                <button onClick={directConvertToWalkIn} disabled={converting} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                  {converting ? 'Converting...' : 'Convert to Walk-in'}
                </button>
                <button onClick={() => startConversion('walkin')} disabled={converting} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
                  Update Visit Details
                </button>
                <button onClick={() => startConversion('enrollment')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                  Convert to Enrollment
                </button>
              </div>
            </>
          )}
          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
          <Link to="/leads" className="mt-3 block text-center text-sm font-medium text-slate-500 hover:text-slate-900">
            Back to leads
          </Link>
        </div>
      </section>
      {conversionType && (
        <ConversionFormModal
          type={conversionType}
          lead={lead}
          courses={courses}
          branches={branches}
          canChooseBranch={isSuperAdmin}
          saving={converting}
          error={conversionError}
          onCancel={closeConversionModal}
          onSubmit={confirmConversion}
        />
      )}
      {pendingDetailChanges.length > 0 && (
        <ConfirmChangesModal
          changes={pendingDetailChanges}
          saving={savingDetails}
          onCancel={() => setPendingDetailChanges([])}
          onConfirm={saveCandidateDetails}
        />
      )}
    </div>
  )
}
