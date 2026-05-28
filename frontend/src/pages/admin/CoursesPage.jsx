import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'

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

function money(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function apiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback
}

export default function CoursesPage() {
  const location = useLocation()
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const canManageCourses = isSuperAdmin && location.pathname.startsWith('/admin/courses')
  const [courses, setCourses] = useState([])
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [courseSearch, setCourseSearch] = useState('')

  const normalizedCourseSearch = courseSearch.trim().toLowerCase()
  const visibleCourses = normalizedCourseSearch
    ? courses.filter((course) => (course.name || '').toLowerCase().includes(normalizedCourseSearch))
    : courses

  useEffect(() => {
    fetchCourses()
  }, [canManageCourses])

  const fetchCourses = async () => {
    setLoading(true)
    try {
      const params = canManageCourses ? { include_inactive: 1 } : {}
      const { data } = await api.get('/courses/', { params })
      setCourses(data.results || data)
    } finally {
      setLoading(false)
    }
  }

  const createCourse = async (e) => {
    e.preventDefault()
    if (!canManageCourses) return
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
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to create course.'))
    } finally {
      setSaving(false)
    }
  }

  const updateCourseField = (courseId, field, value) => {
    setCourses((currentCourses) =>
      currentCourses.map((course) => (
        course.id === courseId ? { ...course, [field]: value } : course
      )),
    )
  }

  const saveCourse = async (course) => {
    if (!canManageCourses) return
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
    } catch (error) {
      setMessage(apiErrorMessage(error, `Failed to update ${course.name}.`))
    }
  }

  const deleteCourse = async (course) => {
    if (!canManageCourses || !course.can_delete) return
    const confirmed = window.confirm(`Delete course "${course.name}"?`)
    if (!confirmed) return
    setMessage('')
    try {
      await api.delete(`/courses/${course.id}/`)
      setMessage(`Deleted ${course.name}.`)
      fetchCourses()
    } catch (error) {
      setMessage(apiErrorMessage(error, `Failed to delete ${course.name}.`))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          {canManageCourses ? 'Courses' : 'Course Fees'}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          {canManageCourses ? 'Course management' : 'Course Fees'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          {canManageCourses
            ? 'Create courses, update fee structure, and switch courses between active and inactive status.'
            : 'View course name, duration, actual fees, discounts, final fees, and status.'}
        </p>
      </section>

      <section className="space-y-6">
        {canManageCourses && (
          <form onSubmit={createCourse} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-tight text-slate-950">Add course</h2>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Admin
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.7fr]">
              <input placeholder="Course name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" required />
              <input placeholder="Duration in months" value={form.duration_months} onChange={(e) => setForm({ ...form, duration_months: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
              <input placeholder="Actual fees" value={form.actual_fees} onChange={(e) => setForm({ ...form, actual_fees: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
              <input placeholder="Discount" value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: e.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
              <select value={form.is_active ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
                Final Fees: {money(finalFees(form.actual_fees, form.discount_amount))}
              </div>
              <button disabled={saving} className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-950 px-8 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                {saving ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </form>
        )}

        {message && <p className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700">{message}</p>}

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">{canManageCourses ? 'Course Catalogue' : 'Course Fee Catalogue'}</h2>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {visibleCourses.length} Courses
              </div>
            </div>
          </div>

          {!canManageCourses && (
            <div className="border-b border-slate-200 px-6 py-5">
              <label htmlFor="course-fee-search" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Search Course
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  id="course-fee-search"
                  type="search"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  placeholder="Search by course name"
                  className="min-h-[48px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
                {courseSearch && (
                  <button
                    type="button"
                    onClick={() => setCourseSearch('')}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-6 text-slate-500">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-sm font-black tracking-[0.24em] text-white">CO</div>
              <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-950">No courses available</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Active courses will appear here after they are added from the Courses page.</p>
            </div>
          ) : visibleCourses.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-sm font-black tracking-[0.24em] text-white">CO</div>
              <h3 className="mt-6 text-2xl font-black tracking-tight text-slate-950">No matching courses</h3>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Try another course name or clear the search.</p>
            </div>
          ) : (
            <>
            {!canManageCourses && (
              <div className="grid gap-3 p-4 md:hidden">
                {visibleCourses.map((course) => (
                  <article key={course.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-black tracking-tight text-slate-950">{course.name || 'Untitled course'}</h3>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                        {course.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Duration</p>
                        <p className="mt-1 font-bold text-slate-900">{durationLabel(course.duration_months)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Actual Fees</p>
                        <p className="mt-1 font-bold text-slate-900">{money(course.actual_fees)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Discount</p>
                        <p className="mt-1 font-bold text-slate-900">{money(course.discount_amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Final Fees</p>
                        <p className="mt-1 font-bold text-slate-950">{money(finalFees(course.actual_fees, course.discount_amount))}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className={`${!canManageCourses ? 'hidden md:block' : ''} overflow-x-auto`}>
              <div className="min-w-[1120px]">
                <div className={`grid gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 ${canManageCourses ? 'grid-cols-[1.7fr_0.9fr_1fr_1fr_1fr_0.9fr_1fr]' : 'grid-cols-[1.9fr_0.9fr_1fr_1fr_1fr_0.9fr]'}`}>
                  <div>Course</div>
                  <div>Duration</div>
                  <div>Actual Fees</div>
                  <div>Discount</div>
                  <div>Final Fees</div>
                  <div>Status</div>
                  {canManageCourses && <div>Actions</div>}
                </div>

                <div className="divide-y divide-slate-200">
                  {visibleCourses.map((course) => (
                    <div key={course.id} className={`grid gap-4 px-6 py-5 ${canManageCourses ? 'grid-cols-[1.7fr_0.9fr_1fr_1fr_1fr_0.9fr_1fr]' : 'grid-cols-[1.9fr_0.9fr_1fr_1fr_1fr_0.9fr]'}`}>
                      <div>
                        {canManageCourses ? (
                          <input value={course.name || ''} onChange={(e) => updateCourseField(course.id, 'name', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950" />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-sm font-semibold text-slate-950">{course.name || 'Untitled course'}</p>
                          </div>
                        )}
                      </div>

                      <div>
                        {canManageCourses ? (
                          <input value={course.duration_months ?? ''} onChange={(e) => updateCourseField(course.id, 'duration_months', e.target.value)} placeholder="Months" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{durationLabel(course.duration_months)}</div>
                        )}
                      </div>

                      <div>
                        {canManageCourses ? (
                          <input value={course.actual_fees ?? ''} onChange={(e) => updateCourseField(course.id, 'actual_fees', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{money(course.actual_fees)}</div>
                        )}
                      </div>

                      <div>
                        {canManageCourses ? (
                          <input value={course.discount_amount ?? ''} onChange={(e) => updateCourseField(course.id, 'discount_amount', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{money(course.discount_amount)}</div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">{money(finalFees(course.actual_fees, course.discount_amount))}</div>

                      <div>
                        {canManageCourses ? (
                          <select value={course.is_active ? 'active' : 'inactive'} onChange={(e) => updateCourseField(course.id, 'is_active', e.target.value === 'active')} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">{course.is_active ? 'Active' : 'Inactive'}</div>
                        )}
                      </div>

                      {canManageCourses && (
                        <div className="flex flex-col gap-3">
                          <button type="button" onClick={() => saveCourse(course)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">Save</button>
                          <button
                            type="button"
                            onClick={() => deleteCourse(course)}
                            disabled={!course.can_delete}
                            title={!course.can_delete ? 'Cannot delete course linked to existing records.' : ''}
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
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
            </>
          )}
        </section>
      </section>
    </div>
  )
}
