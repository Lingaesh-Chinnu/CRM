import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import QuickFollowUpEdit from '../../components/common/QuickFollowUpEdit'
import { downloadExport, ExportMenu } from '../../utils/exportData'
import { ImportantFilter, ImportantToggle, OwnerDot } from '../../components/common/CandidateIdentity'
import useDebouncedValue from '../../hooks/useDebouncedValue'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

const emptyFilters = {
  search: '',
  branch: '',
  assigned_to: '',
  course: '',
  status: '',
  source: '',
  date_from: '',
  date_to: '',
  important_only: '',
}

function statusLabel(walkin) {
  if (walkin?.enrollment_id || walkin?.status === 'converted') return 'Enrolled'
  const status = walkin?.status
  if (!status) return 'Unknown'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function statusTone(walkin) {
  if (walkin?.enrollment_id || walkin?.status === 'converted') return 'green'
  if (walkin?.status === 'not_interested') return 'red'
  if (walkin?.status === 'follow_up' || walkin?.status === 'demo_attended') return 'amber'
  return 'slate'
}

function readFilters(searchParams, canFilterByBranch) {
  return {
    search: searchParams.get('search') || '',
    branch: canFilterByBranch ? searchParams.get('branch') || '' : '',
    assigned_to: searchParams.get('assigned_to') || searchParams.get('created_by') || '',
    course: searchParams.get('course') || '',
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || '',
    date_from: canFilterByBranch ? searchParams.get('date_from') || '' : '',
    date_to: canFilterByBranch ? searchParams.get('date_to') || '' : '',
    important_only: searchParams.get('important_only') || '',
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

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function WalkInSection({ title, walkins, count, emptyMessage, onFollowUpSaved, onImportantToggle, activeFilter, onStatusChange, canViewBranch }) {
  const walkInByText = (walkin) => walkin.assigned_name || walkin.walk_in_by_display || 'Unassigned'
  const isEnrollmentConversion = (walkin) => Boolean(walkin.enrollment_id || walkin.status === 'converted')
  const statusCount = (status) => walkins.filter((walkin) => walkin.status === status).length
  const todayWalkInCount = walkins.filter((walkin) => walkin.visit_date === todayIso()).length
  const summary = [
    { label: 'Total', value: '', count },
    { label: 'Today Walk-in', value: '__today_walkin', count: todayWalkInCount },
    { label: 'Demo Attended', value: 'demo_attended', count: statusCount('demo_attended') },
    { label: 'Enrolled', value: 'converted', count: statusCount('converted') },
  ]

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 xl:flex-row xl:items-center xl:justify-between sm:px-8">
        <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
        <StatusFilterChips
          items={summary}
          value={activeFilter}
          onChange={onStatusChange}
          className="xl:justify-end"
        />
      </div>

      {walkins.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm font-medium text-slate-500 sm:px-8">
          {emptyMessage}
        </div>
      ) : (
        <div className="p-4">
          <CRMTable
            rows={walkins}
            emptyMessage={emptyMessage}
            columns={[
              {
                key: 'walkInDate',
                header: 'Walk-in Date',
                width: '78px',
                className: 'flex items-center',
                render: (walkin) => <CompactStamp dateValue={walkin.visit_date || walkin.created_at} timeValue={walkin.created_at || walkin.visit_date} />,
              },
              {
                key: 'name',
                header: 'Name',
                width: 'minmax(130px,1.15fr)',
                className: 'flex items-center',
                render: (walkin) => (
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <ImportantToggle active={!!walkin.is_important} onToggle={(nextValue) => onImportantToggle(walkin, nextValue)} />
                      <OwnerDot user={walkin.assigned_user} />
                      <Link to={`/walkins/${walkin.id}`} className="truncate font-bold text-slate-950 hover:text-cyan-700">{walkin.name}</Link>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{walkin.phone || 'Phone not set'}</p>
                  </div>
                ),
              },
              { key: 'course', header: 'Course', width: 'minmax(110px,0.95fr)', className: 'flex items-center', render: (walkin) => <span className="truncate text-sm font-semibold text-slate-700">{walkin.course_name || 'Course pending'}</span> },
              { key: 'status', header: 'Status', width: '112px', className: 'flex items-center', render: (walkin) => <StatusBadge tone={statusTone(walkin)}>{statusLabel(walkin)}</StatusBadge> },
              { key: 'followUpBy', header: 'Follow Up By', width: 'minmax(104px,0.85fr)', className: 'flex items-center', render: (walkin) => <span className="truncate text-slate-700">{isEnrollmentConversion(walkin) ? '-' : walkInByText(walkin)}</span> },
              { key: 'nextFollowUp', header: 'Next Follow Up', width: '98px', className: 'flex items-center', render: (walkin) => <span className="whitespace-nowrap text-slate-700">{isEnrollmentConversion(walkin) ? 'Not set' : formatDate(walkin.follow_up_date)}</span> },
              ...(canViewBranch ? [{
                key: 'branch',
                header: 'Branch',
                width: 'minmax(88px,0.75fr)',
                className: 'flex items-center',
                render: (walkin) => <span className="truncate text-sm font-semibold text-slate-700">{walkin.branch_name || '-'}</span>,
              }] : []),
              {
                key: 'remark',
                header: 'Latest Remark',
                width: 'minmax(150px,1.35fr)',
                className: 'flex items-center',
                render: (walkin) => (
                  <QuickFollowUpEdit
                    type="walkin"
                    recordId={walkin.id}
                    remark={walkin.latest_remark || walkin.remarks}
                    nextDate={walkin.follow_up_date}
                    onSaved={(followUp) => onFollowUpSaved(walkin.id, followUp)}
                  />
                ),
              },
            ]}
          />
        </div>
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
  const [exporting, setExporting] = useState(false)
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
  const debouncedSearch = useDebouncedValue(filters.search.trim())
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

  const walkinQueryParams = (format) => {
    const params = { format }
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (key === 'search') return
      if (value) params[key] = value
    })
    if (debouncedSearch) params.search = debouncedSearch
    if (visitDateFrom) params.visit_date_from = visitDateFrom
    if (visitDateTo) params.visit_date_to = visitDateTo
    if (followUpDateFrom) params.follow_up_date_from = followUpDateFrom
    if (followUpDateTo) params.follow_up_date_to = followUpDateTo
    return params
  }

  const exportWalkins = async (format) => {
    setExporting(true)
    setLoadMessage('')
    try {
      await downloadExport('/walkins/export/', walkinQueryParams(format), `walkins-export.${format === 'csv' ? 'csv' : 'xlsx'}`)
    } catch (error) {
      setLoadMessage(apiErrorMessage(error, 'Failed to export walk-ins.'))
    } finally {
      setExporting(false)
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
          if (key === 'search') return
          if (value) params[key] = value
        })
        if (debouncedSearch) params.search = debouncedSearch
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
  }, [appliedFilters, debouncedSearch, visitDateFrom, visitDateTo, followUpDateFrom, followUpDateTo, focus])

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const updateWalkInFollowUp = (walkinId, followUp) => {
    const updateRows = (rows) => rows.map((walkin) => (
      walkin.id === walkinId
        ? {
            ...walkin,
            latest_remark: followUp.remarks || walkin.latest_remark,
            remarks: followUp.remarks || walkin.remarks,
            follow_up_date: followUp.next_follow_up_date,
            status: ['converted', 'not_interested', 'transferred'].includes(walkin.status) ? walkin.status : 'follow_up',
          }
        : walkin
    ))
    setCurrentMonthWalkins(updateRows)
    setOtherWalkins(updateRows)
  }

  const toggleWalkInImportant = async (walkin, nextValue) => {
    const updateRows = (rows, value) => rows.map((item) => (
      item.id === walkin.id ? { ...item, is_important: value } : item
    ))
    setCurrentMonthWalkins((rows) => updateRows(rows, nextValue))
    setOtherWalkins((rows) => updateRows(rows, nextValue))
    try {
      const { data } = await api.post(`/walkins/${walkin.id}/toggle-important/`, { is_important: nextValue })
      setCurrentMonthWalkins((rows) => updateRows(rows, data.is_important))
      setOtherWalkins((rows) => updateRows(rows, data.is_important))
    } catch (error) {
      setCurrentMonthWalkins((rows) => updateRows(rows, !nextValue))
      setOtherWalkins((rows) => updateRows(rows, !nextValue))
      setLoadMessage(apiErrorMessage(error, 'Failed to update important flag.'))
    }
  }

  const applyStatusFilter = (value) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('visit_date_from')
    nextParams.delete('visit_date_to')
    if (value === '__today_walkin') {
      const today = todayIso()
      nextParams.delete('status')
      nextParams.set('visit_date_from', today)
      nextParams.set('visit_date_to', today)
    } else if (value) {
      nextParams.set('status', value)
    } else {
      nextParams.delete('status')
    }
    setSearchParams(nextParams)
  }
  const activeSmartFilter = visitDateFrom === todayIso() && visitDateTo === todayIso()
    ? '__today_walkin'
    : appliedFilters.status

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
          <ExportMenu onExport={exportWalkins} exporting={exporting} />
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
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search</span>
            <input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} name="search" placeholder="Name, phone, walk-in ID, course, counselor, source" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
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
            <span className="mb-2 block text-sm font-semibold text-slate-600">Source</span>
            <select value={filters.source} onChange={(event) => updateFilter('source', event.target.value)} name="source" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All sources</option>
              <option value="google">Google</option>
              <option value="justdial">JustDial</option>
              <option value="direct">Direct</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="friends_reference">Friends Reference</option>
              <option value="lead_conversion">Lead Conversion</option>
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
          <div className="flex items-end">
            <ImportantFilter checked={filters.important_only === 'true'} onChange={(checked) => updateFilter('important_only', checked ? 'true' : '')} />
          </div>
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
        onFollowUpSaved={updateWalkInFollowUp}
        onImportantToggle={toggleWalkInImportant}
        activeFilter={activeSmartFilter}
        onStatusChange={applyStatusFilter}
        canViewBranch={canFilterByBranch}
      />

      <div className="pt-2">
        <WalkInSection
          title="All Other Walk-ins"
          walkins={otherWalkins}
          count={otherWalkinsCount}
          emptyMessage="No older walk-ins found."
          onFollowUpSaved={updateWalkInFollowUp}
          onImportantToggle={toggleWalkInImportant}
          activeFilter={activeSmartFilter}
          onStatusChange={applyStatusFilter}
          canViewBranch={canFilterByBranch}
        />
      </div>
    </div>
  )
}
