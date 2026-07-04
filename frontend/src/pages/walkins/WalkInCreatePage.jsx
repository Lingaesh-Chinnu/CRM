import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

const DIRECT_WALK_IN_BY = 'Direct'
const FRIENDS_REFERENCE_WALK_IN_BY = 'Friends Reference'
const FIXED_WALK_IN_BY_VALUES = [DIRECT_WALK_IN_BY, FRIENDS_REFERENCE_WALK_IN_BY]

const initialForm = {
  branch: '',
  name: '',
  dob: '',
  phone: '',
  email: '',
  location: '',
  pincode: '',
  course: '',
  qualification: '',
  degree: '',
  expected_course_budget: '',
  planned_joining_time: '',
  primary_goal: '',
  other_institutes_considering: '',
  counselor_status: '',
  competitor_status: '',
  follow_up_priority: '',
  conversion_probability: '',
  year_of_passing: '',
  college_company: '',
  preferred_timing: '',
  visit_date: new Date().toISOString().slice(0, 10),
  follow_up_date: '',
  assigned_to: '',
  source: '',
  remarks: '',
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
  { value: 'friends_reference', label: 'Friends Reference' },
]

const budgetOptions = [
  { value: '15000_25000', label: 'Rs 15,000-Rs 25,000' },
  { value: '26000_36000', label: 'Rs 26,000-Rs 36,000' },
  { value: '37000_47000', label: 'Rs 37,000-Rs 47,000' },
  { value: 'not_decided', label: 'Not Decided' },
]

const joiningOptions = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'within_1_week', label: 'Within 1 Week' },
  { value: 'within_1_month', label: 'Within 1 Month' },
  { value: 'not_decided', label: 'Not Decided' },
]

const goalOptions = [
  { value: 'get_job', label: 'Get a Job' },
  { value: 'career_switch', label: 'Career Switch' },
  { value: 'salary_hike', label: 'Salary Hike' },
  { value: 'internship_skill', label: 'Internship / Skill Enhancement' },
]

const counselorStatusOptions = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'will_walk_in', label: 'Will Walk-in' },
  { value: 'walk_in_completed', label: 'Walk-in Completed' },
  { value: 'demo_attended', label: 'Demo Attended' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'ready_to_join', label: 'Ready to Join' },
  { value: 'joined', label: 'Joined' },
  { value: 'na', label: 'NA' },
  { value: 'cna', label: 'CNA' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'lost_to_competitor', label: 'Lost to Competitor' },
]

const competitorOptions = [
  { value: 'not_enquired_elsewhere', label: 'Not Enquired Elsewhere' },
  { value: 'enquired_1', label: 'Enquired at 1 Institute' },
  { value: 'enquired_2_3', label: 'Enquired at 2-3 Institutes' },
  { value: 'enquired_more_3', label: 'Enquired at More Than 3 Institutes' },
  { value: 'fake_enquiry', label: 'Fake Enquiry' },
]

const priorityOptions = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const probabilityOptions = ['90', '75', '50', '25', '10'].map((value) => ({ value, label: `${value}%` }))

function FieldLabel({ children }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>
}

export default function WalkInCreatePage() {
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [walkInByOptions, setWalkInByOptions] = useState([])
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [duplicateRecords, setDuplicateRecords] = useState([])
  const [checkingPhone, setCheckingPhone] = useState(false)
  const [createAnyway, setCreateAnyway] = useState(false)

  const existingLead = duplicateRecords.find((record) => record.type === 'Lead')

  useEffect(() => {
    Promise.all([api.get('/courses/'), api.get('/branches/'), api.get('/walkins/walk-in-by-options/')]).then(([coursesRes, branchesRes, walkInByRes]) => {
      setCourses(coursesRes.data.results || coursesRes.data)
      setBranches(branchesRes.data.results || branchesRes.data)
      setWalkInByOptions(walkInByRes.data.results || walkInByRes.data)
    })
  }, [])

  useEffect(() => {
    setForm((current) => ({
      ...current,
      branch: !isSuperAdmin && user?.branch_id ? String(user.branch_id) : current.branch,
      assigned_to: !isSuperAdmin && user?.id ? String(user.id) : current.assigned_to,
    }))
  }, [isSuperAdmin, user?.branch_id, user?.id])

  useEffect(() => {
    const phone = form.phone.trim()
    setCreateAnyway(false)
    if (phone.replace(/\D/g, '').length < 6) {
      setDuplicateRecords([])
      setCheckingPhone(false)
      return undefined
    }

    let cancelled = false
    setCheckingPhone(true)
    const timeoutId = window.setTimeout(() => {
      api.get('/leads/duplicate-check/', { params: { phone } })
        .then(({ data }) => {
          if (!cancelled) setDuplicateRecords(data.records || [])
        })
        .catch(() => {
          if (!cancelled) setDuplicateRecords([])
        })
        .finally(() => {
          if (!cancelled) setCheckingPhone(false)
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [form.phone])

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'phone') setCreateAnyway(false)
  }

  const convertExistingLead = async () => {
    if (!existingLead || saving) return
    setSaving(true)
    setErrorMessage('')
    try {
      const { data } = await api.post(`/leads/${existingLead.id}/convert-to-walkin/`, {
        visit_date: form.visit_date,
        preferred_timing: form.preferred_timing,
        expected_course_budget: form.expected_course_budget,
        planned_joining_time: form.planned_joining_time,
        primary_goal: form.primary_goal,
        other_institutes_considering: form.other_institutes_considering,
        counselor_status: form.counselor_status,
        competitor_status: form.competitor_status,
        follow_up_priority: form.follow_up_priority,
        conversion_probability: form.conversion_probability,
        remarks: form.remarks,
      })
      navigate(`/walkins/${data.id}`)
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Failed to convert existing lead. Open the lead and complete any missing mandatory details.'))
    } finally {
      setSaving(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    if (existingLead && !createAnyway) {
      setErrorMessage('Existing Lead Found. Convert the existing lead or choose Create New Walk-in Anyway.')
      return
    }
    setSaving(true)
    setErrorMessage('')
    try {
      const { data } = await api.post('/walkins/', {
        ...form,
        branch: form.branch ? Number(form.branch) : null,
        course: form.course ? Number(form.course) : null,
        assigned_to: form.assigned_to && !FIXED_WALK_IN_BY_VALUES.includes(form.assigned_to) ? Number(form.assigned_to) : null,
        walk_in_by: FIXED_WALK_IN_BY_VALUES.includes(form.assigned_to) ? form.assigned_to : '',
        dob: form.dob || null,
        visit_date: form.visit_date,
        follow_up_date: form.follow_up_date || null,
      })
      navigate(`/walkins/${data.id}`)
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Failed to create walk-in.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Create walk-in</h1>
      </section>
      <form onSubmit={submit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Branch</FieldLabel>
            <select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} disabled={!isSuperAdmin} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 disabled:cursor-not-allowed disabled:bg-slate-100" required>
              <option value="">Select branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Full Name</FieldLabel>
            <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Date of Birth</FieldLabel>
            <input
              type="date"
              value={form.dob}
              onChange={(event) => updateForm('dob', event.target.value)}
              placeholder="Date of Birth"
              aria-label="Date of Birth"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>Phone Number</FieldLabel>
            <input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
            {checkingPhone && <p className="mt-2 text-xs font-semibold text-slate-500">Checking existing records...</p>}
          </div>
          {existingLead && (
            <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-950">Existing Lead Found</p>
              <div className="mt-3 grid gap-2 text-sm text-amber-950 sm:grid-cols-3">
                <p><span className="font-semibold">Name:</span> {existingLead.name || 'Not provided'}</p>
                <p><span className="font-semibold">Phone:</span> {existingLead.phone || 'Not provided'}</p>
                <p><span className="font-semibold">Course:</span> {existingLead.course_name || 'Not provided'}</p>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={convertExistingLead}
                  disabled={saving}
                  className="inline-flex justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? 'Converting...' : 'Convert Existing Lead'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateAnyway(true)
                    setErrorMessage('')
                  }}
                  disabled={saving}
                  className="inline-flex justify-center rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-100 disabled:opacity-60"
                >
                  Create New Walk-in Anyway
                </button>
              </div>
            </div>
          )}
          <div>
            <FieldLabel>Email</FieldLabel>
            <input type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Pincode</FieldLabel>
            <input value={form.pincode} onChange={(event) => updateForm('pincode', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Address</FieldLabel>
            <textarea value={form.location} onChange={(event) => updateForm('location', event.target.value)} className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Qualification</FieldLabel>
            <select value={form.qualification} onChange={(event) => updateForm('qualification', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select qualification</option>
              {qualificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Degree</FieldLabel>
            <input
              placeholder="Example: BCA, B.Com, BE CSE, MBA"
              value={form.degree}
              onChange={(event) => updateForm('degree', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <div>
            <FieldLabel>Passed Out Year</FieldLabel>
            <input
              type="number"
              min="1900"
              max="2100"
              placeholder="2026"
              value={form.year_of_passing}
              onChange={(event) => updateForm('year_of_passing', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>College / Company Name</FieldLabel>
            <input
              placeholder="College, school, or company name"
              value={form.college_company}
              onChange={(event) => updateForm('college_company', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>Expected Course Budget</FieldLabel>
            <select value={form.expected_course_budget} onChange={(event) => updateForm('expected_course_budget', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select budget</option>
              {budgetOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Planned Joining Time</FieldLabel>
            <select value={form.planned_joining_time} onChange={(event) => updateForm('planned_joining_time', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select joining time</option>
              {joiningOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Primary Goal</FieldLabel>
            <select value={form.primary_goal} onChange={(event) => updateForm('primary_goal', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select goal</option>
              {goalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Other Institutes Considering</FieldLabel>
            <input value={form.other_institutes_considering} onChange={(event) => updateForm('other_institutes_considering', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          </div>
          <div>
            <FieldLabel>Counselor Status</FieldLabel>
            <select value={form.counselor_status} onChange={(event) => updateForm('counselor_status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select status</option>
              {counselorStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Competitor Status</FieldLabel>
            <select value={form.competitor_status} onChange={(event) => updateForm('competitor_status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select competitor status</option>
              {competitorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Follow-up Priority</FieldLabel>
            <select value={form.follow_up_priority} onChange={(event) => updateForm('follow_up_priority', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select priority</option>
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Conversion Probability</FieldLabel>
            <select value={form.conversion_probability} onChange={(event) => updateForm('conversion_probability', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select probability</option>
              {probabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Course Interested</FieldLabel>
            <select value={form.course} onChange={(event) => updateForm('course', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Preferred Timing</FieldLabel>
            <select value={form.preferred_timing} onChange={(event) => updateForm('preferred_timing', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select timing</option>
              <option value="weekday_morning">Weekdays (Morning)</option>
              <option value="weekday_evening">Weekdays (Evening)</option>
              <option value="weekends">Weekends</option>
            </select>
          </div>
          <div>
            <FieldLabel>Visit Date</FieldLabel>
            <input
              type="date"
              value={form.visit_date}
              onChange={(event) => updateForm('visit_date', event.target.value)}
              placeholder="Visit Date"
              aria-label="Visit Date"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>Next Follow-up Date</FieldLabel>
            <input
              type="date"
              value={form.follow_up_date}
              onChange={(event) => updateForm('follow_up_date', event.target.value)}
              placeholder="Next Follow-up Date"
              aria-label="Next Follow-up Date"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Walk-in By</FieldLabel>
            <select value={form.assigned_to} onChange={(event) => updateForm('assigned_to', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select Walk-in By</option>
              {walkInByOptions.map((option, index) => [
                index === 2 ? <option key="walk-in-by-separator" disabled>-----------------</option> : null,
                <option key={option.id} value={option.id}>{option.name}</option>,
              ])}
            </select>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Source</FieldLabel>
            <select value={form.source} onChange={(event) => updateForm('source', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select source</option>
              {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Remarks</FieldLabel>
            <textarea value={form.remarks} onChange={(event) => updateForm('remarks', event.target.value)} className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          </div>
        </div>
        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}
        <button disabled={saving || (existingLead && !createAnyway)} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {saving ? 'Saving...' : createAnyway ? 'Save Walk-in Anyway' : 'Save Walk-in'}
        </button>
      </form>
    </div>
  )
}
