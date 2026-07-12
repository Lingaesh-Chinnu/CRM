import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import ModalCloseButton from '../../components/common/ModalCloseButton'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import QuickFollowUpEdit from '../../components/common/QuickFollowUpEdit'
import { CandidateInfo, ImportantFilter, TeamColorLegend } from '../../components/common/CandidateIdentity'
import { currentReturnTo, withReturnTo } from '../../utils/returnNavigation'

function statusLabel(status) {
  if (!status) return 'New'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function isoDate(value) {
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

function leadPeriodRange(period) {
  const today = new Date()
  if (period === 'today') return { createdFrom: isoDate(today), createdTo: isoDate(today) }
  if (period === 'this_month') return { createdFrom: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), createdTo: isoDate(today) }
  if (period === 'last_month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    return { createdFrom: isoDate(firstDay), createdTo: isoDate(lastDay) }
  }
  if (period === 'last3') return { createdFrom: isoDate(addDays(today, -90)), createdTo: isoDate(today) }
  if (period === 'last6') return { createdFrom: isoDate(addDays(today, -180)), createdTo: isoDate(today) }
  return { createdFrom: '', createdTo: '' }
}

const leadPeriodFilters = [
  ['today', 'Today Leads'],
  ['this_month', 'This Month Leads'],
  ['last_month', 'Last Month Leads'],
  ['last3', 'Last 3 Months Leads'],
  ['last6', 'Last 6 Months Leads'],
  ['custom', 'Custom Range'],
]

const leadFollowUpFilters = [
  ['today', 'Today Follow-ups'],
  ['tomorrow', 'Tomorrow Follow-ups'],
  ['next7', 'Next 7 Days Follow-ups'],
]

const leadStatusOptions = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'continuous_no_answer', label: 'Continuous No Answer' },
  { value: 'will_walk_in', label: 'Will Walk-in' },
  { value: 'walk_in_completed', label: 'Walk-in Completed' },
  { value: 'demo_attended', label: 'Demo Attended' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'ready_to_join', label: 'Ready to Join' },
  { value: 'joined', label: 'Joined' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'lost_to_competitor', label: 'Lost to Competitor' },
  { value: 'na', label: 'NA' },
  { value: 'cna', label: 'CNA' },
]

const leadStatusAliases = {
  new_lead: ['new'],
  no_answer: ['not_answering', 'call_not_attended'],
  continuous_no_answer: ['continuously_not_answering_calls'],
  na: ['not_answering', 'call_not_attended'],
  cna: ['continuously_not_answering_calls'],
  will_walk_in: ['will_walk_in', 'walk_in'],
  walk_in_completed: ['converted_to_walkin'],
  ready_to_join: ['will_enroll'],
  joined: ['enrolled', 'converted'],
  lost_to_competitor: ['joined_other_institute', 'lost'],
}

function matchesLeadStatus(lead, value) {
  if (!value) return true
  return lead.counselor_status === value
    || lead.status === value
    || (leadStatusAliases[value] || []).includes(lead.status)
}

function formatCreatedDateCompact(value) {
  if (!value) return null
  const date = new Date(value)
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

function CreatedStamp({ value }) {
  const date = formatCreatedDateCompact(value)
  if (!date) return <span className="text-xs text-slate-400">-</span>
  return (
    <div className="leading-tight">
      <p className="whitespace-nowrap text-sm font-black text-slate-900">{date}</p>
    </div>
  )
}

function formatDateCompact(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

function assignedUserName(lead) {
  return lead.assigned_user?.name || lead.assigned_to_name || 'Unassigned'
}

function sourceLabel(lead) {
  return lead.source_display || lead.source || 'Unknown'
}

function statusTone(status) {
  if (['converted', 'converted_to_walkin', 'enrolled'].includes(status)) return 'green'
  if (['not_interested', 'wrong_number', 'lost', 'dropped'].includes(status)) return 'red'
  if (['follow_up', 'will_walk_in', 'callback_later'].includes(status)) return 'amber'
  return 'slate'
}

function lifecycleStatusLabel(lead) {
  if (lead?.status_display) return lead.status_display
  if (lead?.converted_to_type === 'walkin' || lead?.status === 'converted_to_walkin' || lead?.status === 'walk_in') return 'Converted to Walk-in'
  if (lead?.converted_to_type === 'enrollment' || lead?.status === 'converted' || lead?.status === 'enrolled') return 'Enrolled'
  if (lead?.status === 'not_interested') return 'Not Interested'
  if (lead?.status === 'new' && lead?.source !== 'manual') return 'New Lead'
  if (lead?.status === 'new' && lead?.source === 'manual') return 'Follow-up'
  return statusLabel(lead?.status || 'follow_up')
}

const adminBranchNames = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']

function statusCount(rows, status) {
  const statuses = Array.isArray(status) ? status : [status]
  return rows.filter((row) => statuses.includes(row.status)).length
}

export default function LeadsListPage() {
  const [leads, setLeads] = useState([])
  const [staffUsers, setStaffUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [sourceOptions, setSourceOptions] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    source: '',
    followUp: '',
    leadPeriod: '',
    followUpBy: '',
    branch: '',
    createdFrom: '',
    createdTo: '',
    importantOnly: false,
  })
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadMessage, setLoadMessage] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const { user } = useSelector((state) => state.auth)
  const canImportLeads = user?.role && user.role !== 'super_admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const returnTo = currentReturnTo(location)
  const navigationMessage = location.state?.message || ''
  const statusFilter = searchParams.get('status') || ''
  const walkinDateFrom = searchParams.get('walkin_date_from') || ''
  const walkinDateTo = searchParams.get('walkin_date_to') || ''
  const nextFollowUpDateFrom = isSuperAdmin ? '' : searchParams.get('next_follow_up_date_from') || ''
  const nextFollowUpDateTo = isSuperAdmin ? '' : searchParams.get('next_follow_up_date_to') || ''
  const focus = isSuperAdmin ? '' : searchParams.get('focus') || ''

  const filteredLeads = useMemo(() => {
    const today = new Date()
    const todayValue = isoDate(today)
    const tomorrowValue = isoDate(addDays(today, 1))
    const nextSevenValue = isoDate(addDays(today, 7))
    return leads.filter((lead) => {
      const matchesStatus = matchesLeadStatus(lead, filters.status)
        || (filters.status === 'converted' && lead.status === 'converted_to_walkin')
      const leadSource = String(lead.source || '').toLowerCase()
      const filterSource = String(filters.source || '').toLowerCase()
      const matchesSource = !filterSource
        || (filterSource === '__unknown__' ? !leadSource : leadSource === filterSource)
      const assigneeId = lead.follow_up_by || lead.assigned_to || lead.assigned_user?.id || ''
      const matchesFollowUpBy = !filters.followUpBy || String(assigneeId) === String(filters.followUpBy)
      const matchesImportant = !filters.importantOnly || lead.is_important
      let matchesFollowUp = true
      const followUpDate = lead.next_follow_up_date || ''
      if (filters.followUp === 'today') {
        matchesFollowUp = followUpDate === todayValue
      } else if (filters.followUp === 'tomorrow') {
        matchesFollowUp = followUpDate === tomorrowValue
      } else if (filters.followUp === 'next7') {
        matchesFollowUp = Boolean(followUpDate) && followUpDate >= todayValue && followUpDate <= nextSevenValue
      }

      return matchesStatus && matchesSource && matchesFollowUp && matchesFollowUpBy && matchesImportant
    })
  }, [filters, leads])

  const statusSummaryBaseLeads = useMemo(() => {
    const today = new Date()
    const todayValue = isoDate(today)
    const tomorrowValue = isoDate(addDays(today, 1))
    const nextSevenValue = isoDate(addDays(today, 7))
    return leads.filter((lead) => {
      const leadSource = String(lead.source || '').toLowerCase()
      const filterSource = String(filters.source || '').toLowerCase()
      const matchesSource = !filterSource
        || (filterSource === '__unknown__' ? !leadSource : leadSource === filterSource)
      const assigneeId = lead.follow_up_by || lead.assigned_to || lead.assigned_user?.id || ''
      const matchesFollowUpBy = !filters.followUpBy || String(assigneeId) === String(filters.followUpBy)
      const matchesImportant = !filters.importantOnly || lead.is_important
      let matchesFollowUp = true
      const followUpDate = lead.next_follow_up_date || ''
      if (filters.followUp === 'today') {
        matchesFollowUp = followUpDate === todayValue
      } else if (filters.followUp === 'tomorrow') {
        matchesFollowUp = followUpDate === tomorrowValue
      } else if (filters.followUp === 'next7') {
        matchesFollowUp = Boolean(followUpDate) && followUpDate >= todayValue && followUpDate <= nextSevenValue
      }

      return matchesSource && matchesFollowUp && matchesFollowUpBy && matchesImportant
    })
  }, [filters, leads])

  const hasFilters = Boolean(
    filters.search
    || filters.status
    || filters.source
    || filters.followUp
    || filters.leadPeriod
    || filters.followUpBy
    || filters.branch
    || filters.createdFrom
    || filters.createdTo
    || filters.importantOnly
  )
  const leadSummary = [
    { label: 'Total', value: '', count: statusSummaryBaseLeads.length },
    { label: 'New Lead', value: 'new', count: statusSummaryBaseLeads.filter((lead) => lead.status === 'new' && lead.source !== 'manual').length },
    { label: 'Follow-up', value: 'follow_up', count: statusCount(statusSummaryBaseLeads, 'follow_up') },
    { label: 'Converted', value: 'converted', count: statusCount(statusSummaryBaseLeads, ['converted', 'converted_to_walkin']) },
    { label: 'Not Interested', value: 'not_interested', count: statusCount(statusSummaryBaseLeads, 'not_interested') },
  ]

  useEffect(() => {
    fetchLeads()
  }, [
    statusFilter,
    walkinDateFrom,
    walkinDateTo,
    nextFollowUpDateFrom,
    nextFollowUpDateTo,
    focus,
    isSuperAdmin,
    filters.branch,
    filters.status,
    filters.source,
    filters.followUp,
    filters.leadPeriod,
    filters.followUpBy,
    filters.createdFrom,
    filters.createdTo,
    filters.importantOnly,
    appliedSearch,
  ])

  useEffect(() => {
    api.get('/leads/staff-options/')
      .then(({ data }) => setStaffUsers(data || []))
      .catch(() => setStaffUsers([]))
  }, [])

  useEffect(() => {
    if (location.state?.listFilters) {
      setFilters((current) => ({ ...current, ...location.state.listFilters }))
      setAppliedSearch((location.state.listFilters.search || '').trim())
    }
  }, [location.state])

  useEffect(() => {
    if (!isSuperAdmin) return
    api.get('/branches/')
      .then(({ data }) => {
        const rows = data.results || data || []
        setBranches(
          rows
            .filter((branch) => adminBranchNames.includes(branch.name))
            .sort((a, b) => adminBranchNames.indexOf(a.name) - adminBranchNames.indexOf(b.name))
        )
      })
      .catch(() => setBranches([]))
  }, [isSuperAdmin])

  useEffect(() => {
    const params = {}
    if (isSuperAdmin && filters.branch) params.branch = filters.branch
    api.get('/leads/source-options/', { params })
      .then(({ data }) => setSourceOptions(data || []))
      .catch(() => setSourceOptions([]))
  }, [isSuperAdmin, filters.branch])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      else if (filters.status) params.status = filters.status
      if (walkinDateFrom) params.walkin_date_from = walkinDateFrom
      if (walkinDateTo) params.walkin_date_to = walkinDateTo
      if (nextFollowUpDateFrom) params.next_follow_up_date_from = nextFollowUpDateFrom
      if (nextFollowUpDateTo) params.next_follow_up_date_to = nextFollowUpDateTo
      if (isSuperAdmin && filters.branch) params.branch = filters.branch
      if (filters.source) params.source = filters.source
      if (filters.followUpBy) params.counselor = filters.followUpBy
      if (appliedSearch) params.search = appliedSearch
      if (filters.createdFrom) params.date_from = filters.createdFrom
      if (filters.createdTo) params.date_to = filters.createdTo
      if (filters.importantOnly) params.important_only = true
      const today = new Date()
      if (!isSuperAdmin && filters.followUp === 'today') {
        params.next_follow_up_date_from = isoDate(today)
        params.next_follow_up_date_to = isoDate(today)
      } else if (!isSuperAdmin && filters.followUp === 'tomorrow') {
        const tomorrow = isoDate(addDays(today, 1))
        params.next_follow_up_date_from = tomorrow
        params.next_follow_up_date_to = tomorrow
      } else if (!isSuperAdmin && filters.followUp === 'next7') {
        params.next_follow_up_date_from = isoDate(today)
        params.next_follow_up_date_to = isoDate(addDays(today, 7))
      } else if (!isSuperAdmin && filters.followUp === 'overdue') {
        params.next_follow_up_date_to = isoDate(addDays(today, -1))
      }
      const { data } = await api.get('/leads/', { params })
      setLeads(data.results || data)
      setLoadMessage('')
    } catch (error) {
      setLeads([])
      setLoadMessage(apiErrorMessage(error, 'Failed to load leads.'))
    } finally {
      setLoading(false)
    }
  }

  const updateLeadFollowUp = (leadId, followUp) => {
    setLeads((current) => current.map((lead) => (
      lead.id === leadId
        ? {
            ...lead,
            status: followUp.lead_status || followUp.status || lead.status,
            lead_status: followUp.lead_status || followUp.status || lead.lead_status,
            status_display: followUp.status_display || lead.status_display,
            counselor_status: followUp.counselor_status || lead.counselor_status,
            remarks: followUp.remarks || lead.remarks,
            latest_remark: followUp.remarks || lead.latest_remark || lead.remarks,
            next_follow_up_date: followUp.next_follow_up_date,
            latest_follow_up_at: followUp.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : lead
    )))
  }

  const toggleLeadImportant = async (lead, nextValue) => {
    setLeads((current) => current.map((item) => (
      item.id === lead.id ? { ...item, is_important: nextValue } : item
    )))
    try {
      const { data } = await api.post(`/leads/${lead.id}/toggle-important/`, { is_important: nextValue })
      setLeads((current) => current.map((item) => (
        item.id === lead.id ? { ...item, is_important: data.is_important } : item
      )))
    } catch (error) {
      setLeads((current) => current.map((item) => (
        item.id === lead.id ? { ...item, is_important: !nextValue } : item
      )))
      setLoadMessage(apiErrorMessage(error, 'Failed to update important flag.'))
    }
  }

  const updateFilter = (field, value) => {
    if (field === 'leadPeriod') {
      setFilters((current) => ({
        ...current,
        leadPeriod: current.leadPeriod === value ? '' : value,
        ...leadPeriodRange(current.leadPeriod === value ? '' : value),
      }))
      return
    }
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const submitSearch = (event) => {
    event.preventDefault()
    setAppliedSearch(filters.search.trim())
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: '',
      source: '',
      followUp: '',
      leadPeriod: '',
      followUpBy: '',
      branch: '',
      createdFrom: '',
      createdTo: '',
      importantOnly: false,
    })
    setAppliedSearch('')
  }

  const submitImport = async (event) => {
    event.preventDefault()
    if (!importFile) return
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const payload = new FormData()
      payload.append('file', importFile)
      const { data } = await api.post('/leads/import/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setImportResult(data)
      setImportFile(null)
      await fetchLeads()
    } catch (error) {
      const data = error.response?.data
      setImportError(data?.detail || 'Lead import failed.')
      setImportResult(data || null)
    } finally {
      setImporting(false)
    }
  }

  const downloadLeadTemplate = async () => {
    const response = await api.get('/leads/import-template/', { responseType: 'blob' })
    const url = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = 'leads-import-template.xlsx'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"></div>
          <span className="text-sm font-medium text-slate-600">Loading leads...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Prospect pipeline
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Leads
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Track new inquiries, follow-up commitments, and movement toward walk-ins from one list.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canImportLeads && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Import Leads
            </button>
          )}
          <Link
            to="/leads/new"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Add New Lead
          </Link>
        </div>
      </section>

      {importOpen && (
        <section className="relative rounded-[24px] border border-slate-200 bg-white p-4 pt-14 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-5 sm:pt-14">
          <ModalCloseButton onClick={() => setImportOpen(false)} label="Close import leads modal" />
          <form onSubmit={submitImport} className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center xl:grid-cols-[auto_minmax(0,1fr)_auto]">
            <button
              type="button"
              onClick={downloadLeadTemplate}
              className="inline-flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Download Template
            </button>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
              className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-inner file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900 file:shadow-sm transition focus:border-cyan-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-100"
              required
            />
            <button disabled={importing} className="inline-flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60 md:col-span-2 xl:col-span-1">
              {importing ? 'Importing...' : 'Upload & Import'}
            </button>
          </form>
          {importError && <p className="mt-4 text-sm font-semibold text-rose-700">{importError}</p>}
          {importResult && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              {importResult.import_summary && (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Import Summary</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Imported to</p>
                      <p className="mt-1 font-black">{importResult.import_summary.imported_to?.map((item) => `${item.branch} Branch`).join(', ') || 'Your Branch'}</p>
                    </div>
                    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Leads Added</p><p className="mt-1 text-xl font-black">{importResult.import_summary.leads_added || 0}</p></div>
                    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Duplicates Skipped</p><p className="mt-1 text-xl font-black">{importResult.import_summary.duplicates_skipped || 0}</p></div>
                    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Invalid Rows</p><p className="mt-1 text-xl font-black">{importResult.import_summary.invalid_rows || 0}</p></div>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                <div><span className="font-semibold">Total rows:</span> {importResult.total_rows ?? importResult.history?.total_rows ?? 0}</div>
                <div><span className="font-semibold">Imported:</span> {importResult.successfully_imported ?? importResult.history?.success_count ?? 0}</div>
                <div><span className="font-semibold">Failed:</span> {importResult.failed_rows ?? importResult.history?.failed_count ?? 0}</div>
                <div><span className="font-semibold">Duplicates:</span> {importResult.duplicate_rows ?? importResult.history?.duplicate_count ?? 0}</div>
              </div>
              {(importResult.errors?.length || importResult.history?.error_log?.length) ? (
                <div className="mt-4 max-h-52 overflow-auto rounded-xl bg-white p-3">
                  {(importResult.errors || importResult.history?.error_log || []).map((error, index) => (
                    <p key={index} className="py-1 text-xs text-slate-600">
                      Row {error.row || '-'}: {error.error}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        <form onSubmit={submitSearch} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,0.75fr)_minmax(220px,0.75fr)_auto] 2xl:items-end">
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search</span>
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder="Name, phone, lead ID, course, counselor, source"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Source</span>
            <select
              value={filters.source}
              onChange={(event) => updateFilter('source', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All Sources</option>
              {sourceOptions.map((option) => (
                <option key={option.value || 'unknown'} value={option.value}>{option.label || 'Unknown'}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Status</span>
            <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100">
              <option value="">All Statuses</option>
              {leadStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {isSuperAdmin && (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Branch</span>
                <select
                  value={filters.branch}
                  onChange={(event) => updateFilter('branch', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                >
                  <option value="">All Branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">From Date</span>
                <input
                  type="date"
                  value={filters.createdFrom}
                  onChange={(event) => updateFilter('createdFrom', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">To Date</span>
                <input
                  type="date"
                  value={filters.createdTo}
                  onChange={(event) => updateFilter('createdTo', event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
              </label>
          </>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Follow-up By</span>
            <select
              value={filters.followUpBy}
              onChange={(event) => updateFilter('followUpBy', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All Users</option>
              {staffUsers.map((staff) => (
                <option key={staff.id} value={staff.id}>{staff.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <ImportantFilter checked={filters.importantOnly} onChange={(value) => updateFilter('importantOnly', value)} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-1"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2 xl:col-span-4 2xl:col-span-1"
          >
            Clear Filters
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {(!isSuperAdmin ? leadFollowUpFilters : []).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => updateFilter('followUp', value)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                filters.followUp === value
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
          {leadPeriodFilters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => updateFilter('leadPeriod', value)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                filters.leadPeriod === value
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <StatusFilterChips
            items={leadSummary}
            value={filters.status}
            onChange={(value) => updateFilter('status', value)}
          />
          <TeamColorLegend users={filteredLeads.map((lead) => lead.assigned_user)} />
        </div>
        {(navigationMessage || loadMessage) && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700 sm:px-8">
            {navigationMessage || loadMessage}
          </div>
        )}
        {focus === 'today-follow-up' && (
          <div className="border-b border-slate-200 bg-cyan-50 px-6 py-4 text-sm font-medium text-slate-700 sm:px-8">
            Showing only leads with next follow-up scheduled for today.
          </div>
        )}
        {leads.length === 0 ? (
          <div className="px-6 py-16 text-center sm:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-sm font-black tracking-[0.24em] text-white">
              LD
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-950">
              No leads yet
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
              Start your pipeline with the first prospect record and keep every follow-up visible from the dashboard.
            </p>
            <Link
              to="/leads/new"
              className="mt-6 inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Create your first lead
            </Link>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="px-6 py-16 text-center sm:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-sm font-black tracking-[0.24em] text-slate-600">
              LD
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-950">
              No matching leads
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
              Adjust the filters or clear them to view the full visible pipeline.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-6 inline-flex items-center justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="p-4">
            <CRMTable
              rows={filteredLeads}
              emptyMessage="No matching leads."
              columns={[
                {
                  key: 'created',
                  header: 'Created',
                  width: '64px',
                  className: 'flex items-center',
                  render: (lead) => <CreatedStamp value={lead.created_at} />,
                },
                {
                  key: 'name',
                  header: 'Name',
                  width: 'minmax(130px,1.1fr)',
                  className: 'flex items-center',
                  render: (lead) => (
                    <CandidateInfo
                      important={!!lead.is_important}
                      onImportantToggle={(nextValue) => toggleLeadImportant(lead, nextValue)}
                      owner={lead.assigned_user}
                      primary={<Link to={withReturnTo(`/leads/${lead.id}`, returnTo)} state={{ returnTo, listFilters: filters }} className="block truncate font-bold text-slate-950 hover:text-cyan-700">{lead.name}</Link>}
                      secondary={lead.course_name || 'Course not selected'}
                      secondaryClassName="overflow-hidden break-words text-xs leading-4 text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                    />
                  ),
                },
                {
                  key: 'phone',
                  header: 'Phone',
                  width: '92px',
                  className: 'flex items-center',
                  render: (lead) => <span className="truncate text-sm font-semibold text-slate-800">{lead.phone || '-'}</span>,
                },
                {
                  key: 'source',
                  header: 'Source',
                  width: 'minmax(82px,0.75fr)',
                  className: 'flex items-center',
                  render: (lead) => (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-700">{sourceLabel(lead)}</p>
                      {lead.source_description && <p className="mt-1 truncate text-xs text-slate-500">{lead.source_description}</p>}
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  width: '116px',
                  className: 'flex items-center',
                  render: (lead) => <StatusBadge tone={statusTone(lead.status)}>{lifecycleStatusLabel(lead)}</StatusBadge>,
                },
                { key: 'followUpBy', header: 'Follow Up By', width: 'minmax(86px,0.7fr)', className: 'flex items-center', render: (lead) => <span className="truncate text-sm font-medium text-slate-700">{assignedUserName(lead)}</span> },
                { key: 'nextFollowUp', header: 'Next Follow Up', width: '82px', className: 'flex items-center', render: (lead) => <span className="whitespace-nowrap text-sm font-semibold text-slate-700">{formatDateCompact(lead.next_follow_up_date)}</span> },
                ...(isSuperAdmin ? [{
                  key: 'branch',
                  header: 'Branch',
                  width: 'minmax(76px,0.65fr)',
                  className: 'flex items-center',
                  render: (lead) => <span className="truncate text-sm font-semibold text-slate-700">{lead.branch_name || '-'}</span>,
                }] : []),
                {
                  key: 'remark',
                  header: 'Latest Remark',
                  width: 'minmax(120px,1.1fr)',
                  className: 'flex items-center',
                  render: (lead) => (
                    <QuickFollowUpEdit
                      type="lead"
                      recordId={lead.id}
                      remark={lead.remarks}
                      nextDate={lead.next_follow_up_date}
                      onSaved={(followUp) => updateLeadFollowUp(lead.id, followUp)}
                    />
                  ),
                },
              ]}
            />
          </div>
        )}
      </section>
    </div>
  )
}
