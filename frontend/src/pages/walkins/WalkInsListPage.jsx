import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'converted', label: 'Converted' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'transferred', label: 'Transferred' },
]

const emptyFilters = {
  name: '',
  phone: '',
  branch: '',
  created_by: '',
  course: '',
  status: '',
}

function statusLabel(status) {
  if (!status) return 'Unknown'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function readFilters(searchParams, canFilterByBranch) {
  return {
    name: searchParams.get('name') || '',
    phone: searchParams.get('phone') || '',
    branch: canFilterByBranch ? searchParams.get('branch') || '' : '',
    created_by: canFilterByBranch ? searchParams.get('created_by') || '' : '',
    course: searchParams.get('course') || '',
    status: searchParams.get('status') || '',
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

function WalkInSection({ title, walkins, count, emptyMessage, onPhoneSaved }) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
        <span className="text-sm font-semibold text-slate-500">{count} total</span>
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
                  <div>
                    <Link to={`/walkins/${walkin.id}`} className="text-lg font-bold tracking-tight text-slate-950 hover:text-cyan-700">{walkin.name}</Link>
                    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-500">
                      <PhoneNumberEditor recordType="walkin" recordId={walkin.id} phone={walkin.phone} onSaved={(phone) => onPhoneSaved(walkin.id, phone)} />
                      <span>|</span>
                      <span>{walkin.branch_name || 'Branch pending'}</span>
                      <span>|</span>
                      <span>{walkin.course_name || 'Course pending'}</span>
                      <span>|</span>
                      <span>{walkin.preferred_timing_display || 'Timing pending'}</span>
                    </p>
                  </div>
                  <div className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    {statusLabel(walkin.status)}
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
  const publicWalkInPath = `${appBasePath}/public/walk-in`
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
    if (!canFilterByBranch || !filters.branch) {
      setStaffUsers([])
      if (filters.created_by) {
        setFilters((current) => ({ ...current, created_by: '' }))
      }
      return
    }
    api.get('/walkins/staff-options/', { params: { branch: filters.branch } })
      .then(({ data }) => {
        const rows = uniqueStaffUsers(data || [])
        setStaffUsers(rows)
        if (filters.created_by && !rows.some((staff) => String(staff.id) === String(filters.created_by))) {
          setFilters((current) => ({ ...current, created_by: '' }))
        }
      })
      .catch(() => setStaffUsers([]))
  }, [canFilterByBranch, filters.branch, filters.created_by])

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
      } catch (error) {
        console.error('Failed to fetch walk-ins:', error)
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
      if ((key === 'branch' || key === 'created_by') && !canFilterByBranch) return
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
            Use the common public walk-in form for candidates. Branch-based filtering is active, so each branch user only sees their own branch submissions.
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
        <div className={`grid gap-3 md:grid-cols-2 ${canFilterByBranch ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}>
          <input value={filters.name} onChange={(event) => updateFilter('name', event.target.value)} name="name" placeholder="Candidate name" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
          <input value={filters.phone} onChange={(event) => updateFilter('phone', event.target.value)} name="phone" placeholder="Phone number" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
          {canFilterByBranch && (
            <select value={filters.branch} onChange={(event) => updateFilter('branch', event.target.value)} name="branch" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          )}
          {canFilterByBranch && (
            <select value={filters.created_by} onChange={(event) => updateFilter('created_by', event.target.value)} name="created_by" disabled={!filters.branch} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60">
              <option value="">{filters.branch ? 'Walk-in By' : 'Select branch first'}</option>
              {staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
            </select>
          )}
          <select value={filters.course} onChange={(event) => updateFilter('course', event.target.value)} name="course" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
            <option value="">All courses</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} name="status" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
            <option value="">All statuses</option>
            {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
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
