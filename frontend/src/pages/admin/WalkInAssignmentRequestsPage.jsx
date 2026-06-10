import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

const statuses = [
  { value: '', label: 'All' },
  { value: 'pending_counselor_approval', label: 'Counselor Approval' },
  { value: 'pending_admin_approval', label: 'Admin Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const fieldTypes = [
  { value: '', label: 'All fields' },
  { value: 'assigned_to', label: 'Walk-in By' },
  { value: 'counseling_by', label: 'Counseling By' },
]

function statusClass(status) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (status === 'pending_admin_approval') return 'border-cyan-200 bg-cyan-50 text-cyan-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export default function WalkInAssignmentRequestsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useSelector((state) => state.auth)
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [filters, setFilters] = useState({ status: '', field_type: '', branch: '', search: '' })
  const [remarks, setRemarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const highlightedId = searchParams.get('request')

  const loadRows = async () => {
    setLoading(true)
    setMessage('')
    try {
      const params = {}
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value
      })
      const { data } = await api.get('/walkin-assignment-change-requests/', { params })
      setRows(data.results || data)
    } catch (error) {
      setRows([])
      setMessage(apiErrorMessage(error, 'Failed to load walk-in assignment requests.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.get('/branches/').then(({ data }) => setBranches(data.results || data)).catch(() => setBranches([]))
  }, [])

  useEffect(() => {
    loadRows()
  }, [filters.status, filters.field_type, filters.branch, filters.search])

  const act = async (row, action) => {
    setMessage('')
    try {
      await api.post(`/walkin-assignment-change-requests/${row.id}/${action}/`, {
        admin_remarks: remarks[row.id] || '',
      })
      setMessage(`Request ${action === 'approve' ? 'approved' : 'rejected'}.`)
      await loadRows()
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to update assignment request.'))
    }
  }

  const canAct = (row) => {
    if (row.status === 'pending_counselor_approval') return Number(row.requested_user) === Number(user?.id)
    if (row.status === 'pending_admin_approval') return user?.role === 'super_admin'
    return false
  }

  const remarksLabel = (row) => row.status === 'pending_counselor_approval' ? 'Counselor Remarks' : 'Admin Remarks'

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Approvals</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Walk-in Assignment Requests</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Requested counselors review changes first. Admin gives final approval after counselor acceptance.
        </p>
        {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 border-b border-slate-200 px-6 py-5 lg:grid-cols-5">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              {statuses.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Field</span>
            <select value={filters.field_type} onChange={(event) => setFilters((current) => ({ ...current, field_type: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              {fieldTypes.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Branch</span>
            <select value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Candidate, phone, user" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
          </label>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading requests...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No assignment requests found.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {rows.map((row) => (
              <article key={row.id} className={`px-6 py-5 ${String(row.id) === String(highlightedId) ? 'bg-cyan-50/60' : ''}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-black tracking-tight text-slate-950">{row.candidate_name}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusClass(row.status)}`}>
                        {row.status_display || row.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                        {row.field_type_display || row.field_type}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {row.candidate_phone || '-'} | {row.branch_name || '-'} | Requested {formatDateTime(row.created_at)}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-slate-800">
                      {row.previous_assignment_name || 'Unassigned'} to {row.requested_assignment_name || '-'}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">Requested by {row.requested_by_name || '-'}</p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{row.reason}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Counselor: {row.counselor_reviewed_at ? formatDateTime(row.counselor_reviewed_at) : 'Pending'}
                      {' | '}
                      Admin: {row.reviewed_at ? formatDateTime(row.reviewed_at) : 'Pending'}
                    </p>
                    {row.counselor_remarks && <p className="mt-2 text-sm text-slate-600"><span className="font-semibold text-slate-900">Counselor:</span> {row.counselor_remarks}</p>}
                    {row.admin_remarks && <p className="mt-2 text-sm text-slate-600"><span className="font-semibold text-slate-900">Admin:</span> {row.admin_remarks}</p>}
                    <Link to={`/walkins/${row.walkin}`} className="mt-4 inline-flex rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      Open Walk-in
                    </Link>
                  </div>

                  {canAct(row) && (
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:w-[420px]">
                      <label>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{remarksLabel(row)}</span>
                        <textarea value={remarks[row.id] || ''} onChange={(event) => setRemarks((current) => ({ ...current, [row.id]: event.target.value }))} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                      </label>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => act(row, 'reject')} className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">Reject</button>
                        <button type="button" onClick={() => act(row, 'approve')} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">Approve</button>
                      </div>
                    </div>
                  )}
                  {!canAct(row) && row.status !== 'approved' && row.status !== 'rejected' && (
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600 xl:w-[420px]">
                      Waiting for {row.status === 'pending_counselor_approval' ? 'requested counselor' : 'admin'} approval.
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
