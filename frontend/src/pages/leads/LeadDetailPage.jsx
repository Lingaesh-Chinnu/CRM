import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import FollowUpHistory from '../../components/common/FollowUpHistory'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'
import { apiErrorMessage } from '../../utils/apiErrors'

const todayIso = () => new Date().toISOString().slice(0, 10)

const requiredLabels = {
  name: 'Name',
  phone: 'Phone Number',
  dob: 'Date of Birth',
  email: 'Email',
  pincode: 'Pincode',
  location: 'Address',
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

const qualificationOptions = [
  { value: 'school_student', label: 'School Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'working_professional', label: 'Working Professional' },
  { value: 'housewife', label: 'Housewife' },
]

function qualificationSelectOptions(value) {
  if (!value || qualificationOptions.some((option) => option.value === value)) return qualificationOptions
  return [{ value, label: value }, ...qualificationOptions]
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
    start_date: '',
    batch_timing: '',
    demo_class: false,
    interested_global_certification: false,
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
  if (lead?.converted_to_type === 'walkin') return 'Converted to Walk-in'
  if (lead?.converted_to_type === 'enrollment') return 'Converted to Enrollment'
  if (lead?.status === 'walk_in') return 'Converted to Walk-in'
  if (lead?.status === 'enrolled' || lead?.status === 'converted') return 'Converted to Enrollment'
  return lead?.status ? lead.status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown'
}

function discountAmount(discount, courseFee) {
  if (!discount) return 0
  const fee = Number(courseFee || 0)
  const value = Number(discount.value || 0)
  return Math.min(value, fee)
}

function DetailField({ label, value, children }) {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== ''
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      {hasValue ? (
        <>
          <p className="mt-2 font-semibold text-slate-900">{value}</p>
          {children && <div className="mt-3">{children}</div>}
        </>
      ) : (
        <>
          <p className="mt-2 font-semibold text-slate-900">Not provided</p>
          {children && <div className="mt-3">{children}</div>}
        </>
      )}
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
    setForm((current) => ({ ...current, [field]: value }))
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
  const requiredFields = isEnrollment
    ? [
        'name', 'phone', 'course',
        ...(showBranchField ? ['branch'] : []),
        'preferred_timing', 'conversion_date', 'start_date',
      ]
    : [
        'name', 'phone', 'dob', 'email', 'pincode', 'location', 'course',
        ...(showBranchField ? ['branch'] : []),
        'qualification', 'year_of_passing', 'college_company',
        'preferred_timing', 'conversion_date',
      ]
  const shouldShowField = (field) => {
    if (field === 'branch') return showBranchField
    if (!isEnrollment) return true
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
    }

    if (isEnrollment && lead?.course && String(lead.course) !== String(payload.course)) {
      setPendingCourseChangePayload(payload)
      return
    }

    onSubmit(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_30px_90px_-35px_rgba(15,23,42,0.65)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Convert Lead
        </p>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
          Convert to {label}
        </h2>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          Complete the required details before creating the {isEnrollment ? 'enrollment' : 'walk-in'} record.
        </p>
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
        <div className="mt-6 grid gap-4 md:grid-cols-2">
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
              <select value={form.course} onChange={(event) => updateCourse(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
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
              <div>
                <FormField label="Qualification">
                  <select value={form.qualification} onChange={(event) => updateField('qualification', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <option value="">Select qualification</option>
                    {qualificationSelectOptions(form.qualification).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </FormField>
                {errorFor('qualification')}
              </div>
              <div>
                <FormField label="Degree">
                  <input value={form.degree} onChange={(event) => updateField('degree', event.target.value)} placeholder="Example: BCA, B.Com, BE CSE, MBA" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                </FormField>
              </div>
              <div>
                <FormField label="Passed Out Year">
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={form.year_of_passing}
                    onChange={(event) => updateField('year_of_passing', event.target.value)}
                    placeholder="2026"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  />
                </FormField>
                {errorFor('year_of_passing')}
              </div>
              <div className="md:col-span-2">
                <FormField label="College / Company Name">
                  <input
                    value={form.college_company}
                    onChange={(event) => updateField('college_company', event.target.value)}
                    placeholder="College, school, or company name"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  />
                </FormField>
                {errorFor('college_company')}
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
                <p className="text-xl font-black tracking-tight text-emerald-950">
                  Final Fees: Rs {formatMoney(finalFees)}
                </p>
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
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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
  const { user } = useSelector((state) => state.auth)
  const [lead, setLead] = useState(null)
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [conversionType, setConversionType] = useState('')
  const [converting, setConverting] = useState(false)
  const [conversionError, setConversionError] = useState('')
  const [detailsForm, setDetailsForm] = useState({})
  const [detailErrors, setDetailErrors] = useState({})
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
      status: type === 'enrollment' ? 'converted' : 'walk_in',
      converted_to_type: type,
      converted_record_id: data.id,
      converted_at: new Date().toISOString(),
    }))
    setConversionType('')
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
      const missing = err.response?.data?.missing_fields
      setConversionError(
        missing?.length
          ? `Please update missing lead details first: ${missing.map((field) => requiredLabels[field] || field).join(', ')}.`
          : err.response?.data?.detail || 'Conversion failed.'
      )
    } finally {
      setConverting(false)
    }
  }

  const saveFollowUp = async (payload) => {
    const { data } = await api.post(`/leads/${id}/follow-ups/`, payload)
    setLead((prev) => ({
      ...prev,
      status: payload.close_follow_up ? 'lost' : prev.status === 'new' ? 'follow_up' : prev.status,
      next_follow_up_date: data.next_follow_up_date,
      follow_ups: [data, ...(prev.follow_ups || [])],
    }))
    setMessage('Follow-up saved.')
  }

  const updateDetail = (field, value) => {
    setDetailsForm((current) => ({ ...current, [field]: value }))
    setDetailErrors((current) => ({ ...current, [field]: '' }))
  }

  const saveCandidateDetails = async () => {
    const editableFields = ['name', 'phone', 'dob', 'email', 'pincode', 'location', 'course', 'branch', 'preferred_timing', 'qualification', 'conversion_date']
      .filter((field) => {
        if (field === 'course') return !lead.course
        if (field === 'branch') return !lead.branch
        if (field === 'conversion_date') return !lead.walkin_date
        return !lead[field]
      })
    const missing = editableFields.filter((field) => !String(detailsForm[field] || '').trim())
    if (missing.length > 0) {
      setDetailErrors((current) => ({
        ...current,
        ...Object.fromEntries(missing.map((field) => [field, `${requiredLabels[field] || field} is required.`])),
      }))
      setMessage(`Please fill: ${missing.map((field) => requiredLabels[field]).join(', ')}.`)
      return
    }

    setSavingDetails(true)
    setMessage('')
    setDetailErrors({})
    try {
      const payload = {}
      editableFields.forEach((field) => {
        if (field === 'conversion_date') payload.walkin_date = detailsForm[field]
        else if (field === 'course' || field === 'branch') payload[field] = Number(detailsForm[field])
        else payload[field] = detailsForm[field]
      })
      if ((detailsForm.qualification || '') !== (lead.qualification || '')) payload.qualification = detailsForm.qualification || ''
      if (!lead.degree || detailsForm.degree !== lead.degree) payload.degree = detailsForm.degree || ''
      const { data } = await api.patch(`/leads/${id}/`, payload)
      setLead(data)
      setDetailsForm(buildConversionForm(data))
      setMessage('Candidate details updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || error.response?.data?.error || 'Failed to update candidate details.')
    } finally {
      setSavingDetails(false)
    }
  }

  const hasMissingDetails = ['name', 'phone', 'dob', 'email', 'pincode', 'location', 'course', 'branch', 'preferred_timing', 'qualification', 'walkin_date']
    .some((field) => !lead[field])
  const hasDetailChanges = ['qualification', 'degree'].some((field) => String(detailsForm[field] || '') !== String(lead[field] || ''))
  const detailErrorFor = (field) => detailErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{detailErrors[field]}</p> : null
  const convertedType = lead.converted_to_type || (lead.status === 'walk_in' ? 'walkin' : lead.status === 'converted' ? 'enrollment' : '')
  const convertedLabel = convertedType === 'walkin' ? 'Converted to Walk-in' : convertedType === 'enrollment' ? 'Converted to Enrollment' : ''
  const convertedLink = convertedType === 'walkin'
    ? `/walkins/${lead.converted_record_id}`
    : convertedType === 'enrollment'
      ? `/enrollments/${lead.converted_record_id}`
      : ''

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Lead</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{lead.name}</h1>
        <p className="mt-3 text-sm text-slate-500">
          {lead.lead_number} • {lead.phone} • {lead.course_name || 'No course'} • {conversionStatusLabel(lead)}
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Lead details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailField label="Name" value={lead.name}>
              <input value={detailsForm.name || ''} onChange={(event) => updateDetail('name', event.target.value)} placeholder="Enter Name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('name')}
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone Number</p>
              <div className="mt-2">
                <PhoneNumberEditor recordType="lead" recordId={lead.id} phone={lead.phone} onSaved={(phone) => {
                  setLead((current) => ({ ...current, phone }))
                  setDetailsForm((current) => ({ ...current, phone }))
                }} />
              </div>
            </div>
            <DetailField label="Date of Birth" value={lead.dob}>
              <input type="date" value={detailsForm.dob || ''} onChange={(event) => updateDetail('dob', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('dob')}
            </DetailField>
            <DetailField label="Email" value={lead.email}>
              <input type="email" value={detailsForm.email || ''} onChange={(event) => updateDetail('email', event.target.value)} placeholder="Enter Email" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('email')}
            </DetailField>
            <DetailField label="Pincode" value={lead.pincode}>
              <input value={detailsForm.pincode || ''} onChange={(event) => updateDetail('pincode', event.target.value)} placeholder="Enter Pincode" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('pincode')}
            </DetailField>
            <DetailField label="Address" value={lead.location}>
              <textarea value={detailsForm.location || ''} onChange={(event) => updateDetail('location', event.target.value)} placeholder="Enter Address" className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('location')}
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Source</p><p className="mt-2 font-semibold text-slate-900">{lead.source_display || lead.source}</p></div>
            <DetailField label="Visit Date" value={lead.walkin_date}>
              <input type="date" value={detailsForm.conversion_date || ''} onChange={(event) => updateDetail('conversion_date', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('conversion_date')}
            </DetailField>
            <DetailField label="Branch" value={lead.branch_name}>
              <select value={detailsForm.branch || ''} onChange={(event) => updateDetail('branch', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              {detailErrorFor('branch')}
            </DetailField>
            <DetailField label="Course Interested" value={lead.course_name}>
              <select value={detailsForm.course || ''} onChange={(event) => updateDetail('course', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
              {detailErrorFor('course')}
            </DetailField>
            <DetailField label="Preferred Timing" value={timingLabel(lead.preferred_timing)}>
              <select value={detailsForm.preferred_timing || ''} onChange={(event) => updateDetail('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Preferred Timing</option>
                <option value="weekday_morning">Weekdays (Morning)</option>
                <option value="weekday_evening">Weekdays (Evening)</option>
                <option value="weekends">Weekends</option>
              </select>
              {detailErrorFor('preferred_timing')}
            </DetailField>
            <DetailField label="Qualification" value={lead.qualification_display || lead.qualification}>
              <select value={detailsForm.qualification || ''} onChange={(event) => updateDetail('qualification', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Qualification</option>
                {qualificationSelectOptions(detailsForm.qualification || '').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {detailErrorFor('qualification')}
            </DetailField>
            <DetailField label="Degree" value={lead.degree}>
              <input value={detailsForm.degree || ''} onChange={(event) => updateDetail('degree', event.target.value)} placeholder="Example: BCA, B.Com, BE CSE, MBA" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            </DetailField>
          </div>
          {(hasMissingDetails || hasDetailChanges) && (
            <button
              type="button"
              onClick={saveCandidateDetails}
              disabled={savingDetails}
              className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {savingDetails ? 'Saving...' : 'Update Details'}
            </button>
          )}
          <FollowUpHistory
            followUps={lead.follow_ups || []}
            onSave={saveFollowUp}
          />
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Next action</h2>
          {convertedType ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                {convertedLabel}
              </span>
              <p className="mt-3 text-sm font-semibold text-emerald-950">
                {lead.converted_at ? `Converted on ${formatDateTime(lead.converted_at)}` : 'Converted record available.'}
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
                <button onClick={() => startConversion('walkin')} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                  Convert to Walk-in
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
    </div>
  )
}
