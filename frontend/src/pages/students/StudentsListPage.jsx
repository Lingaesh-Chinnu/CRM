import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import { downloadExport, ExportMenu } from '../../utils/exportData'
import { ImportantFilter, ImportantToggle, OwnerDot, TeamColorLegend } from '../../components/common/CandidateIdentity'
import useDebouncedValue from '../../hooks/useDebouncedValue'

function normaliseListResponse(data) {
  return data.results || data
}

function compactValue(value, fallback = 'Not provided') {
  return value || fallback
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function studentStatusLabel(value) {
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

export default function StudentsListPage() {
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
    importantOnly: false,
  })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const debouncedSearch = useDebouncedValue(filters.search.trim())

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    loadStudents()
  }, [filters.branch, filters.course, filters.status, debouncedSearch, filters.enrolledFrom, filters.enrolledTo, filters.importantOnly, isSuperAdmin])

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

  const loadStudents = async () => {
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
      if (filters.importantOnly) params.important_only = true

      const { data } = await api.get('/enrollments/', { params })
      setRows(normaliseListResponse(data))
      setMessage('')
    } catch (error) {
      setRows([])
      setMessage(apiErrorMessage(error, 'Failed to load students.'))
    } finally {
      setLoading(false)
    }
  }

  const studentQueryParams = (format) => {
    const params = { format, kind: 'students' }
    if (isSuperAdmin && filters.branch) params.branch = filters.branch
    if (filters.course) params.course = filters.course
    if (filters.status) params.status = filters.status
    if (debouncedSearch) params.search = debouncedSearch
    if (filters.enrolledFrom) params.enrolled_from = filters.enrolledFrom
    if (filters.enrolledTo) params.enrolled_to = filters.enrolledTo
    if (filters.importantOnly) params.important_only = true
    return params
  }

  const toggleStudentImportant = async (row, nextValue) => {
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, is_important: nextValue } : item))
    try {
      const { data } = await api.post(`/enrollments/${row.id}/toggle-important/`, { is_important: nextValue })
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, is_important: data.is_important } : item))
    } catch (error) {
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, is_important: !nextValue } : item))
      setMessage(apiErrorMessage(error, 'Failed to update important flag.'))
    }
  }

  const exportStudents = async (format) => {
    setExporting(true)
    setMessage('')
    try {
      await downloadExport('/students/export/', studentQueryParams(format), `students-export.${format === 'csv' ? 'csv' : 'xlsx'}`)
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to export students.'))
    } finally {
      setExporting(false)
    }
  }

  const statusCount = (status) => rows.filter((row) => statusSelectValue(row.status) === status).length
  const statusSummary = [
    { label: 'Total', value: '', count: rows.length },
    { label: 'Active', value: 'active', count: statusCount('active') },
    { label: 'Completed', value: 'completed', count: statusCount('completed') },
    { label: 'Hold', value: 'on_hold', count: statusCount('on_hold') },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Students</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Student profiles collected from walk-ins
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          This view keeps the enrolled students separate from the admissions workflow and shows the personal details collected in the walk-in form.
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
            </select>
          </label>

          <label className="min-w-[260px] flex-[1.4]">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Search
            </span>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Name, phone, student ID, course, counselor"
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
          <div className="flex items-end">
            <ImportantFilter checked={filters.importantOnly} onChange={(value) => setFilters((current) => ({ ...current, importantOnly: value }))} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {message && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700">
            {message}
          </div>
        )}
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Directory</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Student details</h2>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-col gap-2 lg:items-end">
              <StatusFilterChips
                items={statusSummary}
                value={filters.status}
                onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
                className="lg:justify-end"
              />
              <TeamColorLegend users={rows.map((row) => row.counselor_user)} />
            </div>
            <ExportMenu onExport={exportStudents} exporting={exporting} />
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading students...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No students found for the current filters.</div>
        ) : (
          <div className="p-4">
            <CRMTable
              rows={rows}
              columns={[
                { key: 'name', header: 'Student Name', width: 'minmax(160px,1.2fr)', render: (row) => <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><ImportantToggle active={!!row.is_important} onToggle={(nextValue) => toggleStudentImportant(row, nextValue)} /><OwnerDot user={row.counselor_user} /><Link to={`/students/${row.id}`} className="truncate font-bold text-slate-950 hover:text-cyan-700">{row.name}</Link></div><p className="mt-1 truncate text-xs text-slate-500">{row.student_number}</p></div> },
                { key: 'course', header: 'Course', width: 'minmax(140px,1fr)', render: (row) => <span className="truncate text-slate-700">{compactValue(row.course_name, 'Course pending')}</span> },
                { key: 'branch', header: 'Branch', width: '130px', render: (row) => <span className="truncate text-slate-700">{compactValue(row.branch_name, 'No branch')}</span> },
                { key: 'status', header: 'Status', width: '110px', render: (row) => <StatusBadge tone={statusSelectValue(row.status) === 'active' ? 'green' : 'slate'}>{studentStatusLabel(row.status)}</StatusBadge> },
                { key: 'fees', header: 'Fees', width: '110px', render: (row) => <span className="font-semibold text-slate-900">{money(row.net_payable_fee || row.final_fees)}</span> },
                { key: 'balance', header: 'Balance', width: '110px', render: (row) => <span className="font-semibold text-slate-900">{money(row.payment_balance)}</span> },
                { key: 'counselor', header: 'Counselor', width: '140px', render: (row) => <span className="truncate text-slate-700">{row.counselor_name || '-'}</span> },
              ]}
            />
          </div>
        )}
      </section>
    </div>
  )
}
