import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

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
  source: 'manual',
  source_description: '',
  transfer_to: '',
  qualification: '',
  degree: '',
  counselor_status: 'new_lead',
  competitor_status: '',
  follow_up_priority: '',
  conversion_probability: '',
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
  return <label className="mb-2 block text-sm font-semibold text-slate-600">{children}</label>
}

export default function LeadCreatePage() {
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [transferUsers, setTransferUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [duplicateInfo, setDuplicateInfo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    Promise.all([
      api.get('/courses/'),
      isSuperAdmin ? api.get('/branches/') : Promise.resolve({ data: [] }),
    ]).then(([coursesRes, branchesRes]) => {
      setCourses(coursesRes.data.results || coursesRes.data)
      setBranches(branchesRes.data.results || branchesRes.data)
    }).catch(() => {})
  }, [isSuperAdmin])

  useEffect(() => {
    api.get('/leads/transfer-options/')
      .then(({ data }) => setTransferUsers(data || []))
      .catch(() => setTransferUsers([]))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')

    const remarks = [
      form.remarks.trim(),
    ].filter(Boolean).join('\n\n')

    const payload = {
      name: form.name,
      phone: form.phone,
      course: form.course ? Number(form.course) : null,
      source: form.source || 'manual',
      source_description: form.source_description.trim(),
      transfer_to: form.transfer_to ? Number(form.transfer_to) : null,
      qualification: form.qualification.trim(),
      degree: form.degree.trim(),
      counselor_status: form.counselor_status,
      competitor_status: form.competitor_status,
      follow_up_priority: form.follow_up_priority,
      conversion_probability: form.conversion_probability,
      branch: isSuperAdmin ? Number(form.branch) || null : null,
      next_follow_up_date: form.next_follow_up_date || null,
      remarks,
    }

    try {
      const { data } = await api.post('/leads/', payload)
      navigate(`/leads/${data.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create lead.'))
    } finally {
      setSaving(false)
    }
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
            >
              <option value="manual">Manual</option>
              <option value="google">Google</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="justdial">JustDial</option>
              <option value="team_reference">Team Reference</option>
              <option value="friends_reference">Friends Reference</option>
              <option value="others">Others</option>
            </select>
          </div>

          <div>
            <FieldLabel>Source Description</FieldLabel>
            <input
              value={form.source_description}
              onChange={(e) => setForm({ ...form, source_description: e.target.value })}
              placeholder="Instagram Reel, Meta Ad Campaign, Referral Details"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>

          <div>
            <FieldLabel>Transfer To</FieldLabel>
            <select
              value={form.transfer_to}
              onChange={(e) => setForm({ ...form, transfer_to: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <option value="">Keep with me</option>
              {transferUsers.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}{staff.branch_name ? ` - ${staff.branch_name}` : ''}
                </option>
              ))}
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
            <FieldLabel>Counselor Status</FieldLabel>
            <select value={form.counselor_status} onChange={(e) => setForm({ ...form, counselor_status: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select status</option>
              {counselorStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>Competitor Status</FieldLabel>
            <select value={form.competitor_status} onChange={(e) => setForm({ ...form, competitor_status: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select competitor status</option>
              {competitorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>Follow-up Priority</FieldLabel>
            <select value={form.follow_up_priority} onChange={(e) => setForm({ ...form, follow_up_priority: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select priority</option>
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div>
            <FieldLabel>Conversion Probability</FieldLabel>
            <select value={form.conversion_probability} onChange={(e) => setForm({ ...form, conversion_probability: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <option value="">Select probability</option>
              {probabilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
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

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}

        <button
          disabled={saving}
          className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Lead'}
        </button>
      </form>
    </div>
  )
}
