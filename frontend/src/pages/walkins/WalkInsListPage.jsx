import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'converted', label: 'Converted to Enrollment' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'transferred', label: 'Transferred' },
]

const emptyFilters = {
  name: '',
  phone: '',
  branch: '',
  assigned_to: '',
  course: '',
  status: '',
  date_from: '',
  date_to: '',
}

function statusLabel(walkin) {
  if (walkin?.enrollment_id || walkin?.status === 'converted') return 'Converted to Enrollment'
  const status = walkin?.status
  if (!status) return 'Unknown'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function readFilters(searchParams, canFilterByBranch) {
  return {
    name: searchParams.get('name') || '',
    phone: searchParams.get('phone') || '',
    branch: canFilterByBranch ? searchParams.get('branch') || '' : '',
    assigned_to: searchParams.get('assigned_to') || searchParams.get('created_by') || '',
    course: searchParams.get('course') || '',
    status: searchParams.get('status') || '',
    date_from: canFilterByBranch ? searchParams.get('date_from') || '' : '',
    date_to: canFilterByBranch ? searchParams.get('date_to') || '' : '',
  }
}

function uniqueStaffUsers(rows) {
  const seen = new Set()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function WalkInSection({ title, walkins, count, emptyMessage, onPhoneSaved }) {
  const walkInByText = (walkin) => walkin.assigned_name || walkin.walk_in_by_display || 'Unassigned'
  const isEnrollmentConversion = (walkin) => Boolean(walkin.enrollment_id || walkin.status === 'converted')
  const statusCount = (status) => walkins.filter((walkin) => walkin.status === status).length
  const summary = [
    ['Total', count],
    ['Enrolled', statusCount('converted')],
    ['Follow Up', statusCount('follow_up')],
    ['Interested', statusCount('new')],
    ['Not Interested', statusCount('not_interested')],
  ]

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 xl:flex-row xl:items-center xl:justify-between sm:px-8">
        <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
        <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600 xl:justify-end">
          {summary.map(([label, value]) => (
            <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {label} {value}
            </span>
          ))}
        </div>
      </div>

      {walkins.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm font-medium text-slate-500 sm:px-8">
          {emptyMessage}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200">
          {walkins.map((walkin) => (
            <li key={walkin.id}>
              <div className="px-6 py-5 transition hover:bg-slate-50 sm:px-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <Link to={`/walkins/${walkin.id}`} className="text-lg font-bold tracking-tight text-slate-950 hover:text-cyan-700">{walkin.name}</Link>
                    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-500">
                      <PhoneNumberEditor recordType="walkin" recordId={walkin.id} phone={walkin.phone} onSaved={(phone) => onPhoneSaved(walkin.id, phone)} />
                      <span>|</span>
                      <span>{walkin.course_name || 'Course pending'}</span>
                    </p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800">Latest Remark: </span>
                        <span className="break-words">{isEnrollmentConversion(walkin) ? 'Joined' : walkin.remarks || 'Not provided'}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800">Next Follow-up: </span>
                        {isEnrollmentConversion(walkin) ? 'Not set' : formatDate(walkin.follow_up_date)}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-fit flex-col items-start gap-2 sm:items-end">
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {statusLabel(walkin)}
                    </div>
                    {!isEnrollmentConversion(walkin) && (
                      <p className="text-xs font-semibold text-slate-500">
                        Follow-up: <span className="text-slate-800">{walkInByText(walkin)}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

    </section>
  )
}

export default function WalkInsListPage() {
  const [currentMonthWalkins, setCurrentMonthWalkins] = useState([])
  const [otherWalkins, setOtherWalkins] = useState([])
  const [currentMonthCount, setCurrentMonthCount] = useState(0)
  const [otherWalkinsCount, setOtherWalkinsCount] = useState(0)
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadMessage, setLoadMessage] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useSelector((state) => state.auth)
  const canFilterByBranch = user?.role === 'super_admin'
  const appliedFilters = useMemo(() => readFilters(searchParams, canFilterByBranch), [searchParams, canFilterByBranch])
  const visitDateFrom = searchParams.get('visit_date_from') || ''
  const visitDateTo = searchParams.get('visit_date_to') || ''
  const followUpDateFrom = searchParams.get('follow_up_date_from') || ''
  const followUpDateTo = searchParams.get('follow_up_date_to') || ''
  const focus = searchParams.get('focus') || ''
  const publicWalkInPath = `${appBasePath}/public/walk-in${!canFilterByBranch && user?.branch_id ? `?branch=${user.branch_id}` : ''}`
  const publicWalkInLink = `${window.location.origin}${publicWalkInPath}`

  const copyWalkInLink = async () => {
    try {
      await navigator.clipboard.writeText(publicWalkInLink)
      window.alert('Public walk-in form link copied.')
    } catch {
      window.alert(publicWalkInLink)
    }
  }

  useEffect(() => {
    setFilters(appliedFilters)
  }, [appliedFilters])

  useEffect(() => {
    Promise.all([
      canFilterByBranch ? api.get('/branches/') : Promise.resolve({ data: [] }),
      api.get('/courses/'),
    ])
      .then(([branchesRes, coursesRes]) => {
        setBranches(branchesRes.data.results || branchesRes.data)
        setCourses(coursesRes.data.results || coursesRes.data)
      })
      .catch((error) => {
        console.error('Failed to fetch filter options:', error)
      })
  }, [canFilterByBranch])

  useEffect(() => {
    const params = canFilterByBranch && filters.branch ? { branch: filters.branch } : undefined
    api.get('/walkins/staff-options/', { params })
      .then(({ data }) => {
        const rows = uniqueStaffUsers(data || [])
        setStaffUsers(rows)
        if (filters.assigned_to && !rows.some((staff) => String(staff.id) === String(filters.assigned_to))) {
          setFilters((current) => ({ ...current, assigned_to: '' }))
        }
      })
      .catch(() => setStaffUsers([]))
  }, [canFilterByBranch, filters.branch, filters.assigned_to])

  useEffect(() => {
    const fetchWalkins = async () => {
      setLoading(true)
      try {
        const params = { sectioned: 1 }
        Object.entries(appliedFilters).forEach(([key, value]) => {
          if (value) params[key] = value
        })
        if (visitDateFrom) params.visit_date_from = visitDateFrom
        if (visitDateTo) params.visit_date_to = visitDateTo
        if (followUpDateFrom) params.follow_up_date_from = followUpDateFrom
        if (followUpDateTo) params.follow_up_date_to = followUpDateTo

        const { data } = await api.get('/walkins/', { params })
        setCurrentMonthWalkins(data.current_month_walkins || [])
        setOtherWalkins(data.other_walkins || [])
        setCurrentMonthCount(data.current_month_count || 0)
        setOtherWalkinsCount(data.other_walkins_count || 0)
        setLoadMessage('')
      } catch (error) {
        setCurrentMonthWalkins([])
        setOtherWalkins([])
        setCurrentMonthCount(0)
        setOtherWalkinsCount(0)
        setLoadMessage(apiErrorMessage(error, 'Failed to load walk-ins.'))
      } finally {
        setLoading(false)
      }
    }

    fetchWalkins()
  }, [appliedFilters, visitDateFrom, visitDateTo, followUpDateFrom, followUpDateTo, focus])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const updateWalkInPhone = (walkinId, phone) => {
    const updateRows = (rows) => rows.map((walkin) => walkin.id === walkinId ? { ...walkin, phone } : walkin)
    setCurrentMonthWalkins(updateRows)
    setOtherWalkins(updateRows)
  }

  const submitFilters = (event) => {
    event.preventDefault()
    const nextParams = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'branch' && !canFilterByBranch) return
      if ((key === 'date_from' || key === 'date_to') && !canFilterByBranch) return
      if (value.trim()) nextParams.set(key, value.trim())
    })
    setSearchParams(nextParams)
  }

  if (loading) return <div className="p-6 text-slate-500">Loading walk-ins...</div>

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Walk-ins</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Candidate walk-in tracker</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Use the walk-in form to quickly capture candidate enquiries and manage follow-ups smoothly.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={publicWalkInPath} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
            Open Public Form
          </a>
          <button type="button" onClick={copyWalkInLink} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50">
            Copy Form Link
          </button>
          <Link to="/walkins/new" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Create Walk-in
          </Link>
        </div>
      </section>

      <form method="GET" onSubmit={submitFilters} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        {loadMessage && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {loadMessage}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Name</span>
            <input value={filters.name} onChange={(event) => updateFilter('name', event.target.value)} name="name" placeholder="Candidate name" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Phone</span>
            <input value={filters.phone} onChange={(event) => updateFilter('phone', event.target.value)} name="phone" placeholder="Phone number" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
          </label>
          {canFilterByBranch && (
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Branch</span>
              <select value={filters.branch} onChange={(event) => updateFilter('branch', event.target.value)} name="branch" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
                <option value="">All branches</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Walk-in By</span>
            <select value={filters.assigned_to} onChange={(event) => updateFilter('assigned_to', event.target.value)} name="assigned_to" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All Users</option>
              {staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Course</span>
            <select value={filters.course} onChange={(event) => updateFilter('course', event.target.value)} name="course" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All courses</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Status</span>
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} name="status" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All statuses</option>
              {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          {canFilterByBranch && (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">From Date</span>
                <input type="date" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} name="date_from" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">To Date</span>
                <input type="date" value={filters.date_to} onChange={(event) => updateFilter('date_to', event.target.value)} name="date_to" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
              </label>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 sm:justify-end">
            <button type="submit" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Search
            </button>
            <Link to="/walkins" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50">
              Clear Filter
            </Link>
        </div>
      </form>

      {focus === 'today-follow-up' && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-4 text-sm font-medium text-slate-700">
          Showing only walk-ins with follow-up scheduled for today.
        </div>
      )}

      <WalkInSection
        title="Current Month Walk-ins"
        walkins={currentMonthWalkins}
        count={currentMonthCount}
        emptyMessage="No current month walk-ins found."
        onPhoneSaved={updateWalkInPhone}
      />

      <div className="pt-2">
        <WalkInSection
          title="All Other Walk-ins"
          walkins={otherWalkins}
          count={otherWalkinsCount}
          emptyMessage="No older walk-ins found."
          onPhoneSaved={updateWalkInPhone}
        />
      </div>
    </div>
  )
}
