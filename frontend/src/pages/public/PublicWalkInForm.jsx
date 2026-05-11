import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import brandLogo from '../../assets/brand-logo.png'

const initialForm = {
  branch: '',
  name: '',
  dob: '',
  phone: '',
  email: '',
  location: '',
  pincode: '',
  course: '',
  preferred_timing: '',
  demo_class: '',
  interested_global_certification: '',
  source: '',
}

function FieldLabel({ children }) {
  return (
    <label className="mb-2 block text-sm font-semibold text-slate-700">
      {children}
    </label>
  )
}

function RadioGroup({ name, value, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' },
      ].map((option) => (
        <label
          key={option.value}
          className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
            value === option.value
              ? 'border-cyan-400 bg-cyan-50 ring-4 ring-cyan-100'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(event) => onChange(event.target.value)}
            className="h-4 w-4 accent-cyan-500"
            required
          />
          <span className="text-sm font-semibold text-slate-700">{option.label}</span>
        </label>
      ))}
    </div>
  )
}

function formatSubmitError(error) {
  const data = error.response?.data
  if (!data) {
    return error.request
      ? 'Could not reach the server. Please check your connection and try again.'
      : 'Failed to submit walk-in form.'
  }
  if (typeof data === 'string') return data
  if (data.detail) return data.detail
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([field, value]) => {
        const label = field.replace(/_/g, ' ')
        const message = Array.isArray(value) ? value.join(', ') : String(value)
        return `${label}: ${message}`
      })
      .join(' ')
  }
  return 'Failed to submit walk-in form.'
}

export default function PublicWalkInForm() {
  const [form, setForm] = useState(initialForm)
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [timings, setTimings] = useState([])
  const [sources, setSources] = useState([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    api.get('/public/walkin/').then(({ data }) => {
      const branchFromLink = new URLSearchParams(window.location.search).get('branch') || ''
      setBranches(data.branches || [])
      setCourses(data.courses || [])
      setTimings(data.preferred_timing_options || [])
      setSources(data.source_options || [])
      if (branchFromLink && (data.branches || []).some((branch) => String(branch.id) === branchFromLink)) {
        setForm((current) => ({ ...current, branch: branchFromLink }))
      }
    })
  }, [])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving || redirecting) return
    setSaving(true)
    setMessage('')

    try {
      await api.post('/public/walkin/', {
        ...form,
        branch: Number(form.branch),
        course: Number(form.course),
        demo_class: form.demo_class === 'yes',
        interested_global_certification: form.interested_global_certification === 'yes',
        dob: form.dob || null,
        visit_date: new Date().toISOString().slice(0, 10),
      })
      setMessage('Thanks for filling out the form.')
      setRedirecting(true)
      setForm(initialForm)
      window.setTimeout(() => {
        window.location.href = 'https://www.indrainstitute.com'
      }, 2500)
    } catch (error) {
      setRedirecting(false)
      setMessage(formatSubmitError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10 sm:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.22),transparent_30%)]" />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[36px] border border-white/10 bg-white/6 p-8 text-white shadow-[0_40px_100px_-45px_rgba(15,23,42,1)] backdrop-blur md:p-10">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                <img src={brandLogo} alt="IIE Logo" className="h-16 w-16 object-contain" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight">Indra Institute of Education</p>
                <p className="mt-1 text-sm text-slate-300">Walk-in registration desk</p>
              </div>
            </div>

            <div className="mt-10">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300">
                Candidate Walk-in Form
              </p>
              <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight">
                Step into your future with IIE.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">
                Choosing your course is the first step towards a brighter future. Our expert counselors are here to guide you through our wide range of courses and help you find the perfect fit for your career aspirations. Whether you're interested in IT training, software testing, or global certifications, we have the right course for you. Let's explore your options together and set you on the path to success.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {['Gandhipuram', 'Hopes', 'Kuniyamuthur'].map((branchName) => (
                <div key={branchName} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Branch</p>
                  <p className="mt-3 text-lg font-bold tracking-tight text-white">{branchName}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[36px] border border-white/10 bg-white/95 p-7 shadow-[0_40px_100px_-45px_rgba(15,23,42,1)] sm:p-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Walk-in Form</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Register your details</h2>
              </div>
              <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                IIE
              </div>
            </div>

            <form onSubmit={submit} className="mt-8 grid gap-5 md:grid-cols-2">
              <div>
                <FieldLabel>Branch</FieldLabel>
                <select
                  value={form.branch}
                  onChange={(event) => updateField('branch', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Name</FieldLabel>
                <input
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div>
                <FieldLabel>Date of Birth</FieldLabel>
                <input
                  type="date"
                  value={form.dob}
                  onChange={(event) => updateField('dob', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div>
                <FieldLabel>Phone Number</FieldLabel>
                <input
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div>
                <FieldLabel>Email ID</FieldLabel>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div>
                <FieldLabel>Pincode</FieldLabel>
                <input
                  value={form.pincode}
                  onChange={(event) => updateField('pincode', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <FieldLabel>Address</FieldLabel>
                <textarea
                  value={form.location}
                  onChange={(event) => updateField('location', event.target.value)}
                  className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                />
              </div>

              <div>
                <FieldLabel>Course Interested</FieldLabel>
                <select
                  value={form.course}
                  onChange={(event) => updateField('course', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                >
                  <option value="">Select course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Preferred Timing</FieldLabel>
                <select
                  value={form.preferred_timing}
                  onChange={(event) => updateField('preferred_timing', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                >
                  <option value="">Select timing</option>
                  {timings.map((timing) => (
                    <option key={timing.value} value={timing.value}>
                      {timing.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <FieldLabel>Demo class required?</FieldLabel>
                <RadioGroup
                  name="demo_class"
                  value={form.demo_class}
                  onChange={(value) => updateField('demo_class', value)}
                />
              </div>

              <div className="md:col-span-2">
                <FieldLabel>Interested in Global Certification?</FieldLabel>
                <RadioGroup
                  name="interested_global_certification"
                  value={form.interested_global_certification}
                  onChange={(value) => updateField('interested_global_certification', value)}
                />
              </div>

              <div className="md:col-span-2">
                <FieldLabel>How do you know about IIE?</FieldLabel>
                <select
                  value={form.source}
                  onChange={(event) => updateField('source', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required
                >
                  <option value="">Select source</option>
                  {sources.map((source) => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </select>
              </div>

              {message && (
                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                  {message}
                </div>
              )}

              <button
                disabled={saving || redirecting}
                className="md:col-span-2 rounded-2xl bg-slate-950 px-4 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Submitting...' : redirecting ? 'Redirecting...' : 'Submit Walk-in'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
