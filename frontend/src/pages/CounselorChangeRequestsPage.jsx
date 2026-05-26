import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../services/api'
import { apiErrorMessage } from '../utils/apiErrors'

const statuses = [
  { value: '', label: 'All' },
  { value: 'pending_counselor_approval', label: 'Pending Counselor' },
  { value: 'pending_admin_approval', label: 'Pending Admin' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
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

export default function CounselorChangeRequestsPage() {
  const [searchParams] = useSearchParams()
  const { user } = useSelector((state) => state.auth)
  const isAdmin = user?.role === 'super_admin'
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [filters, setFilters] = useState({ status: '', branch: '', date: '', search: '' })
  const [remarks, setRemarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const highlightedId = searchParams.get('request')

  const loadRows = async () => {
    setLoading(true)
    setMessage('')
    try {
      const params = {}
      if (filters.status) params.status = filters.status
      if (filters.branch) params.branch = filters.branch
      if (filters.date) params.date = filters.date
      if (filters.search) params.search = filters.search
      const { data } = await api.get('/counselor-change-requests/', { params })
      setRows(data.results || data)
    } catch (error) {
      setRows([])
      setMessage(apiErrorMessage(error, 'Failed to load counselor change requests.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    api.get('/branches/').then(({ data }) => setBranches(data.results || data)).catch(() => setBranches([]))
  }, [isAdmin])

  useEffect(() => {
    loadRows()
  }, [filters.status, filters.branch, filters.date, filters.search])

  const act = async (row, action) => {
    setMessage('')
    try {
      const payload = action.includes('counselor') ? { remarks: remarks[row.id] || '' } : { admin_remarks: remarks[row.id] || '' }
      await api.post(`/counselor-change-requests/${row.id}/${action}/`, payload)
      setMessage('Counselor change request updated.')
      await loadRows()
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to update counselor change request.'))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Approvals</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Counselor Change Requests</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Review counselor transfer requests with current counselor consent and admin final approval.
        </p>
        {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 border-b border-slate-200 px-6 py-5 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              {statuses.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {isAdmin && (
            <label>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Branch</span>
              <select value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
                <option value="">All branches</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          )}
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date</span>
            <input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Candidate, phone, counselor" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
          </label>
          <button type="button" onClick={() => setFilters({ status: '', branch: '', date: '', search: '' })} className="self-end rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Clear
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading requests...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No counselor change requests found.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {rows.map((row) => {
              const candidateLink = row.record_type === 'lead' ? `/leads/${row.lead}` : `/enrollments/${row.enrollment}`
              const canCounselorAct = row.status === 'pending_counselor_approval' && row.current_counselor === user?.id
              const canAdminAct = isAdmin && row.status === 'pending_admin_approval'
              const canForce = isAdmin && ['pending_counselor_approval', 'pending_admin_approval'].includes(row.status)
              return (
                <article key={row.id} className={`px-6 py-5 ${String(row.id) === String(highlightedId) ? 'bg-cyan-50/60' : ''}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-black tracking-tight text-slate-950">{row.candidate_name}</h2>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusClass(row.status)}`}>
                          {row.status_display || row.status}
                        </span>
                        {row.force_transfer && <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-700">Forced</span>}
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {row.candidate_phone || '-'} | {row.branch_name || '-'} | Requested {formatDateTime(row.requested_at)}
                      </p>
                      <p className="mt-3 text-sm font-semibold text-slate-800">
                        {row.current_counselor_name || 'Unassigned'} to {row.requested_counselor_name || 'Unassigned'}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">Requested by {row.requested_by_name || '-'}</p>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{row.reason}</p>
                      <div className="mt-4 grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sm:grid-cols-2">
                        <span>Counselor: {row.counselor_decision_at ? formatDateTime(row.counselor_decision_at) : 'Pending'}</span>
                        <span>Admin: {row.admin_decision_at ? formatDateTime(row.admin_decision_at) : 'Pending'}</span>
                      </div>
                      {(row.counselor_remarks || row.admin_remarks) && (
                        <div className="mt-3 space-y-1 text-sm text-slate-600">
                          {row.counselor_remarks && <p><span className="font-semibold text-slate-900">Counselor:</span> {row.counselor_remarks}</p>}
                          {row.admin_remarks && <p><span className="font-semibold text-slate-900">Admin:</span> {row.admin_remarks}</p>}
                        </div>
                      )}
                      <Link to={candidateLink} className="mt-4 inline-flex rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Open Candidate
                      </Link>
                    </div>

                    {(canCounselorAct || canAdminAct || canForce) && (
                      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:w-[420px]">
                        <label>
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Remarks</span>
                          <textarea value={remarks[row.id] || ''} onChange={(event) => setRemarks((current) => ({ ...current, [row.id]: event.target.value }))} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                        </label>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                          {canCounselorAct && (
                            <>
                              <button type="button" onClick={() => act(row, 'counselor-reject')} className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">Reject</button>
                              <button type="button" onClick={() => act(row, 'counselor-approve')} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">Approve</button>
                            </>
                          )}
                          {canAdminAct && (
                            <>
                              <button type="button" onClick={() => act(row, 'reject')} className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">Admin Reject</button>
                              <button type="button" onClick={() => act(row, 'approve')} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">Admin Approve</button>
                            </>
                          )}
                          {canForce && (
                            <button type="button" onClick={() => act(row, 'force-approve')} className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                              Force Transfer
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
