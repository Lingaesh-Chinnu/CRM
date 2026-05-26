import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

const statusOptions = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusClass(status) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'rejected') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

export default function CourseChangeRequestsPage() {
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [filters, setFilters] = useState({
    status: 'pending',
    branch: '',
    date: '',
    search: '',
  })
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
      const { data } = await api.get('/course-change-requests/', { params })
      setRows(data.results || data)
    } catch (error) {
      setRows([])
      setMessage(apiErrorMessage(error, 'Failed to load course change requests.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.get('/branches/').then(({ data }) => {
      setBranches(data.results || data)
    }).catch(() => setBranches([]))
  }, [])

  useEffect(() => {
    loadRows()
  }, [filters.status, filters.branch, filters.date, filters.search])

  const review = async (row, action) => {
    setMessage('')
    try {
      await api.post(`/course-change-requests/${row.id}/${action}/`, {
        admin_remarks: remarks[row.id] || '',
      })
      setMessage(action === 'approve' ? 'Course change request approved.' : 'Course change request rejected.')
      await loadRows()
    } catch (error) {
      setMessage(apiErrorMessage(error, `Failed to ${action} request.`))
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Course Change Requests</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Review staff requests, add remarks, and approve course changes without duplicating enrollments or payment records.
        </p>
        {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 border-b border-slate-200 px-6 py-5 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</span>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              {statusOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Branch</span>
            <select value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date</span>
            <input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Student, phone, course" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
          </label>
          <button type="button" onClick={() => setFilters({ status: '', branch: '', date: '', search: '' })} className="self-end rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Clear
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading requests...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No course change requests found.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {rows.map((row) => (
              <article key={row.id} className={`px-6 py-5 ${String(row.id) === String(highlightedId) ? 'bg-cyan-50/60' : ''}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-black tracking-tight text-slate-950">{row.student_name}</h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusClass(row.status)}`}>
                        {row.status_display || row.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {row.student_phone || '-'} | {row.branch_name || '-'} | Requested {formatDate(row.requested_at)}
                    </p>
                    <p className="mt-3 text-sm font-semibold text-slate-800">
                      {row.old_course_name || 'Current course'} to {row.requested_course_name || 'Requested course'}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Preferred batch: {formatDate(row.requested_batch_date)} | Fee: {money(row.old_fee)} to {money(row.new_fee)}
                    </p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{row.reason}</p>
                    {row.admin_remarks && <p className="mt-3 text-sm font-semibold text-slate-700">Admin remarks: {row.admin_remarks}</p>}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link to={`/students/${row.enrollment}`} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Student
                      </Link>
                      <Link to={`/enrollments/${row.enrollment}`} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Enrollment
                      </Link>
                    </div>
                  </div>

                  {row.status === 'pending' && (
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:w-[420px]">
                      <label>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Admin Remarks</span>
                        <textarea value={remarks[row.id] || ''} onChange={(event) => setRemarks((current) => ({ ...current, [row.id]: event.target.value }))} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
                      </label>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => review(row, 'reject')} className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                          Reject
                        </button>
                        <button type="button" onClick={() => review(row, 'approve')} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800">
                          Approve
                        </button>
                      </div>
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
