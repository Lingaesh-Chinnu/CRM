import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

function appHref(url) {
  if (!url || url === '#') return '#'
  if (/^(https?:)?\/\//i.test(url)) return url
  if (!url.startsWith('/')) return url
  return `${appBasePath}${url}`
}

const initialForm = {
  name: '',
  phone: '',
  branch: '',
  course: '',
  source: '',
  qualification: '',
  degree: '',
  next_follow_up_date: '',
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
  return <label className="mb-2 block text-sm font-semibold text-slate-600">{children}</label>
}

export default function LeadCreatePage() {
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [duplicateInfo, setDuplicateInfo] = useState(null)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    Promise.all([
      api.get('/courses/'),
      isSuperAdmin ? api.get('/branches/') : Promise.resolve({ data: [] }),
    ]).then(([coursesRes, branchesRes]) => {
      setCourses(coursesRes.data.results || coursesRes.data)
      setBranches(branchesRes.data.results || branchesRes.data)
    })
  }, [isSuperAdmin])

  const submit = async (e) => {
    e.preventDefault()

    const remarks = [
      form.remarks.trim(),
    ].filter(Boolean).join('\n\n')

    const payload = {
      name: form.name,
      phone: form.phone,
      course: form.course ? Number(form.course) : null,
      status: 'new',
      source: form.source,
      qualification: form.qualification.trim(),
      degree: form.degree.trim(),
      branch: isSuperAdmin ? Number(form.branch) || null : user?.branch || null,
      next_follow_up_date: form.next_follow_up_date || null,
      remarks,
    }

    const { data } = await api.post('/leads/', payload)
    navigate(`/leads/${data.id}`)
  }

  const checkDuplicate = async () => {
    if (!form.phone.trim()) return
    const { data } = await api.get('/leads/duplicate-check/', { params: { phone: form.phone.trim() } })
    setDuplicateInfo(data.duplicate ? data : null)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Create new lead</h1>
      </section>

      <form onSubmit={submit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Full Name</FieldLabel>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>

          <div>
            <FieldLabel>Phone Number</FieldLabel>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              onBlur={checkDuplicate}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            />
          </div>

          <div>
            <FieldLabel>Course Interested</FieldLabel>
            <select
              value={form.course}
              onChange={(e) => setForm({ ...form, course: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="" disabled>Select course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>

          {isSuperAdmin ? (
            <div>
              <FieldLabel>Branch</FieldLabel>
              <select
                value={form.branch}
                onChange={(e) => setForm({ ...form, branch: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              >
                <option value="" disabled>Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <FieldLabel>Branch</FieldLabel>
              <input
                value={user?.branch_name || 'No branch assigned'}
                readOnly
                className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-700"
              />
            </div>
          )}

          <div>
            <FieldLabel>Source</FieldLabel>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="" disabled>Select source</option>
              <option value="google">Google</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="whatsapp">Whatsapp</option>
              <option value="justdial">JustDial</option>
              <option value="team_reference">Team Reference</option>
              <option value="friends_reference">Friends Reference</option>
              <option value="others">Others</option>
            </select>
          </div>

          <div>
            <FieldLabel>Qualification</FieldLabel>
            <select
              value={form.qualification}
              onChange={(e) => setForm({ ...form, qualification: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">Select qualification</option>
              {qualificationOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel>Degree</FieldLabel>
            <input
              placeholder="Example: BCA, B.Com, BE CSE, MBA"
              value={form.degree}
              onChange={(e) => setForm({ ...form, degree: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>

          <div>
            <FieldLabel>Next Follow-up Date</FieldLabel>
            <input
              type="date"
              value={form.next_follow_up_date}
              onChange={(e) => setForm({ ...form, next_follow_up_date: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>

          <div className="md:col-span-2">
            <FieldLabel>Remarks</FieldLabel>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>
        </div>

        {duplicateInfo && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">Duplicate lead found</p>
            <div className="mt-3 space-y-2">
              {duplicateInfo.records.map((record) => (
                <div key={`${record.type}-${record.id}`} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold text-slate-900">{record.type}: {record.name} | {record.branch_name} | {record.status}</span>
                  <a href={appHref(record.url)} className="text-sm font-semibold text-slate-700 hover:text-slate-950">Merge/Update existing</a>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setForm(initialForm)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-white">Ignore new lead</button>
              <button type="button" onClick={() => setDuplicateInfo(null)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Create anyway</button>
            </div>
          </div>
        )}

        <button className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
          Save Lead
        </button>
      </form>
    </div>
  )
}
