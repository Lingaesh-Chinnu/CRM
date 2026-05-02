import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useSelector } from 'react-redux'

const initialForm = {
  name: '',
  duration_months: '',
  actual_fees: '',
  discount_amount: '',
  is_active: true,
}

function finalFees(actualFees, discountAmount) {
  return Math.max(0, Number(actualFees || 0) - Number(discountAmount || 0))
}

function durationLabel(durationMonths) {
  const months = Number(durationMonths || 0)
  if (!months) return 'Not set'
  return months === 1 ? '1 Month' : `${months} Months`
}

export default function CoursesPage() {
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const [courses, setCourses] = useState([])
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchCourses()
  }, [])

  const fetchCourses = async () => {
    try {
      const { data } = await api.get('/courses/')
      setCourses(data.results || data)
    } finally {
      setLoading(false)
    }
  }

  const createCourse = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await api.post('/courses/', {
        ...form,
        duration_months: Number(form.duration_months || 0),
        actual_fees: Number(form.actual_fees || 0),
        discount_amount: Number(form.discount_amount || 0),
        is_active: form.is_active,
      })
      setForm(initialForm)
      setMessage('Course created successfully.')
      fetchCourses()
    } catch {
      setMessage('Failed to create course.')
    } finally {
      setSaving(false)
    }
  }

  const updateCourseField = (index, field, value) => {
    const next = [...courses]
    next[index] = { ...next[index], [field]: value }
    setCourses(next)
  }

  const saveCourse = async (course) => {
    setMessage('')
    try {
      await api.patch(`/courses/${course.id}/`, {
        name: course.name,
        duration_months: Number(course.duration_months || 0),
        actual_fees: Number(course.actual_fees || 0),
        discount_amount: Number(course.discount_amount || 0),
        is_active: !!course.is_active,
      })
      setMessage(`Updated ${course.name} successfully.`)
      fetchCourses()
    } catch {
      setMessage(`Failed to update ${course.name}.`)
    }
  }

  const deleteCourse = async (course) => {
    const confirmed = window.confirm(`Delete course "${course.name}"?`)
    if (!confirmed) return
    setMessage('')
    try {
      await api.delete(`/courses/${course.id}/`)
      setMessage(`Deleted ${course.name}.`)
      fetchCourses()
    } catch {
      setMessage(`Failed to delete ${course.name}.`)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          {isSuperAdmin ? 'Courses' : 'Course Fees'}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          {isSuperAdmin ? 'Course and fee management' : 'Course Fees'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          {isSuperAdmin
            ? 'Add new courses, control fee structure, apply discounts, and switch courses between active and inactive status.'
            : 'View available courses, actual fees, discounts, final fees, and active status in read-only mode.'}
        </p>
      </section>

      <section className="space-y-6">
        {isSuperAdmin && (
        <form onSubmit={createCourse} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Add course</h2>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Admin
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.7fr]">
            <input
              placeholder="Course name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required
            />
            <input
              placeholder="Duration in months"
              value={form.duration_months}
              onChange={(e) => setForm({ ...form, duration_months: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
            <input
              placeholder="Actual fees"
              value={form.actual_fees}
              onChange={(e) => setForm({ ...form, actual_fees: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
            <input
              placeholder="Discount"
              value={form.discount_amount}
              onChange={(e) => setForm({ ...form, discount_amount: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
            <select
              value={form.is_active ? 'active' : 'inactive'}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="active">Active</option>
              <option value="inactive">In-Active</option>
            </select>
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
              Final Fees: {finalFees(form.actual_fees, form.discount_amount).toLocaleString()}
            </div>
            <button
              disabled={saving}
              className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Creating...' : 'Create Course'}
            </button>
          </div>

          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </form>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Course Catalogue</h2>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {courses.length} Courses
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-sm font-black tracking-[0.24em] text-white">
                CO
              </div>
              <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-950">No courses added yet</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
                Add your first course with fees, discount, final fees, and status to start using the admissions workflow.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1120px]">
                <div className={`grid gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 ${isSuperAdmin ? 'grid-cols-[1.7fr_0.9fr_1fr_1fr_1fr_0.9fr_1fr]' : 'grid-cols-[1.9fr_0.9fr_1fr_1fr_1fr_0.9fr]'}`}>
                  <div>Course</div>
                  <div>Duration</div>
                  <div>Actual Fees</div>
                  <div>Discount</div>
                  <div>Final Fees</div>
                  <div>Status</div>
                  {isSuperAdmin && <div>Actions</div>}
                </div>

                <div className="divide-y divide-slate-200">
                  {courses.map((course, index) => (
                    <div key={course.id} className={`grid gap-4 px-6 py-5 ${isSuperAdmin ? 'grid-cols-[1.7fr_0.9fr_1fr_1fr_1fr_0.9fr_1fr]' : 'grid-cols-[1.9fr_0.9fr_1fr_1fr_1fr_0.9fr]'}`}>
                      <div className="space-y-3">
                        {isSuperAdmin ? (
                          <input
                            value={course.name || ''}
                            onChange={(e) => updateCourseField(index, 'name', e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950"
                          />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-sm font-semibold text-slate-950">{course.name || 'Untitled course'}</p>
                          </div>
                        )}
                      </div>

                      <div>
                        {isSuperAdmin ? (
                          <input
                            value={course.duration_months ?? ''}
                            onChange={(e) => updateCourseField(index, 'duration_months', e.target.value)}
                            placeholder="Months"
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                          />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                            {durationLabel(course.duration_months)}
                          </div>
                        )}
                      </div>

                      <div>
                        {isSuperAdmin ? (
                          <input
                            value={course.actual_fees ?? ''}
                            onChange={(e) => updateCourseField(index, 'actual_fees', e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                          />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                            {Number(course.actual_fees || 0).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div>
                        {isSuperAdmin ? (
                          <input
                            value={course.discount_amount ?? ''}
                            onChange={(e) => updateCourseField(index, 'discount_amount', e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                          />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                            {Number(course.discount_amount || 0).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
                        {finalFees(course.actual_fees, course.discount_amount).toLocaleString()}
                      </div>

                      <div>
                        {isSuperAdmin ? (
                          <select
                            value={course.is_active ? 'active' : 'inactive'}
                            onChange={(e) => updateCourseField(index, 'is_active', e.target.value === 'active')}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">In-Active</option>
                          </select>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                            {course.is_active ? 'Active' : 'In-Active'}
                          </div>
                        )}
                      </div>

                      {isSuperAdmin && (
                        <div className="flex flex-col gap-3">
                          <button
                            onClick={() => saveCourse(course)}
                            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => deleteCourse(course)}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
