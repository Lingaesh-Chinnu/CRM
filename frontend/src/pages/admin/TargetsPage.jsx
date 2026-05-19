import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

function normaliseListResponse(data) {
  return data.results || data
}

function emptyForm() {
  const now = new Date()
  return {
    branch: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    lead_target: '',
    walkin_target: '',
    enroll_target: '',
    value_target: '',
  }
}

function formatValue(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function targetValue(target) {
  return target.value_target ?? target.revenue_target ?? 0
}

function DeleteIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

export default function TargetsPage() {
  const [branches, setBranches] = useState([])
  const [targets, setTargets] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [targetToDelete, setTargetToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadPage()
  }, [])

  const loadPage = async () => {
    setLoading(true)
    try {
      const [branchesRes, targetsRes] = await Promise.all([
        api.get('/branches/'),
        api.get('/branch-targets/'),
      ])
      setBranches(normaliseListResponse(branchesRes.data))
      setTargets(normaliseListResponse(targetsRes.data))
    } catch {
      setMessage('Failed to load targets.')
    } finally {
      setLoading(false)
    }
  }

  const preparePayload = (values) => ({
    branch: Number(values.branch),
    month: Number(values.month),
    year: Number(values.year),
    lead_target: Number(values.lead_target || 0),
    walkin_target: Number(values.walkin_target || 0),
    enroll_target: Number(values.enroll_target || 0),
    value_target: Number(values.value_target ?? values.revenue_target ?? 0),
  })

  const saveTarget = async (event) => {
    event.preventDefault()
    setMessage('')

    try {
      const existing = targets.find(
        (target) =>
          Number(target.branch) === Number(form.branch) &&
          Number(target.month) === Number(form.month) &&
          Number(target.year) === Number(form.year)
      )

      if (existing) {
        setMessage('Target already exists for this branch and month. Delete the existing target to create a new one.')
        return
      }

      await api.post('/branch-targets/', preparePayload(form))
      setMessage('Targets saved successfully.')
      setForm(emptyForm())
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(details?.detail || (typeof details === 'object' ? JSON.stringify(details) : 'Failed to save targets.'))
    }
  }

  const deleteTarget = async () => {
    if (!targetToDelete) return
    setMessage('')
    setDeleting(true)
    try {
      await api.delete(`/branch-targets/${targetToDelete.id}/`)
      setMessage('Target record deleted. You can create a new target for that branch and month.')
      setTargetToDelete(null)
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(details?.detail || (typeof details === 'object' ? JSON.stringify(details) : 'Failed to delete target.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Targets</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Branch walk-in, enrollment, and value targets</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Fix monthly targets for each branch. Saved records are locked; delete an old record before creating a replacement.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={saveTarget} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Set monthly targets</h2>
          <div className="mt-5 space-y-4">
            <select
              value={form.branch}
              onChange={(event) => setForm({ ...form, branch: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <select
              value={form.month}
              onChange={(event) => setForm({ ...form, month: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              required
            >
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>

            {['year', 'lead_target', 'walkin_target', 'enroll_target', 'value_target'].map((field) => (
              <input
                key={field}
                value={form[field]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                placeholder={field.replaceAll('_', ' ')}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              />
            ))}
          </div>

          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}

          <button className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
            Save Targets
          </button>
        </form>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Target records</h2>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {targets.length} Records
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading target records...</div>
          ) : targets.length === 0 ? (
            <div className="p-6 text-slate-500">No target records available yet.</div>
          ) : (
            <div className="grid gap-4 p-5 sm:p-6">
              {targets.map((target) => (
                <article key={target.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black tracking-tight text-slate-950">{target.branch_name}</h3>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {monthOptions.find((month) => Number(month.value) === Number(target.month))?.label || target.month} {target.year}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTargetToDelete(target)}
                      title="Delete Target"
                      aria-label={`Delete target for ${target.branch_name}`}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 hover:text-rose-800"
                    >
                      <DeleteIcon />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Leads</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{formatValue(target.lead_target)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Walk-ins</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{formatValue(target.walkin_target)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Enrollments</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{formatValue(target.enroll_target)}</p>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Value</p>
                      <p className="mt-1 text-lg font-black text-slate-950">₹{formatValue(targetValue(target))}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {targetToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black tracking-tight text-slate-950">Delete target record</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Are you sure you want to delete this target record? You can create a new target after deleting it.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setTargetToDelete(null)}
                disabled={deleting}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteTarget}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                <DeleteIcon />
                {deleting ? 'Deleting...' : 'Delete Target'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
