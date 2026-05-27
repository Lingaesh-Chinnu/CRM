import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import StatusFilterChips from '../../components/common/StatusFilterChips'
import ModalCloseButton from '../../components/common/ModalCloseButton'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import QuickFollowUpEdit from '../../components/common/QuickFollowUpEdit'
import { ImportantFilter, ImportantToggle, OwnerDot } from '../../components/common/CandidateIdentity'
import { downloadExport, ExportMenu } from '../../utils/exportData'

function statusLabel(status) {
  if (!status) return 'New'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

const statusFilters = [
  { value: '', label: 'All Status' },
  { value: 'new', label: 'New Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'will_walk_in', label: 'Will Walk-in' },
  { value: 'walk_in', label: 'Walked-in' },
  { value: 'counseling_completed', label: 'Counseling Completed' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'demo_attended', label: 'Demo Attended' },
  { value: 'will_enroll', label: 'Will Enroll' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'not_answering', label: 'Not Answering (NA)' },
  { value: 'call_not_attended', label: 'Call Not Attended (CNA)' },
  { value: 'switched_off', label: 'Switched Off' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'joined_other_institute', label: 'Joined Other Institute' },
  { value: 'callback_later', label: 'Callback Later' },
  { value: 'future_lead', label: 'Future Lead' },
]

const quickStatusOptions = statusFilters.filter((option) => option.value)

function isoDate(value) {
  return value.toISOString().slice(0, 10)
}

function addDays(value, days) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatDateTimeCompact(value) {
  if (!value) return '-'
  const date = new Date(value)
  return {
    date: date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    }),
    time: date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
  }
}

function CreatedStamp({ value }) {
  const stamp = formatDateTimeCompact(value)
  if (stamp === '-') return <span className="text-xs text-slate-400">-</span>
  return (
    <div className="leading-tight">
      <p className="whitespace-nowrap text-sm font-black text-slate-900">{stamp.date}</p>
      <p className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{stamp.time}</p>
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
    name: '',
    phone: '',
    status: '',
    source: '',
    followUp: '',
    followUpBy: '',
    branch: '',
    createdFrom: '',
    createdTo: '',
    importantOnly: false,
  })
  const [loading, setLoading] = useState(true)
  const [loadMessage, setLoadMessage] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [statusSavingId, setStatusSavingId] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const { user } = useSelector((state) => state.auth)
  const canImportLeads = user?.role && user.role !== 'super_admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const [searchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const walkinDateFrom = searchParams.get('walkin_date_from') || ''
  const walkinDateTo = searchParams.get('walkin_date_to') || ''
  const nextFollowUpDateFrom = searchParams.get('next_follow_up_date_from') || ''
  const nextFollowUpDateTo = searchParams.get('next_follow_up_date_to') || ''
  const focus = searchParams.get('focus') || ''

  const filteredLeads = useMemo(() => {
    const nameQuery = filters.name.trim().toLowerCase()
    const phoneQuery = filters.phone.trim()
    const today = new Date()
    const todayValue = isoDate(today)
    const tomorrowValue = isoDate(addDays(today, 1))
    const nextSevenValue = isoDate(addDays(today, 7))
    return leads.filter((lead) => {
      const matchesName = !nameQuery || String(lead.name || '').toLowerCase().includes(nameQuery)
      const matchesPhone = !phoneQuery || String(lead.phone || '').includes(phoneQuery)
      const matchesStatus = !filters.status
        || lead.status === filters.status
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

      return matchesName && matchesPhone && matchesStatus && matchesSource && matchesFollowUp && matchesFollowUpBy && matchesImportant
    })
  }, [filters, leads])

  const statusSummaryBaseLeads = useMemo(() => {
    const nameQuery = filters.name.trim().toLowerCase()
    const phoneQuery = filters.phone.trim()
    const today = new Date()
    const todayValue = isoDate(today)
    const tomorrowValue = isoDate(addDays(today, 1))
    const nextSevenValue = isoDate(addDays(today, 7))
    return leads.filter((lead) => {
      const matchesName = !nameQuery || String(lead.name || '').toLowerCase().includes(nameQuery)
      const matchesPhone = !phoneQuery || String(lead.phone || '').includes(phoneQuery)
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

      return matchesName && matchesPhone && matchesSource && matchesFollowUp && matchesFollowUpBy && matchesImportant
    })
  }, [filters, leads])

  const hasFilters = Boolean(
    filters.name
    || filters.phone
    || filters.status
    || filters.source
    || filters.followUp
    || filters.followUpBy
    || filters.branch
    || filters.createdFrom
    || filters.createdTo
    || filters.importantOnly
  )
  const leadSummary = [
    { label: 'Total', value: '', count: statusSummaryBaseLeads.length },
    { label: 'New', value: 'new', count: statusCount(statusSummaryBaseLeads, 'new') },
    { label: 'Follow Up', value: 'follow_up', count: statusCount(statusSummaryBaseLeads, 'follow_up') },
    { label: 'Will Walk-in', value: 'will_walk_in', count: statusCount(statusSummaryBaseLeads, 'will_walk_in') },
    { label: 'Converted', value: 'converted', count: statusCount(statusSummaryBaseLeads, ['converted', 'converted_to_walkin']) },
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
    filters.source,
    filters.createdFrom,
    filters.createdTo,
    filters.importantOnly,
  ])

  useEffect(() => {
    api.get('/leads/staff-options/')
      .then(({ data }) => setStaffUsers(data || []))
      .catch(() => setStaffUsers([]))
  }, [])

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
      if (walkinDateFrom) params.walkin_date_from = walkinDateFrom
      if (walkinDateTo) params.walkin_date_to = walkinDateTo
      if (nextFollowUpDateFrom) params.next_follow_up_date_from = nextFollowUpDateFrom
      if (nextFollowUpDateTo) params.next_follow_up_date_to = nextFollowUpDateTo
      if (isSuperAdmin && filters.branch) params.branch = filters.branch
      if (filters.source) params.source = filters.source
      if (isSuperAdmin && filters.createdFrom) params.created_from = filters.createdFrom
      if (isSuperAdmin && filters.createdTo) params.created_to = filters.createdTo
      if (filters.importantOnly) params.important_only = true
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

  const leadQueryParams = (format) => {
    const params = { format }
    if (statusFilter || filters.status) params.status = statusFilter || filters.status
    if (walkinDateFrom) params.walkin_date_from = walkinDateFrom
    if (walkinDateTo) params.walkin_date_to = walkinDateTo
    if (nextFollowUpDateFrom) params.next_follow_up_date_from = nextFollowUpDateFrom
    if (nextFollowUpDateTo) params.next_follow_up_date_to = nextFollowUpDateTo
    if (filters.name.trim()) params.name = filters.name.trim()
    if (filters.phone.trim()) params.phone = filters.phone.trim()
    if (filters.followUpBy) params.follow_up_by = filters.followUpBy
    if (isSuperAdmin && filters.branch) params.branch = filters.branch
    if (filters.source) params.source = filters.source
    if (isSuperAdmin && filters.createdFrom) params.created_from = filters.createdFrom
    if (isSuperAdmin && filters.createdTo) params.created_to = filters.createdTo
    if (filters.importantOnly) params.important_only = true
    const today = new Date()
    if (filters.followUp === 'today') {
      params.next_follow_up_date_from = isoDate(today)
      params.next_follow_up_date_to = isoDate(today)
    } else if (filters.followUp === 'tomorrow') {
      const tomorrow = isoDate(addDays(today, 1))
      params.next_follow_up_date_from = tomorrow
      params.next_follow_up_date_to = tomorrow
    } else if (filters.followUp === 'next7') {
      params.next_follow_up_date_from = isoDate(today)
      params.next_follow_up_date_to = isoDate(addDays(today, 7))
    }
    return params
  }

  const exportLeads = async (format) => {
    setExporting(true)
    setLoadMessage('')
    try {
      await downloadExport('/leads/export/', leadQueryParams(format), `leads-export.${format === 'csv' ? 'csv' : 'xlsx'}`)
    } catch (error) {
      setLoadMessage(apiErrorMessage(error, 'Failed to export leads.'))
    } finally {
      setExporting(false)
    }
  }

  const updateLeadFollowUp = (leadId, followUp) => {
    setLeads((current) => current.map((lead) => (
      lead.id === leadId
        ? {
            ...lead,
            remarks: followUp.remarks || lead.remarks,
            next_follow_up_date: followUp.next_follow_up_date,
            latest_follow_up_at: followUp.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: lead.status === 'new' ? 'follow_up' : lead.status,
          }
        : lead
    )))
  }

  const updateLeadStatus = async (lead, status) => {
    if (!lead || !status || lead.status === status || statusSavingId) return
    const previousStatus = lead.status
    setStatusSavingId(lead.id)
    setLoadMessage('')
    setLeads((current) => current.map((item) => (
      item.id === lead.id ? { ...item, status, updated_at: new Date().toISOString() } : item
    )))
    try {
      const { data } = await api.patch(`/leads/${lead.id}/`, { status })
      setLeads((current) => current.map((item) => (
        item.id === lead.id
          ? {
              ...item,
              ...data,
              course_name: data.course_name ?? item.course_name,
              branch_name: data.branch_name ?? item.branch_name,
              assigned_to_name: data.assigned_to_name ?? item.assigned_to_name,
              assigned_user: data.assigned_user ?? item.assigned_user,
            }
          : item
      )))
    } catch (error) {
      setLeads((current) => current.map((item) => (
        item.id === lead.id ? { ...item, status: previousStatus } : item
      )))
      setLoadMessage(apiErrorMessage(error, 'Failed to update lead status.'))
    } finally {
      setStatusSavingId(null)
    }
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
    setFilters((current) => ({ ...current, [field]: value }))
  }

  const clearFilters = () => {
    setFilters({
      name: '',
      phone: '',
      status: '',
      source: '',
      followUp: '',
      followUpBy: '',
      branch: '',
      createdFrom: '',
      createdTo: '',
      importantOnly: false,
    })
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
          <ExportMenu onExport={exportLeads} exporting={exporting} />
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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,0.75fr)_minmax(220px,0.75fr)_auto] 2xl:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Name</span>
            <input
              value={filters.name}
              onChange={(event) => updateFilter('name', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Phone Number</span>
            <input
              value={filters.phone}
              onChange={(event) => updateFilter('phone', event.target.value)}
              inputMode="numeric"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-600">Search by Status</span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter('status', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              {statusFilters.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
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
          )}
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
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2 xl:col-span-4 2xl:col-span-1"
          >
            Clear Filters
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['today', 'Today Follow-up'],
            ['tomorrow', 'Tomorrow Follow-up'],
            ['next7', 'Next 7 Days Follow-up'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => updateFilter('followUp', filters.followUp === value ? '' : value)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                filters.followUp === value
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
        <StatusFilterChips
          items={leadSummary}
          value={filters.status}
          onChange={(value) => updateFilter('status', value)}
          className="border-b border-slate-200 px-6 py-4 sm:px-8"
        />
        {loadMessage && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700 sm:px-8">
            {loadMessage}
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
                  width: '74px',
                  className: 'flex items-center',
                  render: (lead) => <CreatedStamp value={lead.created_at} />,
                },
                {
                  key: 'name',
                  header: 'Name',
                  width: 'minmax(120px,1.1fr)',
                  className: 'flex items-center',
                  render: (lead) => (
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <ImportantToggle active={!!lead.is_important} onToggle={(nextValue) => toggleLeadImportant(lead, nextValue)} />
                        <OwnerDot user={lead.assigned_user} />
                        <Link to={`/leads/${lead.id}`} className="truncate font-bold text-slate-950 hover:text-cyan-700">{lead.name}</Link>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{lead.course_name || 'Course not selected'}</p>
                    </div>
                  ),
                },
                {
                  key: 'phone',
                  header: 'Phone',
                  width: '106px',
                  className: 'flex items-center',
                  render: (lead) => <span className="truncate text-sm font-semibold text-slate-800">{lead.phone || '-'}</span>,
                },
                {
                  key: 'source',
                  header: 'Source',
                  width: 'minmax(96px,0.85fr)',
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
                  width: '132px',
                  className: 'flex items-center',
                  render: (lead) => (
                    <div className="relative w-full max-w-[132px]">
                      <select
                        value={lead.status || 'new'}
                        onChange={(event) => updateLeadStatus(lead, event.target.value)}
                        disabled={statusSavingId === lead.id}
                        className={`w-full appearance-none rounded-full border px-3 py-1.5 pr-7 text-[11px] font-bold uppercase tracking-[0.08em] outline-none transition disabled:cursor-wait disabled:opacity-60 ${
                          statusTone(lead.status) === 'green'
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                            : statusTone(lead.status) === 'red'
                              ? 'border-rose-100 bg-rose-50 text-rose-700'
                              : statusTone(lead.status) === 'amber'
                                ? 'border-amber-100 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                        title="Update lead status"
                      >
                        {quickStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-current">v</span>
                    </div>
                  ),
                },
                { key: 'followUpBy', header: 'Follow Up By', width: 'minmax(100px,0.8fr)', className: 'flex items-center', render: (lead) => <span className="truncate text-sm font-medium text-slate-700">{assignedUserName(lead)}</span> },
                { key: 'nextFollowUp', header: 'Next Follow Up', width: '94px', className: 'flex items-center', render: (lead) => <span className="whitespace-nowrap text-sm font-semibold text-slate-700">{formatDateCompact(lead.next_follow_up_date)}</span> },
                ...(isSuperAdmin ? [{
                  key: 'branch',
                  header: 'Branch',
                  width: 'minmax(88px,0.75fr)',
                  className: 'flex items-center',
                  render: (lead) => <span className="truncate text-sm font-semibold text-slate-700">{lead.branch_name || '-'}</span>,
                }] : []),
                {
                  key: 'remark',
                  header: 'Latest Remark',
                  width: 'minmax(150px,1.35fr)',
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
