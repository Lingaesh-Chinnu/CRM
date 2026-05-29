import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import { OwnerDot } from '../../components/common/CandidateIdentity'
import useDebouncedValue from '../../hooks/useDebouncedValue'

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

function formatDateTimeCompact(dateValue, timeValue = dateValue) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  const time = timeValue ? new Date(timeValue) : null
  return {
    date: date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    }),
    time: time && !Number.isNaN(time.getTime())
      ? time.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '-',
  }
}

function CompactStamp({ dateValue, timeValue }) {
  const stamp = formatDateTimeCompact(dateValue, timeValue)
  if (!stamp) return <span className="text-xs text-slate-400">-</span>
  return (
    <div className="leading-tight">
      <p className="whitespace-nowrap text-sm font-black text-slate-900">{stamp.date}</p>
      <p className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{stamp.time}</p>
    </div>
  )
}

function getStatusLabel(value) {
  if (value === 'pending' || value === 'pending_enrollment' || value === 'pending_rules_form') return 'Pending'
  if (value === 'enrolled' || value === 'active') return 'Active'
  if (value === 'completed') return 'Completed'
  if (value === 'on_hold') return 'Hold'
  if (value === 'inactive') return 'Inactive'
  if (value === 'dropped') return 'Dropped'
  if (value === 'transferred') return 'Transferred'
  return 'Active'
}

function statusSelectValue(value) {
  if (value === 'pending_enrollment' || value === 'pending_rules_form') return 'pending'
  return value === 'enrolled' ? 'active' : value || 'active'
}

function getPaymentLabel(value) {
  if (value === 'paid') return 'Fully Paid'
  if (value === 'partial') return 'Partial'
  if (value === 'unpaid') return 'Pending'
  return 'Payment pending'
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
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
    enrolledFrom: '',
    enrolledTo: '',
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const debouncedSearch = useDebouncedValue(filters.search.trim())

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    loadEnrollments()
  }, [filters.branch, filters.course, filters.status, debouncedSearch, filters.enrolledFrom, filters.enrolledTo, isSuperAdmin])

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
      if (debouncedSearch) {
        params.search = debouncedSearch
      }
      if (filters.enrolledFrom) params.enrolled_from = filters.enrolledFrom
      if (filters.enrolledTo) params.enrolled_to = filters.enrolledTo

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

  const statusCount = (status) => rows.filter((row) => statusSelectValue(row.status) === status).length
  const statusSummary = [
    { label: 'Total', value: '', count: rows.length },
    { label: 'Active', value: 'active', count: statusCount('active') },
    { label: 'Pending', value: 'pending', count: statusCount('pending') },
    { label: 'Completed', value: 'completed', count: statusCount('completed') },
  ]

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
              <option value="pending">Pending</option>
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
              placeholder="Name, phone, enrollment ID, course, counselor"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">From Date</span>
            <input type="date" value={filters.enrolledFrom} onChange={(event) => setFilters((current) => ({ ...current, enrolledFrom: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
          </label>
          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">To Date</span>
            <input type="date" value={filters.enrolledTo} onChange={(event) => setFilters((current) => ({ ...current, enrolledTo: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100" />
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
          <div className="flex flex-wrap items-center justify-end gap-3">
            <StatusFilterChips
              items={statusSummary}
              value={filters.status}
              onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
              className="justify-end"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading students...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No students match the current filters.</div>
        ) : (
          <div className="p-4">
            <CRMTable
              rows={rows}
              columns={[
                { key: 'enrollmentDate', header: 'Enroll Date', width: '68px', className: 'flex items-center', render: (row) => <CompactStamp dateValue={row.enrollment_date || row.created_at} timeValue={row.created_at || row.enrollment_date} /> },
                { key: 'name', header: 'Student', width: 'minmax(155px,1.15fr)', className: 'flex items-center', render: (row) => <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><OwnerDot user={row.counselor_user} /><Link to={`/enrollments/${row.id}`} className="min-w-0 whitespace-normal break-words font-bold leading-5 text-slate-950 hover:text-cyan-700">{row.name}</Link></div><p className="mt-1 truncate text-xs text-slate-500">{row.student_number}</p></div> },
                { key: 'course', header: 'Course', width: 'minmax(120px,0.95fr)', className: 'flex items-center', render: (row) => <span className="overflow-hidden break-words leading-5 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{row.course_name || 'Course pending'}</span> },
                ...(isSuperAdmin ? [{ key: 'branch', header: 'Branch', width: 'minmax(76px,0.65fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.branch_name || 'No branch'}</span> }] : []),
                { key: 'status', header: 'Status', width: '92px', className: 'flex items-center', render: (row) => <StatusBadge tone={statusSelectValue(row.status) === 'active' ? 'green' : 'slate'}>{getStatusLabel(row.status)}</StatusBadge> },
                { key: 'fees', header: 'Fees', width: '82px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{money(row.net_payable_fee || row.final_fees)}</span> },
                { key: 'balance', header: 'Balance', width: '82px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{money(row.payment_balance)}</span> },
                { key: 'counselor', header: 'Counselor', width: 'minmax(88px,0.75fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.counselor_name || '-'}</span> },
              ]}
            />
          </div>
        )}
      </section>
    </div>
  )
}
