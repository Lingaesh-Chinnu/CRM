import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

function statusLabel(status) {
  if (!status) return 'Unknown'
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function LeadsListPage() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')
  const { user } = useSelector((state) => state.auth)
  const canImportLeads = user?.role && user.role !== 'super_admin'
  const [searchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const walkinDateFrom = searchParams.get('walkin_date_from') || ''
  const walkinDateTo = searchParams.get('walkin_date_to') || ''
  const nextFollowUpDateFrom = searchParams.get('next_follow_up_date_from') || ''
  const nextFollowUpDateTo = searchParams.get('next_follow_up_date_to') || ''
  const focus = searchParams.get('focus') || ''

  useEffect(() => {
    fetchLeads()
  }, [statusFilter, walkinDateFrom, walkinDateTo, nextFollowUpDateFrom, nextFollowUpDateTo, focus])

  const fetchLeads = async () => {
    setLoading(true)
    try {
      const params = {}
      if (statusFilter) params.status = statusFilter
      if (walkinDateFrom) params.walkin_date_from = walkinDateFrom
      if (walkinDateTo) params.walkin_date_to = walkinDateTo
      if (nextFollowUpDateFrom) params.next_follow_up_date_from = nextFollowUpDateFrom
      if (nextFollowUpDateTo) params.next_follow_up_date_to = nextFollowUpDateTo
      const { data } = await api.get('/leads/', { params })
      setLeads(data.results || data)
    } catch (error) {
      console.error('Failed to fetch leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateLeadPhone = (leadId, phone) => {
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, phone } : lead))
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
            Leads
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Prospect pipeline
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
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">Import leads</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Required headings: Candidate Name, Phone Number, Course Interested, Branch, How They Know IIE, Follow-up Date, Remarks.
              </p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
                Note: Accepts only csv and xlsx files.
              </p>
            </div>
            <button type="button" onClick={() => setImportOpen(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-900">
              Close
            </button>
          </div>
          <form onSubmit={submitImport} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              required
            />
            <button disabled={importing} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {importing ? 'Importing...' : 'Upload & Import'}
            </button>
          </form>
          {importError && <p className="mt-4 text-sm font-semibold text-rose-700">{importError}</p>}
          {importResult && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
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

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
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
        ) : (
          <ul className="divide-y divide-slate-200">
            {leads.map((lead) => (
              <li key={lead.id}>
                <div className="px-6 py-5 transition hover:bg-slate-50 sm:px-8">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <Link to={`/leads/${lead.id}`} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
                        {lead.name?.charAt(0)?.toUpperCase() || '?'}
                      </Link>
                      <div>
                        <Link to={`/leads/${lead.id}`} className="text-lg font-bold tracking-tight text-slate-950 hover:text-cyan-700">
                          {lead.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                          <PhoneNumberEditor recordType="lead" recordId={lead.id} phone={lead.phone} onSaved={(phone) => updateLeadPhone(lead.id, phone)} />
                          <span>{lead.location || 'Location pending'}</span>
                          <span>{lead.course_name || 'Course not selected'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {statusLabel(lead.status)}
                      </div>
                      <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {lead.source_display || (lead.source ? statusLabel(lead.source) : 'No source')}
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
