import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import FollowUpHistory from '../../components/common/FollowUpHistory'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'
import { apiErrorMessage } from '../../utils/apiErrors'

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

function discountAmount(discount, courseFee) {
  if (!discount) return 0
  const fee = Number(courseFee || 0)
  const value = Number(discount.value || 0)
  return Math.min(value, fee)
}

function walkInByLabel(walkin) {
  return walkin.assigned_name || walkin.created_by_name || walkin.walk_in_by_display || 'Public Form'
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

export default function WalkInDetailPage() {
  const { id } = useParams()
  const { user } = useSelector((state) => state.auth)
  const [walkin, setWalkin] = useState(null)
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [availableDiscounts, setAvailableDiscounts] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [detailErrors, setDetailErrors] = useState({})
  const [branchCorrectionOpen, setBranchCorrectionOpen] = useState(false)
  const [branchCorrection, setBranchCorrection] = useState({ branch: '', reason: '' })
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
    qualification: '',
    degree: '',
    year_of_passing: '',
    college_company: '',
    visit_date: '',
    enrollment_date: new Date().toISOString().slice(0, 10),
    actual_fees: '',
    discount: '',
    start_date: '',
    assigned_to: '',
    transfer_reason: '',
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
        qualification: data.qualification || '',
        degree: data.degree || '',
        year_of_passing: data.year_of_passing || '',
        college_company: data.college_company || '',
        visit_date: data.visit_date || '',
        assigned_to: data.assigned_to || '',
        enrollment_date: data.visit_date || prev.enrollment_date,
        actual_fees: matchedCourse?.actual_fees ?? matchedCourse?.final_fees ?? '',
      }))
      setBranchCorrection({ branch: data.branch || '', reason: '' })
    }).catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load walk-in details.')))
  }, [id])

  useEffect(() => {
    if (!form.branch) {
      setStaffUsers([])
      return
    }
    api.get('/walkins/staff-options/', { params: { branch: form.branch } })
      .then(({ data }) => setStaffUsers(uniqueStaffUsers(data || [])))
      .catch(() => setStaffUsers([]))
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
      setWalkin((current) => ({
        ...current,
        status: 'converted',
        converted_to_type: 'enrollment',
        converted_record_id: data.id,
        converted_at: new Date().toISOString(),
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
      status: payload.close_follow_up ? 'not_interested' : current.status === 'new' ? 'follow_up' : current.status,
      follow_up_date: data.next_follow_up_date,
      follow_ups: [data, ...(current.follow_ups || [])],
    }))
    setMessage('Follow-up saved.')
  }

  const updateDetail = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: '' }))
    setDetailErrors((current) => ({ ...current, [field]: '' }))
  }

  const saveCandidateDetails = async () => {
    const editableFields = [
      ['branch', 'Branch'],
      ['name', 'Name'],
      ['phone', 'Phone Number'],
      ['dob', 'Date of Birth'],
      ['email', 'Email'],
      ['location', 'Address'],
      ['pincode', 'Pincode'],
      ['qualification', 'Qualification'],
      ['year_of_passing', 'Passed Out Year'],
      ['college_company', 'College / Company Name'],
      ['course', 'Course Interested'],
      ['preferred_timing', 'Preferred Timing'],
      ['visit_date', 'Visit Date'],
    ].filter(([field]) => {
      if (field === 'branch') return !walkin.branch
      if (field === 'course') return !walkin.course
      if (field === 'visit_date') return !walkin.visit_date
      return !walkin[field]
    })
    const missing = editableFields
      .filter(([field]) => !String(form[field] || '').trim())
    const missingLabels = missing.map(([, label]) => label)

    if (missing.length > 0) {
      setDetailErrors((current) => ({
        ...current,
        ...Object.fromEntries(missing.map(([field, label]) => [field, `${label} is required.`])),
      }))
      setMessage(`Please fill: ${missingLabels.join(', ')}.`)
      return
    }

    try {
      setDetailErrors({})
      const payload = {}
      editableFields.forEach(([field]) => {
        if (field === 'branch' || field === 'course') payload[field] = Number(form[field])
        else payload[field] = form[field]
      })
      if ((form.qualification || '') !== (walkin.qualification || '')) payload.qualification = form.qualification || ''
      if (!walkin.degree || form.degree !== walkin.degree) payload.degree = form.degree || ''
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
        qualification: data.qualification || '',
        degree: data.degree || '',
        year_of_passing: data.year_of_passing || '',
        college_company: data.college_company || '',
        visit_date: data.visit_date || '',
        actual_fees: matchedCourse?.actual_fees ?? matchedCourse?.final_fees ?? current.actual_fees,
      }))
      setMessage('Candidate details updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update candidate details.')
    }
  }

  const saveWalkInBy = async (event) => {
    const assignedTo = event.target.value
    setForm((current) => ({ ...current, assigned_to: assignedTo }))
    try {
      const { data } = await api.patch(`/walkins/${id}/`, {
        assigned_to: assignedTo ? Number(assignedTo) : null,
      })
      setWalkin(data)
      setMessage('Walk-in by updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update walk-in by.')
    }
  }

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

  const hasMissingDetails = ['branch', 'name', 'phone', 'dob', 'email', 'location', 'pincode', 'qualification', 'year_of_passing', 'college_company', 'course', 'preferred_timing', 'visit_date']
    .some((field) => !walkin[field])
  const hasDetailChanges = ['qualification', 'degree'].some((field) => String(form[field] || '') !== String(walkin[field] || ''))
  const errorFor = (field) => fieldErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors[field]}</p> : null
  const detailErrorFor = (field) => detailErrors[field] ? <p className="mt-1 text-xs font-medium text-rose-600">{detailErrors[field]}</p> : null
  const convertedType = walkin.converted_to_type || (walkin.status === 'converted' ? 'enrollment' : '')
  const convertedLink = convertedType === 'enrollment' && walkin.converted_record_id ? `/enrollments/${walkin.converted_record_id}` : ''

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Walk-in Detail</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{walkin.name}</h1>
        <p className="mt-3 text-sm text-slate-500">
          {walkin.candidate_number} | {walkin.branch_name || 'No branch'} | {walkin.phone}
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Candidate details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailField label="Branch" value={walkin.branch_name}>
              <p className="font-semibold text-slate-900">{walkin.branch_name || 'No branch'}</p>
            </DetailField>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone Number</p>
              <div className="mt-2">
                <PhoneNumberEditor recordType="walkin" recordId={walkin.id} phone={walkin.phone} onSaved={(phone) => {
                  setWalkin((current) => ({ ...current, phone }))
                  setForm((current) => ({ ...current, phone }))
                }} />
              </div>
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
                    <div className="flex gap-2">
                      <button type="button" onClick={changeBranch} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                        Save
                      </button>
                      <button type="button" onClick={() => setBranchCorrectionOpen(false)} className="rounded-2xl border border-cyan-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-white">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DetailField label="Course Interested" value={walkin.course_name}>
              <select value={form.course} onChange={(event) => updateCourse(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
              {detailErrorFor('course')}
            </DetailField>
            <DetailField label="Visit Date" value={walkin.visit_date}>
              <input type="date" value={form.visit_date || ''} onChange={(event) => updateDetail('visit_date', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('visit_date')}
            </DetailField>
            <DetailField label="Date of Birth" value={walkin.dob}>
              <input type="date" value={form.dob} onChange={(event) => updateDetail('dob', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('dob')}
            </DetailField>
            <DetailField label="Preferred Timing" value={walkin.preferred_timing_display}>
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
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.18em] text-slate-500">How they know IIE</p><p className="mt-2 font-semibold text-slate-900">{prettyValue(walkin.source_display)}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Walk-In By</p>
              <select
                value={form.assigned_to || ''}
                onChange={saveWalkInBy}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
              >
                <option value="">{walkInByLabel(walkin)}</option>
                {staffUsers.map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.name}</option>
                ))}
              </select>
            </div>
            <DetailField label="Pincode" value={walkin.pincode}>
              <input value={form.pincode} onChange={(event) => updateDetail('pincode', event.target.value)} placeholder="Enter Pincode" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('pincode')}
            </DetailField>
            <DetailField label="Address" value={walkin.location}>
              <textarea value={form.location} onChange={(event) => updateDetail('location', event.target.value)} placeholder="Enter Address" className="min-h-[90px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('location')}
            </DetailField>
            <DetailField label="Email" value={walkin.email}>
              <input type="email" value={form.email} onChange={(event) => updateDetail('email', event.target.value)} placeholder="Enter Email" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('email')}
            </DetailField>
            <DetailField label="Qualification" value={walkin.qualification_display || walkin.qualification}>
              <input value={form.qualification} onChange={(event) => updateDetail('qualification', event.target.value)} placeholder="Enter Qualification" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('qualification')}
            </DetailField>
            <DetailField label="Degree" value={walkin.degree}>
              <input value={form.degree} onChange={(event) => updateDetail('degree', event.target.value)} placeholder="B.Com, BCA, BE CSE, MBA, 12th, Diploma" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
            </DetailField>
            <DetailField label="Passed Out Year" value={walkin.year_of_passing}>
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
            <DetailField label="College / Company Name" value={walkin.college_company}>
              <input value={form.college_company} onChange={(event) => updateDetail('college_company', event.target.value)} placeholder="College, school, or company name" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
              {detailErrorFor('college_company')}
            </DetailField>
          </div>
          {(hasMissingDetails || hasDetailChanges) && (
            <button
              type="button"
              onClick={saveCandidateDetails}
              className="mt-5 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Update Details
            </button>
          )}
          <FollowUpHistory
            followUps={walkin.follow_ups || []}
            onSave={saveFollowUp}
          />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {message && <p className="text-sm text-slate-600">{message}</p>}
          </div>
        </div>

        <form onSubmit={convert} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {convertedType ? 'Conversion status' : 'Convert to enrollment'}
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
          {convertedType ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Converted to Enrollment
              </span>
              <p className="mt-3 text-sm font-semibold text-emerald-950">
                {walkin.converted_at ? `Converted on ${formatDateTime(walkin.converted_at)}` : 'Converted record available.'}
              </p>
              {convertedLink && (
                <Link to={convertedLink} className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                  View Enrollment
                </Link>
              )}
            </div>
          ) : (
          <>
          <div className="mt-5 space-y-4">
            <div>
              {isSuperAdmin ? (
                <select value={form.branch} onChange={(event) => { updateDetail('branch', event.target.value); setForm((current) => ({ ...current, branch: event.target.value, discount: '' })) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <option value="">Branch</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              ) : (
                <input value={walkin.branch_name || 'No branch'} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-700" />
              )}
              {errorFor('branch')}
            </div>
            <div>
              <input value={form.name} onChange={(event) => updateDetail('name', event.target.value)} placeholder="Name" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
              {errorFor('name')}
            </div>
            <div>
              <input value={form.phone} onChange={(event) => updateDetail('phone', event.target.value)} placeholder="Phone Number" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
              {errorFor('phone')}
            </div>
            <div>
              <select value={form.course} onChange={(event) => updateCourse(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <option value="">Course Interested</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
              {errorFor('course')}
            </div>
            <div>
              <select value={form.preferred_timing} onChange={(event) => updateDetail('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <option value="">Preferred Timing</option>
                <option value="weekday_morning">Weekdays (Morning)</option>
                <option value="weekday_evening">Weekdays (Evening)</option>
                <option value="weekends">Weekends</option>
              </select>
              {errorFor('preferred_timing')}
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Enrollment Date
              </label>
              <input
                type="date"
                value={form.enrollment_date}
                onChange={(event) => updateDetail('enrollment_date', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              />
              {errorFor('enrollment_date')}
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Available Discount
              </label>
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
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-xl font-black tracking-tight text-emerald-950">
                Final Fees: Rs {formatMoney(finalFees)}
              </p>
              <p className="hidden">
                {selectedCourse ? `${selectedCourse.name} • ` : ''}
                {''}
              </p>
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Course Start Date
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => updateDetail('start_date', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              />
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
    </div>
  )
}
