import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

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

function isoDate(value) {
  return value.toISOString().slice(0, 10)
}

function addDays(value, days) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function assignedUserName(lead) {
  return lead.assigned_user?.name || lead.assigned_to_name || 'Unassigned'
}

function sourceLabel(lead) {
  return lead.source_display || lead.source || 'Unknown'
}

const adminBranchNames = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']

function statusCount(rows, status) {
  return rows.filter((row) => row.status === status).length
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
  })
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
      const matchesStatus = !filters.status || lead.status === filters.status
      const leadSource = String(lead.source || '').toLowerCase()
      const filterSource = String(filters.source || '').toLowerCase()
      const matchesSource = !filterSource
        || (filterSource === '__unknown__' ? !leadSource : leadSource === filterSource)
      const assigneeId = lead.follow_up_by || lead.assigned_to || lead.assigned_user?.id || ''
      const matchesFollowUpBy = !filters.followUpBy || String(assigneeId) === String(filters.followUpBy)
      let matchesFollowUp = true
      const followUpDate = lead.next_follow_up_date || ''
      if (filters.followUp === 'today') {
        matchesFollowUp = followUpDate === todayValue
      } else if (filters.followUp === 'tomorrow') {
        matchesFollowUp = followUpDate === tomorrowValue
      } else if (filters.followUp === 'next7') {
        matchesFollowUp = Boolean(followUpDate) && followUpDate >= todayValue && followUpDate <= nextSevenValue
      }

      return matchesName && matchesPhone && matchesStatus && matchesSource && matchesFollowUp && matchesFollowUpBy
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
  )
  const leadSummary = [
    ['Total', filteredLeads.length],
    ['New', statusCount(filteredLeads, 'new')],
    ['Follow Up', statusCount(filteredLeads, 'follow_up')],
    ['Will Walk-in', statusCount(filteredLeads, 'will_walk_in')],
    ['Converted', statusCount(filteredLeads, 'converted')],
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

  const updateLeadPhone = (leadId, phone) => {
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, phone } : lead))
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
          <button
            type="button"
            onClick={() => setImportOpen(false)}
            aria-label="Close import leads modal"
            className="absolute right-4 top-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ff6b81] text-white shadow-[0_8px_18px_-10px_rgba(255,107,129,0.75)] transition duration-200 ease-out hover:scale-105 hover:bg-[#f25570] hover:shadow-[0_10px_22px_-10px_rgba(242,85,112,0.85)] focus:outline-none focus:ring-4 focus:ring-rose-100 sm:right-5 sm:top-5"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5.5 5.5L14.5 14.5M14.5 5.5L5.5 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
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
        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-6 py-4 text-xs font-bold text-slate-600 sm:px-8">
          {leadSummary.map(([label, value]) => (
            <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {label} {value}
            </span>
          ))}
        </div>
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
          <ul className="divide-y divide-slate-200">
            {filteredLeads.map((lead) => (
              <li key={lead.id}>
                <div className="px-6 py-5 transition hover:bg-slate-50 sm:px-8">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-center">
                    <div className="flex min-w-0 items-start gap-4">
                      <Link to={`/leads/${lead.id}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                        {lead.name?.charAt(0)?.toUpperCase() || '?'}
                      </Link>
                      <div className="min-w-0">
                        <Link to={`/leads/${lead.id}`} className="text-lg font-bold tracking-tight text-slate-950 hover:text-cyan-700">
                          {lead.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                          <PhoneNumberEditor recordType="lead" recordId={lead.id} phone={lead.phone} onSaved={(phone) => updateLeadPhone(lead.id, phone)} />
                          <span>{lead.course_name || 'Course not selected'}</span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800">Latest Remark: </span>
                            <span className="break-words">{lead.remarks || 'No remarks'}</span>
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800">Next Follow-up: </span>
                            {formatDate(lead.next_follow_up_date)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 lg:w-[190px] lg:items-stretch lg:justify-center">
                      <div className="w-full rounded-full bg-slate-100 px-3 py-1 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {statusLabel(lead.status)}
                      </div>
                      <div className="w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-center text-[11px] font-semibold text-slate-500">
                        Source: {sourceLabel(lead)}
                      </div>
                      <div className="w-full rounded-full border border-slate-200 bg-white px-3 py-1 text-center text-xs font-semibold text-slate-600">
                        Follow-up: {assignedUserName(lead)}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
