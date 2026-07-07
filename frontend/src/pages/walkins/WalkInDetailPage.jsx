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

const DIRECT_WALK_IN_BY = 'Direct'
const FRIENDS_REFERENCE_WALK_IN_BY = 'Friends Reference'
const FIXED_WALK_IN_BY_VALUES = [DIRECT_WALK_IN_BY, FRIENDS_REFERENCE_WALK_IN_BY]

function isFixedWalkInBy(value) {
  return FIXED_WALK_IN_BY_VALUES.includes(value)
}

function prettyValue(value, fallback = '') {
  return value || fallback
}

function toNumber(value) {
  return Number(value || 0)
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('en-IN', {
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

function todayInputValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10)
}

function discountAmount(discount, courseFee) {
  if (!discount) return 0
  const fee = Number(courseFee || 0)
  const value = Number(discount.value || 0)
  return Math.min(value, fee)
}

const SPOT_CONVERSION_DISCOUNT = 2000

function sameDate(first, second) {
  return Boolean(first && second && first === second)
}

function walkInByLabel(walkin) {
  return walkin.assigned_name || walkin.walk_in_by_display || 'Unassigned'
}

function counselingByLabel(walkin) {
  return walkin.counseling_by_name || 'Unassigned'
}

const qualificationOptions = [
  { value: 'school_student', label: 'School Student' },
  { value: 'college_student', label: 'College Student' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'working_professional', label: 'Working Professional' },
  { value: 'housewife', label: 'Housewife' },
]

const sourceOptions = [
  { value: 'google', label: 'Google' },
  { value: 'justdial', label: 'JustDial' },
  { value: 'direct', label: 'Direct' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'student_reference', label: 'Student Reference' },
  { value: 'friends_reference', label: 'Friends Reference' },
  { value: 'staff_reference', label: 'Staff Reference' },
  { value: 'others', label: 'Other' },
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

const budgetOptions = [
  { value: '15000_25000', label: '₹15,000 – ₹25,000' },
  { value: '26000_36000', label: '₹26,000 – ₹36,000' },
  { value: '37000_47000', label: '₹37,000 – ₹47,000' },
  { value: 'not_decided', label: 'Not decided' },
]

const joiningOptions = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'within_1_week', label: 'Within 1 week' },
  { value: 'within_1_month', label: 'Within 1 month' },
  { value: 'not_decided', label: 'Not decided' },
]

const goalOptions = [
  { value: 'get_job', label: 'Get a job' },
  { value: 'career_switch', label: 'Career switch' },
  { value: 'salary_hike', label: 'Salary hike' },
  { value: 'internship_skill', label: 'Internship / Skill enhancement' },
]

function qualificationSelectOptions(value) {
  if (!value || qualificationOptions.some((option) => option.value === value)) return qualificationOptions
  return [{ value, label: value }, ...qualificationOptions]
}

function sourceLabel(value) {
  return sourceOptions.find((option) => option.value === value)?.label || value
}

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value
}

function uniqueStaffUsers(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

const requiredLabels = {
  branch: 'Branch',
  name: 'Name',
  phone: 'Phone Number',
  dob: 'Date of Birth',
  email: 'Email',
  location: 'Address',
  pincode: 'Pincode',
  course: 'Course',
  preferred_timing: 'Preferred Timing',
  qualification: 'Qualification',
  degree: 'Degree',
  year_of_passing: 'Passed Out Year',
  college_company: 'College / Company Name',
  enrollment_date: 'Enrollment Date',
  start_date: 'Course Start Date',
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
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}

export default function WalkInDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useSelector((state) => state.auth)
  const [walkin, setWalkin] = useState(null)
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [walkInByUsers, setWalkInByUsers] = useState([])
  const [counselingUsers, setCounselingUsers] = useState([])
  const [availableDiscounts, setAvailableDiscounts] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [detailErrors, setDetailErrors] = useState({})
  const [editingDetails, setEditingDetails] = useState(false)
  const [pendingDetailChanges, setPendingDetailChanges] = useState([])
  const [savingDetails, setSavingDetails] = useState(false)
  const [assignmentEditing, setAssignmentEditing] = useState(false)
  const [savingAssignments, setSavingAssignments] = useState(false)
  const [changeRequestModal, setChangeRequestModal] = useState(null)
  const [branchCorrectionOpen, setBranchCorrectionOpen] = useState(false)
  const [branchCorrection, setBranchCorrection] = useState({ branch: '', reason: '' })
  const [assignmentRequest, setAssignmentRequest] = useState({
    requested_user: '',
    reason: '',
  })
  const [pendingCourseChangePayload, setPendingCourseChangePayload] = useState(null)
  const [form, setForm] = useState({
    branch: '',
    name: '',
    dob: '',
    phone: '',
    email: '',
    location: '',
    pincode: '',
    course: '',
    preferred_timing: '',
    source: '',
    source_description: '',
    qualification: '',
    degree: '',
    year_of_passing: '',
    college_company: '',
    visit_date: '',
    enrollment_date: todayInputValue(),
    actual_fees: '',
    discount: '',
    spot_conversion_discount_applied: false,
    start_date: '',
    assigned_to: '',
    counseling_by: '',
    transfer_reason: '',
    counselor_status: '',
    competitor_status: '',
    follow_up_priority: '',
    conversion_probability: '',
    remarks: '',
  })
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const isSuperAdmin = user?.role === 'super_admin'

  const selectedCourse = courses.find((course) => String(course.id) === String(form.course))
  const courseFee = toNumber(selectedCourse?.final_fees ?? form.actual_fees)
  const discountBaseFee = toNumber(form.actual_fees || selectedCourse?.actual_fees || selectedCourse?.final_fees)
  const selectedDiscount = availableDiscounts.find((discount) => String(discount.id) === String(form.discount))
  const appliedDiscount = discountAmount(selectedDiscount, discountBaseFee)
  const finalFees = selectedDiscount ? Math.max(discountBaseFee - appliedDiscount, 0) : courseFee
  const spotDiscountEnabled = sameDate(form.visit_date, form.enrollment_date)
  const spotDiscountApplied = spotDiscountEnabled && form.spot_conversion_discount_applied
  const spotDiscountAmount = spotDiscountApplied ? SPOT_CONVERSION_DISCOUNT : 0
  const netPayableFees = Math.max(finalFees - spotDiscountAmount, 0)

  useEffect(() => {
    setLoadError('')
    Promise.all([
      api.get(`/walkins/${id}/`),
      api.get('/courses/'),
      api.get('/branches/'),
    ]).then(([walkinRes, coursesRes, branchesRes]) => {
      const data = walkinRes.data
      const courseRows = coursesRes.data.results || coursesRes.data
      const matchedCourse = courseRows.find((course) => String(course.id) === String(data.course))
      setWalkin(data)
      setCourses(courseRows)
      setBranches(branchesRes.data.results || branchesRes.data)
      setForm((prev) => ({
        ...prev,
        branch: data.branch || '',
        name: data.name || '',
        dob: data.dob || '',
        phone: data.phone || '',
        email: data.email || '',
        location: data.location || '',
        pincode: data.pincode || '',
        course: data.course || '',
        preferred_timing: data.preferred_timing || '',
        source: data.source || '',
        source_description: data.source_description || '',
        qualification: data.qualification || '',
        degree: data.degree || '',
        year_of_passing: data.year_of_passing || '',
        college_company: data.college_company || '',
        visit_date: data.visit_date || '',
        assigned_to: isFixedWalkInBy(data.walk_in_by) ? data.walk_in_by : data.assigned_to || '',
        counseling_by: data.counseling_by || '',
        counselor_status: data.counselor_status || '',
        competitor_status: data.competitor_status || '',
        follow_up_priority: data.follow_up_priority || '',
        conversion_probability: data.conversion_probability || '',
        remarks: data.remarks || '',
        enrollment_date: todayInputValue(),
        actual_fees: matchedCourse?.actual_fees ?? matchedCourse?.final_fees ?? '',
      }))
      setBranchCorrection({ branch: data.branch || '', reason: '' })
    }).catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load walk-in details.')))
  }, [id])

  useEffect(() => {
    api.get('/walkins/walk-in-by-options/')
      .then(({ data }) => setWalkInByUsers(uniqueStaffUsers(data || [])))
      .catch(() => setWalkInByUsers([]))
  }, [])

  useEffect(() => {
    if (!form.branch) {
      setCounselingUsers([])
      return
    }
    api.get('/walkins/staff-options/', { params: { branch: form.branch } })
      .then(({ data }) => setCounselingUsers(uniqueStaffUsers(data || [])))
      .catch(() => setCounselingUsers([]))
  }, [form.branch])

  useEffect(() => {
    if (!form.course || !form.branch) {
      setAvailableDiscounts([])
      return
    }
    api.get('/discounts/', { params: { course: form.course, branch: form.branch, available: 1 } })
      .then(({ data }) => setAvailableDiscounts(data.results || data))
      .catch(() => setAvailableDiscounts([]))
  }, [form.course, form.branch])

  if (!walkin) return <div className="p-6 text-slate-500">{loadError || 'Loading walk-in details...'}</div>

  const updateCourse = (courseId) => {
    const nextCourse = courses.find((course) => String(course.id) === String(courseId))
    setForm((current) => ({
      ...current,
      course: courseId,
      actual_fees: nextCourse?.actual_fees ?? nextCourse?.final_fees ?? '',
      discount: '',
    }))
    setFieldErrors((current) => ({ ...current, course: '' }))
    setDetailErrors((current) => ({ ...current, course: '' }))
  }

  const courseNameFor = (courseId) => courses.find((course) => String(course.id) === String(courseId))?.name || 'selected course'

  const submitEnrollment = async (payload) => {
    setPendingCourseChangePayload(null)
    try {
      const { data } = await api.post(`/walkins/${id}/convert-to-enrollment/`, payload)
      setMessage('Walk-in converted to enrollment successfully.')
      const systemFollowUp = {
        id: `joined-${Date.now()}`,
        record_type: 'walkin',
        record_id: Number(id),
        follow_up_date: todayInputValue(),
        next_follow_up_date: null,
        remarks: 'Joined - No follow-up required',
        updated_by: user?.id || null,
        updated_by_name: user?.full_name || user?.name || user?.username || '',
        created_at: new Date().toISOString(),
      }
      setWalkin((current) => ({
        ...current,
        status: 'converted',
        converted_to_type: 'enrollment',
        converted_record_id: data.id,
        converted_at: new Date().toISOString(),
        enrollment_id: data.id,
        is_converted_to_enrollment: true,
        follow_up_date: null,
        follow_ups: [systemFollowUp, ...(current.follow_ups || [])],
      }))
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to convert walk-in to enrollment.')
    }
  }

  const convert = async (event) => {
    event.preventDefault()
    const requiredFields = [
      ['branch', 'Branch'],
      ['name', 'Name'],
      ['phone', 'Phone Number'],
      ['course', 'Course Interested'],
      ['preferred_timing', 'Preferred Timing'],
      ['enrollment_date', 'Enrollment Date'],
      ['start_date', 'Course Start Date'],
    ]
    const missingFields = requiredFields.filter(([field]) => !String(form[field] || '').trim())
    const missing = missingFields.map(([, label]) => label)
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missingFields.map(([field, label]) => [field, `${label} is required.`])))
      setMessage(`Please fill: ${missing.join(', ')}.`)
      return
    }
    setFieldErrors({})
    const payload = {
      branch: Number(form.branch),
      name: form.name.trim(),
      dob: form.dob,
      phone: form.phone.trim(),
      email: form.email.trim(),
      location: form.location.trim(),
      pincode: form.pincode.trim(),
      qualification: form.qualification.trim(),
      degree: form.degree.trim(),
      course: Number(form.course),
      preferred_timing: form.preferred_timing,
      enrollment_date: form.enrollment_date,
      actual_fees: selectedDiscount ? discountBaseFee : courseFee,
      discount: form.discount || null,
      spot_conversion_discount_applied: spotDiscountApplied,
      start_date: form.start_date || null,
    }
    if (walkin.course && String(walkin.course) !== String(payload.course)) {
      setPendingCourseChangePayload(payload)
      return
    }
    await submitEnrollment(payload)
  }

  const saveFollowUp = async (payload) => {
    const { data } = await api.post(`/walkins/${id}/follow-ups/`, payload)
    setWalkin((current) => ({
      ...current,
      follow_up_date: data.next_follow_up_date,
      follow_ups: [data, ...(current.follow_ups || [])],
    }))
    navigate(resolveReturnTo(location, '/walkins'), {
      replace: true,
      state: { message: FOLLOW_UP_SUCCESS_MESSAGE, listFilters: location.state?.listFilters },
    })
  }

  const updateDetail = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if ((field === 'visit_date' || field === 'enrollment_date') && !sameDate(next.visit_date, next.enrollment_date)) {
        next.spot_conversion_discount_applied = false
      }
      return next
    })
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setDetailErrors((current) => ({ ...current, [field]: '' }))
  }

  const detailFields = [
    ...(isSuperAdmin ? [{ field: 'branch', label: 'Branch', value: walkin.branch, displayValue: walkin.branch_name, displayNew: (value) => branches.find((branch) => String(branch.id) === String(value))?.name || value }] : []),
    { field: 'name', label: 'Name', value: walkin.name },
    { field: 'phone', label: 'Phone Number', value: walkin.phone },
    { field: 'course', label: 'Course Interested', value: walkin.course, displayValue: walkin.course_name, displayNew: (value) => courses.find((course) => String(course.id) === String(value))?.name || value },
    { field: 'visit_date', label: 'Visit Date', value: walkin.visit_date },
    { field: 'dob', label: 'Date of Birth', value: walkin.dob },
    { field: 'preferred_timing', label: 'Preferred Timing', value: walkin.preferred_timing, displayValue: walkin.preferred_timing_display, displayNew: (value) => value === 'weekday_morning' ? 'Weekdays (Morning)' : value === 'weekday_evening' ? 'Weekdays (Evening)' : value === 'weekends' ? 'Weekends' : value },
    { field: 'source', label: 'Source', value: walkin.source, displayValue: walkin.source_display, displayNew: sourceLabel },
    { field: 'source_description', label: 'Source Description', value: walkin.source_description || '' },
    { field: 'pincode', label: 'Pincode', value: walkin.pincode },
    { field: 'location', label: 'Address', value: walkin.location },
    { field: 'email', label: 'Email', value: walkin.email },
    { field: 'qualification', label: 'Qualification', value: walkin.qualification, displayValue: walkin.qualification_display || walkin.qualification, displayNew: (value) => qualificationSelectOptions(value).find((option) => option.value === value)?.label || value },
    { field: 'degree', label: 'Degree', value: walkin.degree },
    { field: 'year_of_passing', label: 'Passed Out Year', value: walkin.year_of_passing },
    { field: 'college_company', label: 'College / Company Name', value: walkin.college_company },
    { field: 'counselor_status', label: 'Status', value: walkin.counselor_status, displayValue: crmStatusOptions.find((option) => option.value === walkin.counselor_status)?.label || '', displayNew: (value) => crmStatusOptions.find((option) => option.value === value)?.label || value },
    { field: 'competitor_status', label: 'Competitor Status', value: walkin.competitor_status, displayValue: competitorStatusOptions.find((option) => option.value === walkin.competitor_status)?.label || '', displayNew: (value) => competitorStatusOptions.find((option) => option.value === value)?.label || value },
    { field: 'follow_up_priority', label: 'Follow-up Priority', value: walkin.follow_up_priority, displayValue: followUpPriorityOptions.find((option) => option.value === walkin.follow_up_priority)?.label || '', displayNew: (value) => followUpPriorityOptions.find((option) => option.value === value)?.label || value },
    { field: 'conversion_probability', label: 'Conversion Probability', value: walkin.conversion_probability, displayValue: conversionProbabilityOptions.find((option) => option.value === walkin.conversion_probability)?.label || '', displayNew: (value) => conversionProbabilityOptions.find((option) => option.value === value)?.label || value },
    { field: 'remarks', label: 'Remarks', value: walkin.remarks || '' },
  ]

  const detailChanges = () => detailFields
    .filter(({ field, value }) => String(form[field] || '') !== String(value || ''))
    .map((config) => ({
      ...config,
      oldValue: config.displayValue ?? config.value ?? '',
      newValue: config.displayNew ? config.displayNew(form[config.field] || '') : form[config.field] || '',
    }))

  const resetDetailsEdit = () => {
    const matchedCourse = courses.find((course) => String(course.id) === String(walkin.course))
    setForm((current) => ({
      ...current,
      branch: walkin.branch || '',
      name: walkin.name || '',
      dob: walkin.dob || '',
      phone: walkin.phone || '',
      email: walkin.email || '',
      location: walkin.location || '',
      pincode: walkin.pincode || '',
      course: walkin.course || '',
      preferred_timing: walkin.preferred_timing || '',
      source: walkin.source || '',
      source_description: walkin.source_description || '',
      qualification: walkin.qualification || '',
      degree: walkin.degree || '',
      year_of_passing: walkin.year_of_passing || '',
      college_company: walkin.college_company || '',
        visit_date: walkin.visit_date || '',
        assigned_to: isFixedWalkInBy(walkin.walk_in_by) ? walkin.walk_in_by : walkin.assigned_to || '',
        counseling_by: walkin.counseling_by || '',
        counselor_status: walkin.counselor_status || '',
        competitor_status: walkin.competitor_status || '',
        follow_up_priority: walkin.follow_up_priority || '',
        conversion_probability: walkin.conversion_probability || '',
        remarks: walkin.remarks || '',
        actual_fees: matchedCourse?.actual_fees ?? matchedCourse?.final_fees ?? current.actual_fees,
      }))
    setDetailErrors({})
    setPendingDetailChanges([])
    setEditingDetails(false)
  }

  const requestSaveCandidateDetails = () => {
    const changes = detailChanges()
    if (changes.length === 0) {
      setMessage('No changes to update.')
      return
    }
    const missing = changes.filter(({ field }) => field !== 'source_description' && !String(form[field] || '').trim())
    const missingLabels = missing.map(({ label }) => label)

    if (missing.length > 0) {
      setDetailErrors((current) => ({
        ...current,
        ...Object.fromEntries(missing.map(({ field, label }) => [field, `${label} is required.`])),
      }))
      setMessage(`Please fill: ${missingLabels.join(', ')}.`)
      return
    }
    setMessage('')
    setPendingDetailChanges(changes)
  }

  const saveCandidateDetails = async () => {
    try {
      setSavingDetails(true)
      setDetailErrors({})
      const payload = {}
      pendingDetailChanges.forEach(({ field }) => {
        if (field === 'course' || field === 'branch') payload[field] = Number(form[field])
        else payload[field] = form[field]
      })
      const { data } = await api.patch(`/walkins/${id}/`, payload)
      const matchedCourse = courses.find((course) => String(course.id) === String(data.course))
      setWalkin(data)
      setForm((current) => ({
        ...current,
        branch: data.branch || '',
        name: data.name || '',
        dob: data.dob || '',
        phone: data.phone || '',
        email: data.email || '',
        location: data.location || '',
        pincode: data.pincode || '',
        course: data.course || '',
        preferred_timing: data.preferred_timing || '',
        source: data.source || '',
        source_description: data.source_description || '',
        qualification: data.qualification || '',
        degree: data.degree || '',
        year_of_passing: data.year_of_passing || '',
        college_company: data.college_company || '',
        visit_date: data.visit_date || '',
        assigned_to: isFixedWalkInBy(data.walk_in_by) ? data.walk_in_by : data.assigned_to || '',
        counseling_by: data.counseling_by || '',
        actual_fees: matchedCourse?.actual_fees ?? matchedCourse?.final_fees ?? current.actual_fees,
      }))
      setMessage('Candidate details updated.')
      setEditingDetails(false)
      setPendingDetailChanges([])
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update candidate details.')
    } finally {
      setSavingDetails(false)
    }
  }

  const saveAssignments = async () => {
    const payload = {}
    if (!walkin.assigned_to && !isFixedWalkInBy(walkin.walk_in_by) && form.assigned_to) {
      if (isFixedWalkInBy(form.assigned_to)) payload.walk_in_by = form.assigned_to
      else payload.assigned_to = Number(form.assigned_to)
    }
    if (!walkin.counseling_by && form.counseling_by) payload.counseling_by = Number(form.counseling_by)
    if (Object.keys(payload).length === 0) {
      setMessage('No assignment changes to save.')
      return
    }
    try {
      setSavingAssignments(true)
      const { data } = await api.patch(`/walkins/${id}/`, payload)
      setWalkin(data)
      setForm((current) => ({
        ...current,
        assigned_to: isFixedWalkInBy(data.walk_in_by) ? data.walk_in_by : data.assigned_to || '',
        counseling_by: data.counseling_by || '',
      }))
      setAssignmentEditing(false)
      setMessage('Assignment details updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update assignment details.')
    } finally {
      setSavingAssignments(false)
    }
  }

  const cancelAssignmentEdit = () => {
    setForm((current) => ({
      ...current,
      assigned_to: isFixedWalkInBy(walkin.walk_in_by) ? walkin.walk_in_by : walkin.assigned_to || '',
      counseling_by: walkin.counseling_by || '',
    }))
    setAssignmentEditing(false)
  }

  const openAssignmentChangeRequest = (fieldType) => {
    setAssignmentRequest({ requested_user: '', reason: '' })
    setChangeRequestModal({ fieldType })
  }

  const requestAssignmentChange = async () => {
    const fieldType = changeRequestModal?.fieldType
    const requestedUser = assignmentRequest.requested_user
    const reason = assignmentRequest.reason.trim()
    if (!requestedUser) {
      setMessage('Select the requested user.')
      return
    }
    if (!reason) {
      setMessage('Enter a reason for the change request.')
      return
    }
    try {
      await api.post(`/walkins/${id}/request-assignment-change/`, {
        field_type: fieldType,
        requested_user: isFixedWalkInBy(requestedUser) ? null : Number(requestedUser),
        requested_walk_in_by: isFixedWalkInBy(requestedUser) ? requestedUser : '',
        reason,
      })
      setAssignmentRequest({ requested_user: '', reason: '' })
      setChangeRequestModal(null)
      setMessage('Change request sent to the requested counselor for approval.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to submit assignment change request.')
    }
  }

  const requestUsersFor = (fieldType) => fieldType === 'assigned_to' ? walkInByUsers : counselingUsers
  const currentAssignmentLabel = (fieldType) => fieldType === 'assigned_to' ? walkInByLabel(walkin) : counselingByLabel(walkin)

  const changeBranch = async () => {
    if (!branchCorrection.branch) {
      setMessage('Please select a branch.')
      return
    }
    if (!window.confirm('Are you sure you want to change this walk-in branch?')) return
    try {
      const { data } = await api.post(`/walkins/${id}/change-branch/`, {
        branch: Number(branchCorrection.branch),
        reason: branchCorrection.reason,
      })
      setWalkin(data)
      setForm((current) => ({ ...current, branch: data.branch || '' }))
      setBranchCorrection({ branch: data.branch || '', reason: '' })
      setBranchCorrectionOpen(false)
      setMessage('Walk-in branch updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to change walk-in branch.')
    }
  }

  const deleteWalkIn = async () => {
    await api.delete(`/walkins/${id}/`)
    navigate('/walkins', { replace: true })
  }

  const errorFor = (field) => fieldErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors[field]}</p> : null
  const detailErrorFor = (field) => detailErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{detailErrors[field]}</p> : null
  const hasValidEnrollmentConversion = Boolean(walkin.is_converted_to_enrollment || walkin.enrollment_id || walkin.status === 'converted')
  const enrollmentRecordId = walkin.enrollment_id || (hasValidEnrollmentConversion ? walkin.converted_record_id : null)
  const convertedLink = enrollmentRecordId ? `/enrollments/${enrollmentRecordId}` : ''
  const canAssignEmptyOwnership = (!walkin.assigned_to && !isFixedWalkInBy(walkin.walk_in_by)) || !walkin.counseling_by

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Walk-in Detail</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{walkin.name}</h1>
          {!editingDetails && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { resetDetailsEdit(); setEditingDetails(true); setMessage('') }} className="w-fit rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                Edit
              </button>
              {isSuperAdmin && <AdminDeleteButton label="walk-in" onConfirm={deleteWalkIn} />}
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {walkin.candidate_number} | {walkin.branch_name || 'No branch'} | {walkin.phone}
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Candidate details</h2>
            {assignmentEditing ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={cancelAssignmentEdit} disabled={savingAssignments} className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
                  Cancel
                </button>
                <button type="button" onClick={saveAssignments} disabled={savingAssignments} className="inline-flex min-w-[130px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                  {savingAssignments ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            ) : editingDetails ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={resetDetailsEdit} disabled={savingDetails} className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
                  Cancel
                </button>
                <button type="button" onClick={requestSaveCandidateDetails} disabled={savingDetails} className="inline-flex min-w-[130px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                  {savingDetails ? 'Saving...' : 'Save Update'}
                </button>
              </div>
            ) : canAssignEmptyOwnership ? (
              <button type="button" onClick={() => { setAssignmentEditing(true); setMessage('') }} className="inline-flex w-fit justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                Edit Assignment
              </button>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailField label="Branch" value={walkin.branch_name} editing={editingDetails && isSuperAdmin}>
              <select value={form.branch || ''} onChange={(event) => updateDetail('branch', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              {detailErrorFor('branch')}
            </DetailField>
            <DetailField label="Status" value={crmStatusOptions.find((option) => option.value === walkin.counselor_status)?.label || 'Not provided'} editing={editingDetails}>
              <select value={form.counselor_status || ''} onChange={(event) => updateDetail('counselor_status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Status</option>
                {crmStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Competitor Status" value={competitorStatusOptions.find((option) => option.value === walkin.competitor_status)?.label || 'Not provided'} editing={editingDetails}>
              <select value={form.competitor_status || ''} onChange={(event) => updateDetail('competitor_status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Competitor Status</option>
                {competitorStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Follow-up Priority" value={followUpPriorityOptions.find((option) => option.value === walkin.follow_up_priority)?.label || 'Not provided'} editing={editingDetails}>
              <select value={form.follow_up_priority || ''} onChange={(event) => updateDetail('follow_up_priority', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Priority</option>
                {followUpPriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </DetailField>
            <DetailField label="Name" value={walkin.name} editing={editingDetails}>
              <input value={form.name} onChange={(event) => updateDetail('name', event.target.value)} placeholder="Enter Name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('name')}
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone Number</p>
              {editingDetails ? (
                <div className="mt-3">
                  <input value={form.phone} onChange={(event) => updateDetail('phone', event.target.value)} placeholder="Enter Phone Number" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                  {detailErrorFor('phone')}
                </div>
              ) : (
                <p className="mt-2 font-semibold text-slate-900">{walkin.phone || 'Not provided'}</p>
              )}
            </div>
            {isSuperAdmin && (
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-700">Admin Branch Correction</p>
                {!branchCorrectionOpen ? (
                  <button
                    type="button"
                    onClick={() => setBranchCorrectionOpen(true)}
                    className="mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Change Branch
                  </button>
                ) : (
                  <div className="mt-3 space-y-3">
                    <select
                      value={branchCorrection.branch}
                      onChange={(event) => setBranchCorrection((current) => ({ ...current, branch: event.target.value }))}
                      className="w-full rounded-2xl border border-cyan-200 bg-white px-4 py-3 text-sm"
                    >
                      <option value="">Select Branch</option>
                      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                    </select>
                    <input
                      value={branchCorrection.reason}
                      onChange={(event) => setBranchCorrection((current) => ({ ...current, reason: event.target.value }))}
                      placeholder="Reason (optional)"
                      className="w-full rounded-2xl border border-cyan-200 bg-white px-4 py-3 text-sm"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={changeBranch} className="inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                        Save
                      </button>
                      <button type="button" onClick={() => setBranchCorrectionOpen(false)} className="inline-flex min-w-[100px] justify-center whitespace-nowrap rounded-2xl border border-cyan-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-white">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DetailField label="Course Interested" value={walkin.course_name} editing={editingDetails}>
              <select value={form.course} onChange={(event) => updateCourse(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
              {detailErrorFor('course')}
            </DetailField>
            <DetailField label="Visit Date" value={walkin.visit_date} editing={editingDetails}>
              <input type="date" value={form.visit_date || ''} onChange={(event) => updateDetail('visit_date', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('visit_date')}
            </DetailField>
            <DetailField label="Date of Birth" value={walkin.dob} editing={editingDetails}>
              <input type="date" value={form.dob} onChange={(event) => updateDetail('dob', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('dob')}
            </DetailField>
            <DetailField label="Preferred Timing" value={walkin.preferred_timing_display} editing={editingDetails}>
              <select value={form.preferred_timing} onChange={(event) => updateDetail('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Preferred Timing</option>
                <option value="weekday_morning">Weekdays (Morning)</option>
                <option value="weekday_evening">Weekdays (Evening)</option>
                <option value="weekends">Weekends</option>
              </select>
              {detailErrorFor('preferred_timing')}
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Demo Class Required</p><p className="mt-2 font-semibold text-slate-900">{walkin.demo_class ? 'Yes' : 'No'}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Interested in Global Certification</p><p className="mt-2 font-semibold text-slate-900">{walkin.interested_global_certification ? 'Yes' : 'No'}</p></div>
            <DetailField label="How they know IIE" value={prettyValue(walkin.source_display)} editing={editingDetails}>
              <select value={form.source} onChange={(event) => updateDetail('source', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Source</option>
                {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {detailErrorFor('source')}
            </DetailField>
            <DetailField label="Source Description" value={walkin.source_description || 'Not provided'} editing={editingDetails}>
              <textarea
                value={form.source_description || ''}
                onChange={(event) => updateDetail('source_description', event.target.value)}
                placeholder="Add optional source details"
                className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              />
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Walk-In By</p>
              {assignmentEditing && !walkin.assigned_to && !isFixedWalkInBy(walkin.walk_in_by) ? (
                <select
                  value={form.assigned_to || ''}
                  onChange={(event) => setForm((current) => ({ ...current, assigned_to: event.target.value }))}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
                >
                  <option value="">Select Walk-in By</option>
                  {walkInByUsers.map((staff, index) => [
                    index === 2 ? <option key="walk-in-by-separator" disabled>-----------------</option> : null,
                    <option key={staff.id} value={staff.id}>{staff.name}</option>,
                  ])}
                </select>
              ) : (
                <>
                  <p className="mt-2 font-semibold text-slate-900">{walkInByLabel(walkin)}</p>
                  {walkin.assigned_to || isFixedWalkInBy(walkin.walk_in_by) ? (
                    <>
                      <p className="mt-1 text-xs font-medium text-slate-500">Locked after assignment</p>
                      <button type="button" onClick={() => openAssignmentChangeRequest('assigned_to')} className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                        Change Request
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Counseling By</p>
              {assignmentEditing && !walkin.counseling_by ? (
                <select
                  value={form.counseling_by || ''}
                  onChange={(event) => setForm((current) => ({ ...current, counseling_by: event.target.value }))}
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
                >
                  <option value="">Select Counseling By</option>
                  {counselingUsers.map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <p className="mt-2 font-semibold text-slate-900">{counselingByLabel(walkin)}</p>
                  {walkin.counseling_by ? (
                    <>
                      <p className="mt-1 text-xs font-medium text-slate-500">Locked after assignment</p>
                      <button type="button" onClick={() => openAssignmentChangeRequest('counseling_by')} className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                        Change Request
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
            <DetailField label="Pincode" value={walkin.pincode} editing={editingDetails}>
              <input value={form.pincode} onChange={(event) => updateDetail('pincode', event.target.value)} placeholder="Enter Pincode" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('pincode')}
            </DetailField>
            <DetailField label="Address" value={walkin.location} editing={editingDetails}>
              <textarea value={form.location} onChange={(event) => updateDetail('location', event.target.value)} placeholder="Enter Address" className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('location')}
            </DetailField>
            <DetailField label="Email" value={walkin.email} editing={editingDetails}>
              <input type="email" value={form.email} onChange={(event) => updateDetail('email', event.target.value)} placeholder="Enter Email" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('email')}
            </DetailField>
            <DetailField label="Qualification" value={walkin.qualification_display || walkin.qualification} editing={editingDetails}>
              <select value={form.qualification} onChange={(event) => updateDetail('qualification', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Qualification</option>
                {qualificationSelectOptions(form.qualification).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {detailErrorFor('qualification')}
            </DetailField>
            <DetailField label="Degree" value={walkin.degree} editing={editingDetails}>
              <input value={form.degree} onChange={(event) => updateDetail('degree', event.target.value)} placeholder="Example: BCA, B.Com, BE CSE, MBA" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            </DetailField>
            <DetailField label="Passed Out Year" value={walkin.year_of_passing} editing={editingDetails}>
              <input
                type="number"
                min="1900"
                max="2100"
                value={form.year_of_passing}
                onChange={(event) => updateDetail('year_of_passing', event.target.value)}
                placeholder="2026"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
              />
              {detailErrorFor('year_of_passing')}
            </DetailField>
            <DetailField label="College / Company Name" value={walkin.college_company} editing={editingDetails}>
              <input value={form.college_company} onChange={(event) => updateDetail('college_company', event.target.value)} placeholder="College, school, or company name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('college_company')}
            </DetailField>
            <DetailField label="Expected Course Fee Budget" value={optionLabel(budgetOptions, walkin.expected_course_budget)} />
            <DetailField label="Planning to Join" value={optionLabel(joiningOptions, walkin.planned_joining_time)} />
            <DetailField label="Primary Goal" value={optionLabel(goalOptions, walkin.primary_goal)} />
            <DetailField label="Other Institutes Considering" value={walkin.other_institutes_considering} />
          </div>
          <FollowUpHistory
            followUps={walkin.follow_ups || []}
            onSave={saveFollowUp}
            readOnly={hasValidEnrollmentConversion}
          />
          <StatusHistory rows={walkin.status_history || []} />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {message && <p className="text-sm text-slate-600">{message}</p>}
          </div>
        </div>

        <form onSubmit={convert} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {hasValidEnrollmentConversion ? 'Conversion status' : 'Convert to enrollment'}
          </h2>
          {pendingCourseChangePayload && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold leading-6 text-amber-950">
                Candidate originally enquired for {walkin.course_name || courseNameFor(walkin.course)}, but now enrolling for {courseNameFor(pendingCourseChangePayload.course)}. Do you want to continue?
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => submitEnrollment(pendingCourseChangePayload)}
                  className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Confirm & Continue
                </button>
                <button
                  type="button"
                  onClick={() => setPendingCourseChangePayload(null)}
                  className="rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {hasValidEnrollmentConversion ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <span className="inline-flex rounded-full bg-[#DCFCE7] px-[10px] py-1 text-xs font-semibold text-[#166534]">
                Enrolled
              </span>
              <p className="mt-3 text-sm font-semibold text-emerald-950">
                {walkin.converted_at ? `Enrolled on ${formatDateTime(walkin.converted_at)}` : 'Enrollment record available.'}
              </p>
              {convertedLink && (
                <Link to={convertedLink} className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                  View Enrollment
                </Link>
              )}
            </div>
          ) : (
          <>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-700">
              Ready for Enrollment
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">Not Converted</p>
          </div>
          <div className="mt-5 space-y-4">
            <div>
              {isSuperAdmin ? (
                <FormField label="Branch">
                  <select value={form.branch} onChange={(event) => { updateDetail('branch', event.target.value); setForm((current) => ({ ...current, branch: event.target.value, discount: '' })) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <option value="">Select branch</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </FormField>
              ) : (
                <FormField label="Branch">
                  <input value={walkin.branch_name || 'No branch'} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-700" />
                </FormField>
              )}
              {errorFor('branch')}
            </div>
            <div>
              <FormField label="Full Name">
                <input value={form.name} onChange={(event) => updateDetail('name', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
              </FormField>
              {errorFor('name')}
            </div>
            <div>
              <FormField label="Phone Number">
                <input value={form.phone} onChange={(event) => updateDetail('phone', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
              </FormField>
              {errorFor('phone')}
            </div>
            <div>
              <FormField label="Course Interested">
                <select value={form.course} onChange={(event) => updateCourse(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <option value="">Select course</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </FormField>
              {errorFor('course')}
            </div>
            <div>
              <FormField label="Preferred Timing">
                <select value={form.preferred_timing} onChange={(event) => updateDetail('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <option value="">Select timing</option>
                  <option value="weekday_morning">Weekdays (Morning)</option>
                  <option value="weekday_evening">Weekdays (Evening)</option>
                  <option value="weekends">Weekends</option>
                </select>
              </FormField>
              {errorFor('preferred_timing')}
            </div>
            <div>
              <FormField label="Degree">
                <input
                  value={form.degree}
                  onChange={(event) => updateDetail('degree', event.target.value)}
                  placeholder="Example: BCA, B.Com, BE CSE, MBA"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                />
              </FormField>
            </div>
            <div>
              <FormField label="Enrollment Date">
                <input
                  type="date"
                  value={form.enrollment_date}
                  onChange={(event) => updateDetail('enrollment_date', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                />
              </FormField>
              {errorFor('enrollment_date')}
            </div>
            <div>
              <FormField label="Available Discount">
                <select
                  value={form.discount || ''}
                  onChange={(event) => setForm({ ...form, discount: event.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <option value="">No discount</option>
                  {availableDiscounts.map((discount) => (
                    <option key={discount.id} value={discount.id}>
                      {discount.name} - Rs {formatMoney(discount.value)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="grid gap-2 text-sm text-emerald-950">
                <p className="font-semibold">Actual Fees: Rs {formatMoney(discountBaseFee || courseFee)}</p>
                <p className="font-semibold">Course Discount: Rs {formatMoney(appliedDiscount)}</p>
                <p className="font-black">Final Fees: Rs {formatMoney(finalFees)}</p>
                <p className="font-semibold">Spot Conversion Discount: Rs {formatMoney(spotDiscountAmount)}</p>
                <p className="text-xl font-black tracking-tight">Net Payable Fees: Rs {formatMoney(netPayableFees)}</p>
              </div>
              <p className="hidden">
                {selectedCourse ? `${selectedCourse.name} • ` : ''}
                {''}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <label className="flex items-start gap-3 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={spotDiscountApplied}
                  disabled={!spotDiscountEnabled}
                  onChange={(event) => setForm((current) => ({ ...current, spot_conversion_discount_applied: event.target.checked }))}
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
            <div>
              <FormField label="Course Start Date">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(event) => updateDetail('start_date', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                />
              </FormField>
              {errorFor('start_date')}
            </div>
          </div>
          <button className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Convert to Enrollment
          </button>
          <Link to="/enrollments" className="mt-3 block text-center text-sm font-medium text-slate-500 hover:text-slate-900">
            View enrollments
          </Link>
          </>
          )}
        </form>
      </section>
      {changeRequestModal && (
        <div onClick={() => setChangeRequestModal(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div onClick={(event) => event.stopPropagation()} className="relative w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
            <ModalCloseButton onClick={() => setChangeRequestModal(null)} label="Close change request modal" />
            <h3 className="pr-10 text-lg font-black tracking-tight text-slate-950">Change Request</h3>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Assignment</span>
                <input value={currentAssignmentLabel(changeRequestModal.fieldType)} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700" />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Requested Assignment</span>
                <select
                  value={assignmentRequest.requested_user}
                  onChange={(event) => setAssignmentRequest((current) => ({ ...current, requested_user: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
                >
                  <option value="">Select user</option>
                  {requestUsersFor(changeRequestModal.fieldType).map((staff, index) => [
                    changeRequestModal.fieldType === 'assigned_to' && index === 2
                      ? <option key="walk-in-by-request-separator" disabled>-----------------</option>
                      : null,
                    <option key={staff.id} value={staff.id}>{staff.name}</option>,
                  ])}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reason</span>
                <textarea
                  value={assignmentRequest.reason}
                  onChange={(event) => setAssignmentRequest((current) => ({ ...current, reason: event.target.value }))}
                  rows={4}
                  placeholder="Enter reason for this change"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                />
              </label>
            </div>
            <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
              <button type="button" onClick={() => setChangeRequestModal(null)} className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={requestAssignmentChange} className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                Submit Request
              </button>
            </div>
          </div>
        </div>
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
