import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const branchOrder = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']

const initialForm = {
  name: '',
  value: '',
  apply_to_all_courses: true,
  courses: [],
  apply_to_all_branches: true,
  branches: [],
  valid_from: new Date().toISOString().slice(0, 10),
  valid_to: new Date().toISOString().slice(0, 10),
  is_active: true,
}

function statusClass(status) {
  if (status === 'Active') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (status === 'Expired') return 'bg-amber-50 text-amber-700 ring-amber-100'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

function formatValue(discount) {
  return `Rs ${Number(discount.value || 0).toLocaleString('en-IN')}`
}

function chipNames(names, allLabel) {
  const rows = names?.length ? names : [allLabel]
  if (rows.length <= 3) return rows
  return [...rows.slice(0, 3), `+${rows.length - 3} more`]
}

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState([])
  const [courses, setCourses] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/discounts/'), api.get('/courses/'), api.get('/branches/')]).then(([discountRes, courseRes, branchRes]) => {
      setDiscounts(discountRes.data.results || discountRes.data)
      setCourses((courseRes.data.results || courseRes.data).filter((course) => course.is_active !== false))
      setBranches(
        (branchRes.data.results || branchRes.data)
          .filter((branch) => branch.is_active !== false && branchOrder.includes(branch.name))
          .sort((a, b) => branchOrder.indexOf(a.name) - branchOrder.indexOf(b.name))
      )
      setLoading(false)
    })
  }, [])

  const fetchDiscounts = async () => {
    const { data } = await api.get('/discounts/')
    setDiscounts(data.results || data)
  }

  const toggleFormCourse = (courseId) => {
    const id = Number(courseId)
    setForm((current) => ({
      ...current,
      courses: current.courses.includes(id) ? current.courses.filter((course) => course !== id) : [...current.courses, id],
    }))
  }

  const toggleFormBranch = (branchId) => {
    const id = Number(branchId)
    setForm((current) => ({
      ...current,
      apply_to_all_branches: false,
      branches: current.branches.includes(id) ? current.branches.filter((branch) => branch !== id) : [...current.branches, id],
    }))
  }

  const updateDiscountField = (index, field, value) => {
    const next = [...discounts]
    next[index] = { ...next[index], [field]: value }
    setDiscounts(next)
  }

  const toggleDiscountBranch = (index, branchId) => {
    const id = Number(branchId)
    const next = [...discounts]
    const currentBranches = next[index].branches || []
    next[index] = {
      ...next[index],
      apply_to_all_branches: false,
      branches: currentBranches.includes(id)
        ? currentBranches.filter((branch) => branch !== id)
        : [...currentBranches, id],
    }
    setDiscounts(next)
  }

  const discountPayload = (discount) => ({
    name: discount.name,
    discount_type: 'fixed',
    value: Number(discount.value || 0),
    apply_to_all_courses: !!discount.apply_to_all_courses,
    courses: discount.apply_to_all_courses ? [] : discount.courses,
    apply_to_all_branches: !!discount.apply_to_all_branches,
    branches: discount.apply_to_all_branches ? [] : discount.branches,
    valid_from: discount.valid_from,
    valid_to: discount.valid_to,
    is_active: !!discount.is_active,
  })

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    if (!form.apply_to_all_courses && form.courses.length === 0) {
      setMessage('Please select at least one course or apply to all courses.')
      setSaving(false)
      return
    }
    if (!form.apply_to_all_branches && form.branches.length === 0) {
      setMessage('Please select at least one branch or apply to all branches.')
      setSaving(false)
      return
    }
    try {
      await api.post('/discounts/', discountPayload(form))
      setForm(initialForm)
      setMessage('Discount created successfully.')
      fetchDiscounts()
    } catch (error) {
      setMessage(error.response?.data ? JSON.stringify(error.response.data) : 'Failed to create discount.')
    } finally {
      setSaving(false)
    }
  }

  const saveDiscount = async (discount) => {
    setMessage('')
    if (!discount.apply_to_all_branches && !discount.branches?.length) {
      setMessage('Please select at least one branch or All Branches.')
      return
    }
    try {
      await api.patch(`/discounts/${discount.id}/`, discountPayload(discount))
      setMessage(`Updated ${discount.name}.`)
      fetchDiscounts()
    } catch (error) {
      setMessage(error.response?.data ? JSON.stringify(error.response.data) : `Failed to update ${discount.name}.`)
    }
  }

  const deleteDiscount = async (discount) => {
    if (!window.confirm(`Delete discount "${discount.name}"?`)) return
    setMessage('')
    try {
      await api.delete(`/discounts/${discount.id}/`)
      setMessage(`Deleted ${discount.name}.`)
      fetchDiscounts()
    } catch {
      setMessage(`Failed to delete ${discount.name}.`)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Discounts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Create time-bound discounts for selected courses and branches. Expired discounts remain visible for history.
        </p>
      </section>

      <form onSubmit={submit} className="max-w-full overflow-visible rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        <h2 className="text-xl font-black tracking-tight text-slate-950">Add discount</h2>
        <div className="mt-5 grid max-w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Discount name" className="w-full max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          <input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="Discount Amount" className="w-full max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          <input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} className="w-full max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          <input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} className="w-full max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required />
          <select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })} className="w-full max-w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="mt-5 grid max-w-full grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="max-w-full overflow-visible rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setForm({ ...form, apply_to_all_courses: true, courses: [] })} className={`w-full max-w-full rounded-full px-4 py-2.5 text-sm font-semibold ${form.apply_to_all_courses ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>All Courses</button>
              <button type="button" onClick={() => setForm({ ...form, apply_to_all_courses: false })} className={`w-full max-w-full rounded-full px-4 py-2.5 text-sm font-semibold ${!form.apply_to_all_courses ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>Specific Courses</button>
            </div>
            {!form.apply_to_all_courses && (
              <div className="mt-4 grid max-w-full grid-cols-1 gap-2 overflow-visible md:grid-cols-2">
                {courses.map((course) => (
                  <label key={course.id} className="flex min-w-0 items-start gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-700 ring-1 ring-slate-200">
                    <input type="checkbox" checked={form.courses.includes(course.id)} onChange={() => toggleFormCourse(course.id)} className="mt-0.5 h-4 w-4 flex-none accent-slate-950" />
                    <span className="min-w-0 break-words">{course.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="max-w-full overflow-visible rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                <input type="checkbox" checked={form.apply_to_all_branches} onChange={(e) => setForm({ ...form, apply_to_all_branches: e.target.checked, branches: e.target.checked ? [] : form.branches })} className="h-4 w-4 flex-none accent-slate-950" />
                <span className="min-w-0 break-words">All Branches</span>
              </label>
              {branches.map((branch) => (
                <label key={branch.id} className="flex min-w-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                  <input type="checkbox" checked={!form.apply_to_all_branches && form.branches.includes(branch.id)} disabled={form.apply_to_all_branches} onChange={() => toggleFormBranch(branch.id)} className="h-4 w-4 flex-none accent-slate-950 disabled:opacity-50" />
                  <span className="min-w-0 break-words">{branch.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex max-w-full flex-col gap-3 sm:items-start">
          <button disabled={saving} className="w-full rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 sm:w-auto">
            {saving ? 'Creating...' : 'Create Discount'}
          </button>
          {message && <p className="max-w-full break-words text-sm text-slate-600">{message}</p>}
        </div>
      </form>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Discount List</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{discounts.length} Total</span>
        </div>
        {loading ? (
          <div className="p-6 text-slate-500">Loading discounts...</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[1.25fr_0.8fr_1.35fr_1.45fr_0.85fr_0.85fr_0.75fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <div>Discount Name</div>
                <div>Value</div>
                <div>Selected Courses</div>
                <div>Branches</div>
                <div>From Date</div>
                <div>Till Date</div>
                <div>Status</div>
                <div>Actions</div>
              </div>

              <div className="divide-y divide-slate-200">
                {discounts.map((discount, index) => (
                  <div key={discount.id} className="grid grid-cols-[1.25fr_0.8fr_1.35fr_1.45fr_0.85fr_0.85fr_0.75fr_0.8fr] gap-4 px-6 py-4 text-sm">
                    <div className="font-bold text-slate-950">{discount.name}</div>
                    <div className="font-semibold text-slate-950">{formatValue(discount)}</div>
                    <div className="flex flex-wrap gap-2">
                      {chipNames(discount.course_names, 'All Courses').map((name) => (
                        <span key={name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{name}</span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <input type="checkbox" checked={discount.apply_to_all_branches} onChange={(e) => updateDiscountField(index, 'apply_to_all_branches', e.target.checked)} className="h-3.5 w-3.5 accent-slate-950" />
                        All Branches
                      </label>
                      {branches.map((branch) => (
                        <label key={branch.id} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                          <input type="checkbox" checked={!discount.apply_to_all_branches && (discount.branches || []).includes(branch.id)} disabled={discount.apply_to_all_branches} onChange={() => toggleDiscountBranch(index, branch.id)} className="h-3.5 w-3.5 accent-slate-950 disabled:opacity-50" />
                          {branch.name}
                        </label>
                      ))}
                    </div>
                    <input type="date" value={discount.valid_from || ''} onChange={(e) => updateDiscountField(index, 'valid_from', e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
                    <input type="date" value={discount.valid_to || ''} onChange={(e) => updateDiscountField(index, 'valid_to', e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
                    <div className="space-y-2">
                      <select value={discount.is_active ? 'active' : 'inactive'} onChange={(e) => updateDiscountField(index, 'is_active', e.target.value === 'active')} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass(discount.status_label)}`}>{discount.status_label}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => saveDiscount(discount)} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Save</button>
                      <button type="button" onClick={() => deleteDiscount(discount)} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
