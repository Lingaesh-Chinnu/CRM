import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'

const branchOptions = ['Hopes', 'Gandhipuram', 'Kuniyamuthur']

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

function CandidateTable({ rows, emptyText, actionLabel, actionClassName, onAction, history = false }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
      {rows.length === 0 ? (
        <div className="p-6 text-sm font-medium text-slate-500">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Phone</th>
                <th className="px-5 py-4">Branch</th>
                <th className="px-5 py-4">Course</th>
                <th className="px-5 py-4">Status</th>
                {history ? (
                  <>
                    <th className="px-5 py-4">Deleted By</th>
                    <th className="px-5 py-4">Deleted At</th>
                  </>
                ) : (
                  <>
                    <th className="px-5 py-4">Added Date</th>
                    <th className="px-5 py-4">Added By</th>
                  </>
                )}
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((candidate) => (
                <tr key={`${candidate.record_type}-${candidate.id}`} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-950">{candidate.name}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {candidate.record_type} {candidate.student_id ? `| ${candidate.student_id}` : ''}
                    </p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-700">{candidate.phone || '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{candidate.branch || '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{candidate.course || '-'}</td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {candidate.status || '-'}
                    </span>
                  </td>
                  {history ? (
                    <>
                      <td className="px-5 py-4 text-slate-600">{candidate.deleted_by || '-'}</td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(candidate.deleted_at)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-4 text-slate-600">{formatDate(candidate.added_date)}</td>
                      <td className="px-5 py-4 text-slate-600">{candidate.added_by || '-'}</td>
                    </>
                  )}
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onAction(candidate)}
                      className={actionClassName}
                      title={actionLabel}
                      aria-label={actionLabel}
                    >
                      {history ? actionLabel : <TrashIcon />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function DeleteCandidatesPage() {
  const [branches, setBranches] = useState([])
  const [branch, setBranch] = useState('all')
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState([])
  const [deletedCandidates, setDeletedCandidates] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const filteredBranches = useMemo(() => {
    const known = branches.filter((item) => branchOptions.includes(item.name))
    return known.length ? known : branches
  }, [branches])

  const load = async () => {
    setLoading(true)
    try {
      const params = { branch, search }
      const [activeRes, deletedRes, branchRes] = await Promise.all([
        api.get('/admin/delete-candidates/', { params }),
        api.get('/admin/delete-candidates/', { params: { ...params, deleted: 'true' } }),
        api.get('/branches/'),
      ])
      setCandidates(activeRes.data.results || activeRes.data)
      setDeletedCandidates(deletedRes.data.results || deletedRes.data)
      setBranches((branchRes.data.results || branchRes.data).filter((item) => item.is_active !== false))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [branch])

  const runSearch = (event) => {
    event.preventDefault()
    load()
  }

  const updateCandidate = async (candidate, action) => {
    if (action === 'delete') {
      const confirmed = window.confirm(`Delete ${candidate.name}? This will only soft delete the candidate.`)
      if (!confirmed) return
    }
    await api.post('/admin/delete-candidates/', {
      id: candidate.id,
      record_type: candidate.record_type,
      action,
    })
    setMessage(action === 'delete' ? 'Candidate moved to deleted history.' : 'Candidate restored.')
    await load()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin Only</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Delete Candidates</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium text-slate-500">
          Soft delete unwanted, test, or duplicate candidates and restore them from history when needed.
        </p>
        {message && <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
      </section>

      <form onSubmit={runSearch} className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] md:grid-cols-[220px_1fr_auto]">
        <select
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
        >
          <option value="all">All Branches</option>
          {filteredBranches.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by candidate name, phone number, or student ID"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400"
        />
        <button type="submit" className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">
          Search
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Candidates</h2>
          {loading && <span className="text-sm font-semibold text-slate-500">Loading...</span>}
        </div>
        <CandidateTable
          rows={candidates}
          emptyText="No active candidates found."
          actionLabel="Delete candidate"
          actionClassName="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 hover:bg-rose-100"
          onAction={(candidate) => updateCandidate(candidate, 'delete')}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-950">Deleted Candidates History</h2>
        <CandidateTable
          rows={deletedCandidates}
          emptyText="No deleted candidates found."
          actionLabel="Restore"
          actionClassName="inline-flex items-center justify-center rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
          onAction={(candidate) => updateCandidate(candidate, 'restore')}
          history
        />
      </section>
    </div>
  )
}
