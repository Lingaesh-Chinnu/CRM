import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import brandLogo from '../../assets/brand-logo.png'

const REDIRECT_URL = 'https://www.indrainstitute.com'

const initialForm = {
  full_name: '',
  mobile_number: '',
  course_interested: '',
  willing_to_join: '',
  qualification: '',
  city: '',
  branch: '',
  company: '',
}

function FieldLabel({ children }) {
  return <label className="mb-2 block text-sm font-semibold text-slate-700">{children}</label>
}

export default function PublicLeadForm() {
  const isEmbedded = window.self !== window.top
  const queryDefaults = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      courseName: (params.get('course') || '').trim().toLowerCase(),
      branchName: (params.get('branch') || '').trim().toLowerCase(),
    }
  }, [])
  const [form, setForm] = useState(initialForm)
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [willingToJoinOptions, setWillingToJoinOptions] = useState([])
  const [qualificationOptions, setQualificationOptions] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    api.get('/public/lead-form/').then(({ data }) => {
      const branchOptions = data.branches || []
      const courseOptions = data.courses || []
      setBranches(branchOptions)
      setCourses(courseOptions)
      setWillingToJoinOptions(data.willing_to_join_options || [])
      setQualificationOptions(data.qualification_options || [])
      setForm((current) => {
        const next = { ...current }
        if (!next.branch && queryDefaults.branchName) {
          const matchedBranch = branchOptions.find((branch) => branch.name.trim().toLowerCase() === queryDefaults.branchName)
          if (matchedBranch) next.branch = matchedBranch.id
        }
        if (!next.course_interested && queryDefaults.courseName) {
          const matchedCourse = courseOptions.find((course) => course.name.trim().toLowerCase() === queryDefaults.courseName)
          if (matchedCourse) next.course_interested = matchedCourse.id
        }
        return next
      })
    })
  }, [queryDefaults])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const requestClose = () => {
    if (isEmbedded) {
      window.parent.postMessage({ type: 'iie-lead-form-close' }, '*')
      return
    }
    window.location.href = REDIRECT_URL
  }

  const handleSuccess = () => {
    if (isEmbedded) {
      window.parent.postMessage({ type: 'iie-lead-form-success' }, '*')
      window.setTimeout(() => {
        window.parent.postMessage({ type: 'iie-lead-form-close' }, '*')
      }, 2500)
      return
    }
    window.setTimeout(() => {
      window.location.href = REDIRECT_URL
    }, 2500)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setMessage('')
    try {
      await api.post('/public/lead-form/', form)
      setMessage('Thanks for your enquiry, our team will reach you soon.')
      setForm((current) => ({
        ...initialForm,
        branch: current.branch,
        course_interested: current.course_interested,
      }))
      handleSuccess()
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to submit your enquiry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[rgba(15,23,42,0.58)] px-3 py-4 sm:px-6 sm:py-8">
      <div className="flex min-h-[calc(100vh-2rem)] items-center justify-center sm:min-h-[calc(100vh-4rem)]">
        <section className="animate-[modalIn_220ms_ease-out] relative w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <style>{`
            @keyframes modalIn {
              from { opacity: 0; transform: translateY(14px) scale(0.985); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>

          <button
            type="button"
            onClick={requestClose}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            aria-label="Close enquiry form"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>

          <div className="pr-12">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-sky-100 bg-sky-50">
                <img src={brandLogo} alt="IIE Logo" className="h-12 w-12 object-contain" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Public Lead Form</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Get a Call from our Team</h2>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel>Full Name</FieldLabel>
              <input
                value={form.full_name}
                onChange={(event) => updateField('full_name', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                required
              />
            </div>

            <div>
              <FieldLabel>Mobile Number</FieldLabel>
              <input
                value={form.mobile_number}
                onChange={(event) => updateField('mobile_number', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                inputMode="numeric"
                required
              />
            </div>

            <div>
              <FieldLabel>Select Branch</FieldLabel>
              <select
                value={form.branch}
                onChange={(event) => updateField('branch', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                required
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>Course Interested</FieldLabel>
              <select
                value={form.course_interested}
                onChange={(event) => updateField('course_interested', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
              >
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>When willing to join</FieldLabel>
              <select
                value={form.willing_to_join}
                onChange={(event) => updateField('willing_to_join', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                required
              >
                <option value="">Select option</option>
                {willingToJoinOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>Qualification</FieldLabel>
              <select
                value={form.qualification}
                onChange={(event) => updateField('qualification', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                required
              >
                <option value="">Select qualification</option>
                {qualificationOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>City</FieldLabel>
              <input
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </div>

            <div className="hidden" aria-hidden="true">
              <FieldLabel>Company</FieldLabel>
              <input
                tabIndex="-1"
                autoComplete="off"
                value={form.company}
                onChange={(event) => updateField('company', event.target.value)}
              />
            </div>

            {message && (
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                {message}
              </div>
            )}

            <button
              disabled={saving}
              className="md:col-span-2 rounded-2xl bg-slate-950 px-4 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Submitting...' : 'Submit Enquiry'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
