import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

function normaliseListResponse(data) {
  return data.results || data
}

function formatDate(value) {
  if (!value) return 'Date not set'

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getStatusLabel(value) {
  if (value === 'enrolled' || value === 'active') return 'Active'
  if (value === 'completed') return 'Completed'
  if (value === 'on_hold') return 'Hold'
  if (value === 'inactive') return 'Inactive'
  if (value === 'dropped') return 'Dropped'
  if (value === 'transferred') return 'Transferred'
  return 'Active'
}

function statusSelectValue(value) {
  return value === 'enrolled' ? 'active' : value || 'active'
}

function getPaymentLabel(value) {
  if (value === 'paid') return 'Fully Paid'
  if (value === 'partial') return 'Partial'
  if (value === 'unpaid') return 'Pending'
  return 'Payment pending'
}

export default function EnrollmentsListPage() {
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [filters, setFilters] = useState({
    branch: '',
    course: '',
    status: '',
    search: '',
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [updatingStudentId, setUpdatingStudentId] = useState(null)
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    loadEnrollments()
  }, [filters.branch, filters.course, filters.status, filters.search, isSuperAdmin])

  const loadFilterOptions = async () => {
    try {
      const [branchesRes, coursesRes] = await Promise.all([
        api.get('/branches/'),
        api.get('/courses/'),
      ])
      setBranches(normaliseListResponse(branchesRes.data))
      setCourses(normaliseListResponse(coursesRes.data))
    } catch {
      setBranches([])
      setCourses([])
    }
  }

  const loadEnrollments = async () => {
    setLoading(true)

    try {
      const params = {}

      if (isSuperAdmin && filters.branch) {
        params.branch = filters.branch
      }
      if (filters.course) {
        params.course = filters.course
      }
      if (filters.status) {
        params.status = filters.status
      }
      if (filters.search.trim()) {
        params.search = filters.search.trim()
      }

      const { data } = await api.get('/enrollments/', { params })
      setRows(normaliseListResponse(data))
      setMessage('')
    } catch (error) {
      setRows([])
      setMessage(apiErrorMessage(error, 'Failed to load enrollments.'))
    } finally {
      setLoading(false)
    }
  }

  const updateStudentField = (studentId, field, value) => {
    setRows((current) =>
      current.map((student) =>
        student.id === studentId ? { ...student, [field]: value } : student
      )
    )
  }

  const saveStudentStatus = async (studentId, status) => {
    setUpdatingStudentId(studentId)

    try {
      await api.patch(`/enrollments/${studentId}/`, { status })
      setMessage('')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to update student status.'))
      await loadEnrollments()
    } finally {
      setUpdatingStudentId(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Enrollments</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Confirmed student enrollments</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          {isSuperAdmin
            ? 'View students across every branch and narrow the list with branch, course, status, and search filters.'
            : 'This page automatically shows students from your branch, with course details and enrollment dates.'}
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-end gap-4">
          {isSuperAdmin && (
            <label className="min-w-[180px] flex-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Branch
              </span>
              <select
                value={filters.branch}
                onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="min-w-[180px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Course
            </span>
            <select
              value={filters.course}
              onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Status
            </span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="on_hold">Hold</option>
              <option value="inactive">Inactive</option>
              <option value="dropped">Dropped</option>
              <option value="transferred">Transferred</option>
            </select>
          </label>

          <label className="min-w-[240px] flex-[1.3]">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Search
            </span>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Student name, phone, number, email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {message && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700">
            {message}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Students</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Student list with course details</h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {rows.length} Students
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading students...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No students match the current filters.</div>
        ) : (
          <>
          <div className="divide-y divide-slate-200 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="space-y-4 px-4 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-lg font-bold tracking-tight text-slate-950">{row.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{row.student_number}</p>
                    <div className="mt-2 text-sm text-slate-700">
                      <PhoneNumberEditor recordType="enrollment" recordId={row.id} phone={row.phone} onSaved={(phone) => updateStudentField(row.id, 'phone', phone)} />
                    </div>
                  </div>
                  <Link
                    to={`/enrollments/${row.id}`}
                    className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    View
                  </Link>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Course</p>
                    <p className="mt-1 font-bold text-slate-900">{row.course_name || 'Course pending'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Enrollment</p>
                    <p className="mt-1 font-bold text-slate-900">{formatDate(row.enrollment_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Branch</p>
                    <p className="mt-1 font-bold text-slate-900">{row.branch_name || 'No branch'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment</p>
                    <p className="mt-1 font-bold text-slate-900">{getPaymentLabel(row.payment_status)}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</p>
                  <select
                    value={statusSelectValue(row.status)}
                    disabled={updatingStudentId === row.id}
                    onChange={async (event) => {
                      const nextStatus = event.target.value
                      updateStudentField(row.id, 'status', nextStatus)
                      await saveStudentStatus(row.id, nextStatus)
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:opacity-60"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">Hold</option>
                    <option value="inactive">Inactive</option>
                    <option value="dropped">Dropped</option>
                    <option value="transferred">Transferred</option>
                  </select>
                  <p className="mt-2 text-xs text-slate-500">{getStatusLabel(row.status)}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[1.25fr_1.05fr_1fr_1fr_1fr_0.95fr_0.75fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <div>Student</div>
                <div>Course</div>
                <div>Enrollment Date</div>
                <div>Branch</div>
                <div>Status</div>
                <div>Payment</div>
                <div>Open</div>
              </div>

              <div className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.25fr_1.05fr_1fr_1fr_1fr_0.95fr_0.75fr] gap-4 px-6 py-5">
                    <div>
                      <p className="text-lg font-bold tracking-tight text-slate-950">{row.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{row.student_number}</p>
                      <div className="mt-2 text-sm text-slate-700">
                        <PhoneNumberEditor recordType="enrollment" recordId={row.id} phone={row.phone} onSaved={(phone) => updateStudentField(row.id, 'phone', phone)} />
                      </div>
                    </div>

                    <div className="text-sm font-medium text-slate-800">
                      {row.course_name || 'Course pending'}
                    </div>

                    <div className="text-sm font-medium text-slate-800">
                      {formatDate(row.enrollment_date)}
                    </div>

                    <div className="text-sm font-medium text-slate-800">
                      {row.branch_name || 'No branch'}
                    </div>

                    <div className="space-y-2">
                      <select
                        value={statusSelectValue(row.status)}
                        disabled={updatingStudentId === row.id}
                        onChange={async (event) => {
                          const nextStatus = event.target.value
                          updateStudentField(row.id, 'status', nextStatus)
                          await saveStudentStatus(row.id, nextStatus)
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:opacity-60"
                      >
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">Hold</option>
                        <option value="inactive">Inactive</option>
                        <option value="dropped">Dropped</option>
                        <option value="transferred">Transferred</option>
                      </select>
                      <p className="text-xs text-slate-500">{getStatusLabel(row.status)}</p>
                    </div>

                    <div className="space-y-1 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{getPaymentLabel(row.payment_status)}</p>
                    </div>

                    <div className="flex items-start">
                      <Link
                        to={`/enrollments/${row.id}`}
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </>
        )}
      </section>
    </div>
  )
}
