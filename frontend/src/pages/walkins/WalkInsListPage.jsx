import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import QuickFollowUpEdit from '../../components/common/QuickFollowUpEdit'
import { CandidateInfo, ImportantFilter, TeamColorLegend } from '../../components/common/CandidateIdentity'
import { currentReturnTo, withReturnTo } from '../../utils/returnNavigation'

const appBasePath = (import.meta.env.VITE_APP_BASE_PATH || '').replace(/\/$/, '')

const emptyFilters = {
  search: '',
  branch: '',
  course: '',
  status: '',
  source: '',
  counselor: '',
  quick_filter: '',
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
    course: searchParams.get('course') || '',
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || '',
    counselor: searchParams.get('counselor') || '',
    quick_filter: searchParams.get('quick_filter') || '',
    date_from: searchParams.get('date_from') || '',
    date_to: searchParams.get('date_to') || '',
    important_only: searchParams.get('important_only') || '',
  }
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

function todayIsoFrom(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value, days) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function walkInPeriodRange(period) {
  const today = new Date()
  if (period === 'today') return { date_from: todayIsoFrom(today), date_to: todayIsoFrom(today) }
  if (period === 'this_month') return { date_from: todayIsoFrom(new Date(today.getFullYear(), today.getMonth(), 1)), date_to: todayIsoFrom(today) }
  if (period === 'last_month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    return { date_from: todayIsoFrom(firstDay), date_to: todayIsoFrom(lastDay) }
  }
  if (period === 'last3') return { date_from: todayIsoFrom(addDays(today, -90)), date_to: todayIsoFrom(today) }
  if (period === 'last6') return { date_from: todayIsoFrom(addDays(today, -180)), date_to: todayIsoFrom(today) }
  return { date_from: '', date_to: '' }
}

const walkInQuickFilters = [
  ['today', 'Today Walk-ins'],
  ['this_month', 'This Month Walk-ins'],
  ['last_month', 'Last Month Walk-ins'],
  ['last3', 'Last 3 Months Walk-ins'],
  ['last6', 'Last 6 Months Walk-ins'],
  ['custom', 'Custom Range'],
]

const walkInStatusOptions = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'continuous_no_answer', label: 'Continuous No Answer' },
  { value: 'na', label: 'NA' },
  { value: 'cna', label: 'CNA' },
  { value: 'will_walk_in', label: 'Will Walk-in' },
  { value: 'walk_in_completed', label: 'Walk-in Completed' },
  { value: 'demo_attended', label: 'Demo Attended' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'ready_to_join', label: 'Ready to Join' },
  { value: 'joined', label: 'Joined' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'lost_to_competitor', label: 'Lost to Competitor' },
]

const walkInSourceOptions = [
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

function counselorLabel(walkin) {
  return walkin.counseling_user?.name || walkin.counseling_by_name || 'Not Assigned'
}

function CounselorBadge({ walkin }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center text-sm font-semibold text-slate-700">
      <span className="truncate">{counselorLabel(walkin)}</span>
    </span>
  )
}

function WalkInSection({ title, walkins, count, emptyMessage, onFollowUpSaved, onImportantToggle, activeFilter, onStatusChange, canViewBranch, returnTo, listFilters }) {
  const isEnrollmentConversion = (walkin) => Boolean(walkin.enrollment_id || walkin.status === 'converted')
  const statusCount = (status) => walkins.filter((walkin) => walkin.status === status).length
  const todayWalkInCount = walkins.filter((walkin) => walkin.visit_date === todayIsoFrom()).length
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
        <div className="flex flex-col gap-3 xl:items-end">
          <StatusFilterChips
            items={summary}
            value={activeFilter}
            onChange={onStatusChange}
            className="xl:justify-end"
          />
          <TeamColorLegend users={walkins.map((walkin) => walkin.counseling_user)} />
        </div>
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
                width: '66px',
                className: 'flex items-center',
                render: (walkin) => <CompactStamp dateValue={walkin.visit_date || walkin.created_at} timeValue={walkin.created_at || walkin.visit_date} />,
              },
              {
                key: 'name',
                header: 'Name',
                width: 'minmax(135px,1.1fr)',
                className: 'flex items-center',
                render: (walkin) => (
                  <CandidateInfo
                    important={!!walkin.is_important}
                    onImportantToggle={(nextValue) => onImportantToggle(walkin, nextValue)}
                    owner={walkin.counseling_user}
                    primary={<Link to={withReturnTo(`/walkins/${walkin.id}`, returnTo)} state={{ returnTo, listFilters }} className="block truncate font-bold text-slate-950 hover:text-cyan-700">{walkin.name}</Link>}
                    secondary={walkin.phone || 'Phone not set'}
                    secondaryClassName="truncate text-sm font-semibold text-slate-800"
                  />
                ),
              },
              { key: 'course', header: 'Course', width: 'minmax(105px,0.9fr)', className: 'flex items-center', render: (walkin) => <span className="overflow-hidden break-words text-sm font-semibold leading-5 text-slate-700 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{walkin.course_name || 'Course pending'}</span> },
              { key: 'counselingBy', header: 'Counseling By', width: 'minmax(105px,0.85fr)', className: 'flex min-w-0 items-center', render: (walkin) => <CounselorBadge walkin={walkin} /> },
              { key: 'status', header: 'Status', width: '102px', className: 'flex items-center', render: (walkin) => <StatusBadge tone={statusTone(walkin)}>{statusLabel(walkin)}</StatusBadge> },
              { key: 'nextFollowUp', header: 'Next Follow Up', width: '84px', className: 'flex items-center', render: (walkin) => <span className="whitespace-nowrap text-slate-700">{isEnrollmentConversion(walkin) ? 'Not set' : formatDate(walkin.follow_up_date)}</span> },
              ...(canViewBranch ? [{
                key: 'branch',
                header: 'Branch',
                width: 'minmax(76px,0.65fr)',
                className: 'flex items-center',
                render: (walkin) => <span className="truncate text-sm font-semibold text-slate-700">{walkin.branch_name || '-'}</span>,
              }] : []),
              {
                key: 'remark',
                header: 'Latest Remark',
                width: 'minmax(120px,1.1fr)',
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
  const [filters, setFilters] = useState(emptyFilters)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const returnTo = currentReturnTo(location)
  const navigationMessage = location.state?.message || ''
  const { user } = useSelector((state) => state.auth)
  const canFilterByBranch = user?.role === 'super_admin'
  const appliedFilters = useMemo(() => readFilters(searchParams, canFilterByBranch), [searchParams, canFilterByBranch])
  const visitDateFrom = searchParams.get('visit_date_from') || ''
  const visitDateTo = searchParams.get('visit_date_to') || ''
  const followUpDateFrom = canFilterByBranch ? '' : searchParams.get('follow_up_date_from') || ''
  const followUpDateTo = canFilterByBranch ? '' : searchParams.get('follow_up_date_to') || ''
  const focus = canFilterByBranch ? '' : searchParams.get('focus') || ''
  const hasDateRangeFilter = Boolean(
    appliedFilters.date_from
    || appliedFilters.date_to
    || visitDateFrom
    || visitDateTo
    || followUpDateFrom
    || followUpDateTo
  )
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
    if (location.state?.listFilters) {
      setFilters((current) => ({ ...current, ...location.state.listFilters }))
    }
  }, [location.state])

  useEffect(() => {
    Promise.all([
      canFilterByBranch ? api.get('/branches/') : Promise.resolve({ data: [] }),
      api.get('/courses/'),
      api.get('/walkins/staff-options/'),
    ])
      .then(([branchesRes, coursesRes, usersRes]) => {
        setBranches(branchesRes.data.results || branchesRes.data)
        setCourses(coursesRes.data.results || coursesRes.data)
        setStaffUsers(usersRes.data.results || usersRes.data || [])
      })
      .catch((error) => {
        console.error('Failed to fetch filter options:', error)
      })
  }, [canFilterByBranch])

  useEffect(() => {
    const fetchWalkins = async () => {
      setLoading(true)
      try {
        const params = hasDateRangeFilter ? {} : { sectioned: 1 }
        Object.entries(appliedFilters).forEach(([key, value]) => {
          if (key === 'search' || key === 'quick_filter') return
          if (value) params[key] = value
        })
        if (appliedFilters.search) params.search = appliedFilters.search
        if (visitDateFrom) params.visit_date_from = visitDateFrom
        if (visitDateTo) params.visit_date_to = visitDateTo
        if (followUpDateFrom) params.follow_up_date_from = followUpDateFrom
        if (followUpDateTo) params.follow_up_date_to = followUpDateTo

        const { data } = await api.get('/walkins/', { params })
        if (hasDateRangeFilter) {
          const rows = data.results || data || []
          setCurrentMonthWalkins(rows)
          setOtherWalkins([])
          setCurrentMonthCount(rows.length)
          setOtherWalkinsCount(0)
        } else {
          setCurrentMonthWalkins(data.current_month_walkins || [])
          setOtherWalkins(data.other_walkins || [])
          setCurrentMonthCount(data.current_month_count || 0)
          setOtherWalkinsCount(data.other_walkins_count || 0)
        }
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
  }, [appliedFilters, visitDateFrom, visitDateTo, followUpDateFrom, followUpDateTo, focus, hasDateRangeFilter])

  const updateFilter = (key, value) => {
    if (key === 'quick_filter') {
      setFilters((current) => {
        const nextValue = current.quick_filter === value ? '' : value
        return {
          ...current,
          quick_filter: nextValue,
          ...walkInPeriodRange(nextValue),
        }
      })
      return
    }
    if (key === 'date_from' || key === 'date_to') {
      setFilters((current) => ({ ...current, quick_filter: 'custom', [key]: value }))
      return
    }
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const applyQuickFilter = (value) => {
    const active = filters.quick_filter === value
    const nextValue = active ? '' : value
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('quick_filter')
    nextParams.delete('visit_date_from')
    nextParams.delete('visit_date_to')
    nextParams.delete('follow_up_date_from')
    nextParams.delete('follow_up_date_to')
    nextParams.delete('focus')
    const range = walkInPeriodRange(nextValue)
    setFilters((current) => ({
      ...current,
      quick_filter: nextValue,
      ...range,
    }))
    nextParams.delete('date_from')
    nextParams.delete('date_to')
    if (nextValue) {
      nextParams.set('quick_filter', nextValue)
      if (range.date_from) nextParams.set('date_from', range.date_from)
      if (range.date_to) nextParams.set('date_to', range.date_to)
    }
    Object.entries(filters).forEach(([key, filterValue]) => {
      if (key === 'branch' && !canFilterByBranch) return
      if (['quick_filter', 'date_from', 'date_to'].includes(key)) return
      if (filterValue.trim()) nextParams.set(key, filterValue.trim())
    })
    setSearchParams(nextParams)
  }

  const updateWalkInFollowUp = (walkinId, followUp) => {
    const updateRows = (rows) => rows.map((walkin) => (
      walkin.id === walkinId
        ? {
            ...walkin,
            latest_remark: followUp.remarks || walkin.latest_remark,
            remarks: followUp.remarks || walkin.remarks,
            follow_up_date: followUp.next_follow_up_date,
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
      const today = todayIsoFrom()
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
  const activeSmartFilter = visitDateFrom === todayIsoFrom() && visitDateTo === todayIsoFrom()
    ? '__today_walkin'
    : appliedFilters.status

  const submitFilters = (event) => {
    event.preventDefault()
    const nextParams = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'branch' && !canFilterByBranch) return
      if (key === 'quick_filter') return
      if (value.trim()) nextParams.set(key, value.trim())
    })
    if (filters.quick_filter) {
      nextParams.set('quick_filter', filters.quick_filter)
      if (filters.quick_filter !== 'custom') {
        const range = walkInPeriodRange(filters.quick_filter)
        if (range.date_from) nextParams.set('date_from', range.date_from)
        if (range.date_to) nextParams.set('date_to', range.date_to)
      }
    }
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
        {(navigationMessage || loadMessage) && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {navigationMessage || loadMessage}
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
              {walkInSourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Counselor</span>
            <select value={filters.counselor} onChange={(event) => updateFilter('counselor', event.target.value)} name="counselor" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All counselors</option>
              {staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Status</span>
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} name="status" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white">
              <option value="">All status</option>
              {walkInStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
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
          <div className="flex items-end">
            <ImportantFilter checked={filters.important_only === 'true'} onChange={(checked) => updateFilter('important_only', checked ? 'true' : '')} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {walkInQuickFilters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => applyQuickFilter(value)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                filters.quick_filter === value
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
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
        title={hasDateRangeFilter ? 'Filtered Walk-ins' : 'Current Month Walk-ins'}
        walkins={currentMonthWalkins}
        count={currentMonthCount}
        emptyMessage={hasDateRangeFilter ? 'No walk-ins found within the selected date range.' : 'No current month walk-ins found.'}
        onFollowUpSaved={updateWalkInFollowUp}
        onImportantToggle={toggleWalkInImportant}
        activeFilter={activeSmartFilter}
        onStatusChange={applyStatusFilter}
        canViewBranch={canFilterByBranch}
        returnTo={returnTo}
        listFilters={filters}
      />

      {!hasDateRangeFilter && <div className="pt-2">
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
          returnTo={returnTo}
          listFilters={filters}
        />
      </div>}
    </div>
  )
}
