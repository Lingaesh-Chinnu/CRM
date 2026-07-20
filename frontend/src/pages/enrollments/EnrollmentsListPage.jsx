import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import PaginationControls from '../../components/common/PaginationControls'
import { OwnerDot } from '../../components/common/CandidateIdentity'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import { currentReturnTo, withReturnTo } from '../../utils/returnNavigation'

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

function formatDateCompact(dateValue) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

function CompactStamp({ dateValue }) {
  const date = formatDateCompact(dateValue)
  if (!date) return <span className="text-xs text-slate-400">-</span>
  return (
    <div className="leading-tight">
      <p className="whitespace-nowrap text-sm font-black text-slate-900">{date}</p>
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

function queueStatusLabel(value) {
  if (!value) return 'Pending'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function growthMeta(current, previous) {
  const currentValue = Number(current || 0)
  const previousValue = Number(previous || 0)
  if (previousValue === 0) {
    if (currentValue > 0) return { label: 'New', tone: 'text-emerald-700 bg-emerald-50' }
    return { label: '0%', tone: 'text-slate-500 bg-slate-100' }
  }
  const percent = ((currentValue - previousValue) / previousValue) * 100
  if (percent > 0) return { label: `↑ +${Math.round(percent)}%`, tone: 'text-emerald-700 bg-emerald-50' }
  if (percent < 0) return { label: `↓ ${Math.round(percent)}%`, tone: 'text-rose-700 bg-rose-50' }
  return { label: '0%', tone: 'text-slate-500 bg-slate-100' }
}

function SummaryCard({ label, value, current, previous }) {
  const growth = growthMeta(current, previous)
  return (
    <article className="relative rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <span className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-xs font-black ${growth.tone}`}>
        {growth.label}
      </span>
      <p className="pr-20 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
    </article>
  )
}

function AdminNotesCell({ row, onSave, saving }) {
  const [value, setValue] = useState(row.admin_notes || '')

  useEffect(() => {
    setValue(row.admin_notes || '')
  }, [row.id, row.admin_notes])

  const saveIfChanged = () => {
    if (value !== (row.admin_notes || '')) {
      onSave(row, value)
    }
  }

  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={saveIfChanged}
        rows={2}
        placeholder="Add note"
        className="min-h-[44px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
      {saving && <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Saving</p>}
    </div>
  )
}

function isoDate(value) {
  return value.toISOString().slice(0, 10)
}

function monthBounds(offset = 0) {
  const date = new Date()
  const start = new Date(date.getFullYear(), date.getMonth() + offset, 1)
  const end = new Date(date.getFullYear(), date.getMonth() + offset + 1, 0)
  return {
    from: isoDate(start),
    to: isoDate(end),
  }
}

const thisMonthRange = monthBounds()
const lastMonthRange = monthBounds(-1)

const enrollmentSourceOptions = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'website', label: 'Website' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'direct', label: 'Direct Walk-in' },
  { value: 'student_reference', label: 'Student Reference' },
  { value: 'friends_reference', label: 'Friends Reference' },
  { value: 'staff_reference', label: 'Staff Reference' },
  { value: 'lead_conversion', label: 'Lead Conversion' },
  { value: 'others', label: 'Other' },
]
const PAGE_SIZE = 100

export default function EnrollmentsListPage({ queue = 'enrolled' }) {
  const isYetToEnroll = queue === 'yet_to_enroll'
  const [rows, setRows] = useState([])
  const [metricRows, setMetricRows] = useState([])
  const [previousMetricRows, setPreviousMetricRows] = useState([])
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [counselors, setCounselors] = useState([])
  const [filters, setFilters] = useState({
    branch: '',
    course: '',
    counselor: '',
    status: '',
    source: '',
    date_from: '',
    date_to: '',
    search: '',
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [savingNotes, setSavingNotes] = useState({})
  const location = useLocation()
  const returnTo = currentReturnTo(location)
  const navigationMessage = location.state?.message || ''
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const debouncedSearch = useDebouncedValue(filters.search.trim())

  useEffect(() => {
    if (location.state?.listFilters) {
      setFilters((current) => ({ ...current, ...location.state.listFilters }))
    }
  }, [location.state])

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    loadEnrollments()
  }, [filters.branch, filters.course, filters.counselor, filters.status, filters.source, filters.date_from, filters.date_to, debouncedSearch, isSuperAdmin, queue, page])

  useEffect(() => {
    setPage(1)
  }, [filters.branch, filters.course, filters.counselor, filters.status, filters.source, filters.date_from, filters.date_to, debouncedSearch, isSuperAdmin, queue])

  const loadFilterOptions = async () => {
    try {
      const [branchesRes, coursesRes, usersRes] = await Promise.all([
        api.get('/branches/'),
        api.get('/courses/'),
        api.get('/walkins/staff-options/'),
      ])
      setBranches(normaliseListResponse(branchesRes.data))
      setCourses(normaliseListResponse(coursesRes.data))
      setCounselors(normaliseListResponse(usersRes.data))
    } catch {
      setBranches([])
      setCourses([])
      setCounselors([])
    }
  }

  const loadEnrollments = async () => {
    setLoading(true)

    try {
      const baseParams = { queue }

      if (isSuperAdmin && filters.branch) {
        baseParams.branch = filters.branch
      }
      if (filters.course) {
        baseParams.course = filters.course
      }
      if (filters.counselor) {
        baseParams.counselor = filters.counselor
      }
      if (filters.status) {
        baseParams.status = filters.status
      }
      if (filters.source) {
        baseParams.source = filters.source
      }
      if (filters.date_from) {
        baseParams.date_from = filters.date_from
      }
      if (filters.date_to) {
        baseParams.date_to = filters.date_to
      }
      if (debouncedSearch) {
        baseParams.search = debouncedSearch
      }
      const rowParams = { ...baseParams, page, page_size: PAGE_SIZE }
      const [rowsRes, currentMetricsRes, previousMetricsRes] = await Promise.all([
        api.get('/enrollments/', { params: rowParams }),
        isYetToEnroll ? Promise.resolve({ data: [] }) : api.get('/enrollments/', { params: { ...baseParams, enrolled_from: thisMonthRange.from, enrolled_to: thisMonthRange.to } }),
        isYetToEnroll ? Promise.resolve({ data: [] }) : api.get('/enrollments/', { params: { ...baseParams, enrolled_from: lastMonthRange.from, enrolled_to: lastMonthRange.to } }),
      ])
      setRows(normaliseListResponse(rowsRes.data))
      setTotalCount(rowsRes.data.count ?? normaliseListResponse(rowsRes.data).length)
      setMetricRows(normaliseListResponse(currentMetricsRes.data))
      setPreviousMetricRows(normaliseListResponse(previousMetricsRes.data))
      setMessage('')
    } catch (error) {
      setRows([])
      setTotalCount(0)
      setMetricRows([])
      setPreviousMetricRows([])
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
  const currentMonthEnrollmentCount = metricRows.length
  const previousMonthEnrollmentCount = previousMetricRows.length
  const totalRevenue = metricRows.reduce((sum, row) => sum + Number(row.net_payable_fee || row.final_fees || 0), 0)
  const previousRevenue = previousMetricRows.reduce((sum, row) => sum + Number(row.net_payable_fee || row.final_fees || 0), 0)
  const totalPendingBalance = rows.reduce((sum, row) => sum + Number(row.payment_balance || 0), 0)

  const saveAdminNotes = async (row, adminNotes) => {
    setSavingNotes((current) => ({ ...current, [row.id]: true }))
    try {
      const response = await api.patch(`/enrollments/${row.id}/admin-notes/`, { admin_notes: adminNotes })
      const savedNotes = response.data.admin_notes ?? adminNotes
      setRows((current) => current.map((item) => (
        item.id === row.id ? { ...item, admin_notes: savedNotes } : item
      )))
      setMessage('')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to save admin notes.'))
    } finally {
      setSavingNotes((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Enrollments</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{isYetToEnroll ? 'Yet To Enroll' : 'Enrolled Student'}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          {isYetToEnroll
            ? 'Candidates converted to enrollment who are waiting for Rules & Regulations completion and final enrollment confirmation.'
            : isSuperAdmin
            ? 'Manage enrolled students across every branch and narrow the operational list with branch, course, status, and search filters.'
            : 'Manage enrolled students from your branch with course details, enrollment dates, and current workflow status.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/enrollments/yet-to-enroll" className={`rounded-2xl px-4 py-2 text-sm font-semibold ${isYetToEnroll ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700'}`}>Yet To Enroll</Link>
          <Link to="/enrollments" className={`rounded-2xl px-4 py-2 text-sm font-semibold ${!isYetToEnroll ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700'}`}>Enrolled</Link>
        </div>
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

          <label className="min-w-[180px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Counselor
            </span>
            <select
              value={filters.counselor}
              onChange={(event) => setFilters((current) => ({ ...current, counselor: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All counselors</option>
              {counselors.map((counselor) => (
                <option key={counselor.id} value={counselor.id}>
                  {counselor.name}{counselor.branch_name ? ` - ${counselor.branch_name}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[180px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Source
            </span>
            <select
              value={filters.source}
              onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All sources</option>
              {enrollmentSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              From Date
            </span>
            <input
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>

          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              To Date
            </span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>

          {!isYetToEnroll && <label className="min-w-[160px] flex-1">
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
              <option value="enrolled">Enrolled</option>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="pending_rules_form">Pending Rules Form</option>
              <option value="rules_form_sent">Rules Form Sent</option>
              <option value="rules_form_submitted">Rules Form Submitted</option>
              <option value="completed">Completed</option>
              <option value="on_hold">Hold</option>
              <option value="inactive">Inactive</option>
              <option value="dropped">Dropped</option>
              <option value="transferred">Transferred</option>
            </select>
          </label>}

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
        </div>
      </section>

      {!isYetToEnroll && <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Total Enrollments"
          value={currentMonthEnrollmentCount}
          current={currentMonthEnrollmentCount}
          previous={previousMonthEnrollmentCount}
        />
        <SummaryCard
          label="Revenue Generated"
          value={money(totalRevenue)}
          current={totalRevenue}
          previous={previousRevenue}
        />
        <SummaryCard
          label="Total Pending Balance"
          value={money(totalPendingBalance)}
          current={totalPendingBalance}
          previous={totalPendingBalance}
        />
      </section>}

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {(navigationMessage || message) && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700">
            {navigationMessage || message}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{isYetToEnroll ? 'Enrollment Queue' : 'Enrolled Students'}</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">{isYetToEnroll ? 'Candidates waiting for final enrollment' : 'Candidates enrollment list with course details'}</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {!isYetToEnroll && <StatusFilterChips
              items={statusSummary}
              value={filters.status}
              onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
              className="justify-end"
            />}
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
                { key: 'enrollmentDate', header: 'Enroll Date', width: '68px', className: 'flex items-center', render: (row) => <CompactStamp dateValue={row.enrollment_date || row.created_at} /> },
                { key: 'name', header: 'Student', width: 'minmax(155px,1.15fr)', className: 'flex items-center', render: (row) => <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><OwnerDot user={row.counselor_user} /><Link to={withReturnTo(`/enrollments/${row.id}`, returnTo)} state={{ returnTo, listFilters: filters }} className="min-w-0 whitespace-normal break-words font-bold leading-5 text-slate-950 hover:text-cyan-700">{row.name}</Link></div><p className="mt-1 truncate text-xs text-slate-500">{row.student_number}</p></div> },
                { key: 'course', header: 'Course', width: 'minmax(120px,0.95fr)', className: 'flex items-center', render: (row) => <span className="overflow-hidden break-words leading-5 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{row.course_name || 'Course pending'}</span> },
                ...(isSuperAdmin ? [{ key: 'branch', header: 'Branch', width: 'minmax(76px,0.65fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.branch_name || 'No branch'}</span> }] : []),
                ...(isYetToEnroll ? [
                  { key: 'rules', header: 'Rules Form', width: '110px', className: 'flex items-center', render: (row) => <StatusBadge tone={row.rules_signing_status === 'submitted' ? 'green' : 'slate'}>{queueStatusLabel(row.rules_signing_status)}</StatusBadge> },
                  { key: 'schedule', header: 'Payment Schedule', width: '125px', className: 'flex items-center', render: (row) => <StatusBadge tone={row.payment_schedule_status === 'locked' || row.payment_schedule_status === 'saved' ? 'green' : 'slate'}>{queueStatusLabel(row.payment_schedule_status)}</StatusBadge> },
                ] : [
                  { key: 'status', header: 'Status', width: '92px', className: 'flex items-center', render: (row) => <StatusBadge tone={statusSelectValue(row.status) === 'active' ? 'green' : 'slate'}>{getStatusLabel(row.status)}</StatusBadge> },
                  { key: 'fees', header: 'Fees', width: '82px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{money(row.net_payable_fee || row.final_fees)}</span> },
                  { key: 'balance', header: 'Balance', width: '82px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{money(row.payment_balance)}</span> },
                ]),
                { key: 'counselor', header: 'Counselor', width: 'minmax(88px,0.75fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.counselor_name || '-'}</span> },
                ...(isSuperAdmin ? [
                  { key: 'adminNotes', header: 'Admin Notes', width: 'minmax(150px,1fr)', className: 'flex items-center', render: (row) => <AdminNotesCell row={row} onSave={saveAdminNotes} saving={Boolean(savingNotes[row.id])} /> },
                ] : []),
              ]}
            />
            <PaginationControls page={page} count={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        )}
      </section>
    </div>
  )
}
