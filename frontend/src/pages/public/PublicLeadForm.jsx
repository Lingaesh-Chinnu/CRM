import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import brandLogo from '/iie-white.png'
import ModalCloseButton from '../../components/common/ModalCloseButton'
import './PublicLeadForm.css'

const REDIRECT_URL = 'https://www.indrainstitute.com'

const defaultCourseOptions = [
  'Artificial Intelligence',
  'Data Analytics',
  'Full Stack Python',
  'Full Stack Java',
  'MERN Stack',
  'Cyber Security',
  'Digital Marketing',
]

const timingOptions = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'weekend', label: 'Weekend' },
]

const initialForm = {
  full_name: '',
  mobile_number: '',
  course_interested: '',
  branch: '',
  preferred_timing: '',
}

function FieldLabel({ children }) {
  return <label className="mb-2 block text-[0.8rem] font-semibold text-slate-200">{children}</label>
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={onChange}
        className="lead-select w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 text-sm font-semibold text-white outline-none transition duration-200 hover:border-cyan-300/35 hover:bg-white/[0.1] focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
      >
        {children}
      </select>
    </div>
  )
}

function TextInput({ label, value, onChange, ...props }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={onChange}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 text-base font-semibold text-white outline-none transition duration-200 placeholder:text-slate-500 hover:border-cyan-300/35 hover:bg-white/[0.1] focus:border-cyan-300/70 focus:ring-4 focus:ring-cyan-300/10"
        {...props}
      />
    </div>
  )
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
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!isEmbedded) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isEmbedded])

  useEffect(() => {
    api.get('/public/lead-form/')
      .then(({ data }) => {
        const branchOptions = data.branches || []

        setBranches(branchOptions)

        setForm((current) => {
          const next = { ...current }

          if (!next.branch && queryDefaults.branchName) {
            const matchedBranch = branchOptions.find(
              (branch) => branch.name.trim().toLowerCase() === queryDefaults.branchName
            )
            if (matchedBranch) next.branch = matchedBranch.id
          }

          if (!next.course_interested && queryDefaults.courseName) {
            const matchedCourse = defaultCourseOptions.find(
              (courseName) => courseName.trim().toLowerCase() === queryDefaults.courseName
            )
            if (matchedCourse) next.course_interested = matchedCourse
          }

          return next
        })
      })
      .catch((error) => {
        setMessage(apiErrorMessage(error, 'Unable to load enquiry form options.'))
      })
  }, [queryDefaults])

  const updateField = (field, value) => {
    setMessage('')
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
      }, 2600)
      return
    }

    window.setTimeout(() => {
      window.location.href = REDIRECT_URL
    }, 2600)
  }

  const goNext = () => {
    if (!form.course_interested || !form.branch || !form.preferred_timing) {
      setMessage('Please choose course, branch, and preferred timing.')
      return
    }

    setMessage('')
    setStep(2)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setMessage('')

    const payload = {
      full_name: form.full_name.trim(),
      mobile_number: form.mobile_number.trim(),
      course_interested: form.course_interested,
      branch: form.branch,
      preferred_timing: form.preferred_timing,
    }

    try {
      await api.post('/public/lead-form/', payload)
      setSubmitted(true)
      handleSuccess()
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to submit your enquiry.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="public-lead-form public-enquiry-page min-h-screen overflow-y-auto bg-[var(--light)] px-3 py-3 text-white sm:px-6 sm:py-6">
      <div className="flex min-h-[calc(100vh-1.5rem)] items-start justify-center sm:min-h-[calc(100vh-3rem)] sm:items-center">
        <section className="lead-modal-in relative w-full max-w-[29rem] overflow-hidden rounded-[26px] border border-white/10 bg-[var(--ink)] shadow-[var(--shadow)] sm:rounded-[30px]">
          <style>{`
            @keyframes leadModalIn {
              from { opacity: 0; transform: translateY(14px) scale(0.985); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes leadStepIn {
              from { opacity: 0; transform: translateX(16px); }
              to { opacity: 1; transform: translateX(0); }
            }
            @keyframes leadSuccessIn {
              0% { opacity: 0; transform: translateY(10px) scale(0.96); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            .lead-modal-in { animation: leadModalIn 240ms ease-out both; }
            .lead-step-in { animation: leadStepIn 240ms ease-out both; }
            .lead-success-in { animation: leadSuccessIn 360ms cubic-bezier(0.2, 0.9, 0.2, 1) both; }
            .lead-select option { color: #0f172a; }
          `}</style>

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(41,82,255,0.24),transparent_34%),radial-gradient(circle_at_100%_24%,rgba(255,79,163,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_44%)]" />

          <ModalCloseButton
            onClick={requestClose}
            label="Close enquiry form"
            className="text-slate-300 hover:text-white focus-visible:ring-cyan-200/40"
          />

          <div className="relative p-4 sm:p-6">
            <div className="mb-5 flex items-center gap-3 pr-10">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/15 bg-white/[0.06] p-2 shadow-[0_14px_34px_-20px_rgba(34,211,238,0.75)]">
                <img src={brandLogo} alt="IIE Logo" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-cyan-200/80">
                  Quick Enquiry
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
                  Get a Call Back
                </h2>
              </div>
            </div>

            {!submitted && (
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <span>Step {step} of 2</span>
                  <span>{step === 1 ? 'Course' : 'Contact'}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="public-lead-gradient h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: step === 1 ? '50%' : '100%' }}
                  />
                </div>
              </div>
            )}

            {submitted ? (
              <div className="lead-success-in flex min-h-[21rem] flex-col items-center justify-center px-4 py-10 text-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-3xl font-black text-emerald-200 shadow-[0_0_44px_-18px_rgba(52,211,153,0.95)]">
                  ✓
                </div>
                <h3 className="text-3xl font-black tracking-tight text-white">Thanks!</h3>
                <p className="mt-3 max-w-xs text-base font-semibold leading-7 text-slate-300">
                  Our counselor will contact you shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                {step === 1 && (
                  <div key="step-1" className="lead-step-in space-y-4">
                    <SelectField
                      label="Course Interested"
                      value={form.course_interested}
                      onChange={(event) => updateField('course_interested', event.target.value)}
                    >
                      <option value="">Select course</option>
                      {defaultCourseOptions.map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </SelectField>

                    <SelectField
                      label="Branch"
                      value={form.branch}
                      onChange={(event) => updateField('branch', event.target.value)}
                    >
                      <option value="">Select branch</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </SelectField>

                    <div>
                      <FieldLabel>Preferred Timing</FieldLabel>
                      <div className="grid grid-cols-2 gap-2.5">
                        {timingOptions.map((option) => {
                          const active = form.preferred_timing === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => updateField('preferred_timing', option.value)}
                              className={`min-h-[3rem] rounded-2xl border px-3 py-3 text-sm font-bold transition duration-200 ${
                                active
                                  ? 'border-pink-200/70 bg-white text-[var(--blue)] shadow-[0_14px_32px_-22px_rgba(255,79,163,0.95)]'
                                  : 'border-white/10 bg-white/[0.06] text-slate-200 hover:-translate-y-0.5 hover:border-cyan-200/35 hover:bg-white/[0.1]'
                              }`}
                              aria-pressed={active}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div key="step-2" className="lead-step-in space-y-4">
                    <TextInput
                      label="Full Name"
                      value={form.full_name}
                      onChange={(event) => updateField('full_name', event.target.value)}
                      autoComplete="name"
                      placeholder="Your name"
                      required
                    />

                    <TextInput
                      label="Mobile Number"
                      value={form.mobile_number}
                      onChange={(event) => updateField('mobile_number', event.target.value)}
                      autoComplete="tel"
                      inputMode="numeric"
                      pattern="[0-9+ ]{10,14}"
                      placeholder="10 digit number"
                      required
                    />
                  </div>
                )}

                {message && (
                  <div className="rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold leading-6 text-amber-100">
                    {message}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  {step === 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMessage('')
                        setStep(1)
                      }}
                      className="min-h-[3.2rem] w-20 rounded-2xl border border-white/10 bg-white/[0.06] text-sm font-bold text-slate-200 transition duration-200 hover:bg-white/[0.1]"
                    >
                      Back
                    </button>
                  )}

                  {step === 1 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="public-lead-gradient min-h-[3.2rem] flex-1 rounded-2xl px-4 text-sm font-black text-white shadow-[var(--shadow)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105"
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      disabled={saving}
                      className="public-lead-gradient min-h-[3.2rem] flex-1 rounded-2xl px-4 text-sm font-black text-white shadow-[var(--shadow)] transition duration-200 hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      {saving ? 'Submitting...' : 'Get a Call Back'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
