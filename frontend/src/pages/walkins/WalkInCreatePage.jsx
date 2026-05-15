import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

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
  year_of_passing: '',
  college_company: '',
  preferred_timing: '',
  visit_date: new Date().toISOString().slice(0, 10),
  follow_up_date: '',
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

function FieldLabel({ children }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>
}

export default function WalkInCreatePage() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    Promise.all([api.get('/courses/'), api.get('/branches/')]).then(([coursesRes, branchesRes]) => {
      setCourses(coursesRes.data.results || coursesRes.data)
      setBranches(branchesRes.data.results || branchesRes.data)
    })
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setErrorMessage('')
    try {
      const { data } = await api.post('/walkins/', {
        ...form,
        branch: form.branch ? Number(form.branch) : null,
        course: form.course ? Number(form.course) : null,
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
            <select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Full Name</FieldLabel>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Date of Birth</FieldLabel>
            <input
              type="date"
              value={form.dob}
              onChange={(event) => setForm({ ...form, dob: event.target.value })}
              placeholder="Date of Birth"
              aria-label="Date of Birth"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>Phone Number</FieldLabel>
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Pincode</FieldLabel>
            <input value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Address</FieldLabel>
            <textarea value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          </div>
          <div>
            <FieldLabel>Qualification</FieldLabel>
            <select value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select qualification</option>
              {qualificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Degree</FieldLabel>
            <input
              placeholder="Example: BCA, B.Com, BE CSE, MBA"
              value={form.degree}
              onChange={(event) => setForm({ ...form, degree: event.target.value })}
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
              onChange={(event) => setForm({ ...form, year_of_passing: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>College / Company Name</FieldLabel>
            <input
              placeholder="College, school, or company name"
              value={form.college_company}
              onChange={(event) => setForm({ ...form, college_company: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>
          <div>
            <FieldLabel>Course Interested</FieldLabel>
            <select value={form.course} onChange={(event) => setForm({ ...form, course: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select course</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Preferred Timing</FieldLabel>
            <select value={form.preferred_timing} onChange={(event) => setForm({ ...form, preferred_timing: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
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
              onChange={(event) => setForm({ ...form, visit_date: event.target.value })}
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
              onChange={(event) => setForm({ ...form, follow_up_date: event.target.value })}
              placeholder="Next Follow-up Date"
              aria-label="Next Follow-up Date"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Source</FieldLabel>
            <select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select source</option>
              <option value="google">Google</option>
              <option value="justdial">JustDial</option>
              <option value="direct">Direct</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="friends_reference">Friends Reference</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <FieldLabel>Remarks</FieldLabel>
            <textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />
          </div>
        </div>
        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </div>
        )}
        <button disabled={saving} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {saving ? 'Saving...' : 'Save Walk-in'}
        </button>
      </form>
    </div>
  )
}
