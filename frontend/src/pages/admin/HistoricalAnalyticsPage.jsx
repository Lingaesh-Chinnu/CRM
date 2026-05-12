import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'

const years = [2023, 2024, 2025]
const months = [
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
const preferredBranchOrder = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']

function normaliseListResponse(data) {
  return data.results || data
}

function emptyForm() {
  return {
    year: 2025,
    month: 1,
    branch: '',
    leads_count: '',
    walkins_count: '',
    enrollments_count: '',
    value_amount: '',
  }
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function branchSortIndex(branch) {
  const index = preferredBranchOrder.findIndex((name) => name.toLowerCase() === String(branch.name || '').toLowerCase())
  return index === -1 ? preferredBranchOrder.length : index
}

function preparePayload(values) {
  return {
    year: Number(values.year),
    month: Number(values.month),
    branch: Number(values.branch),
    leads_count: Number(values.leads_count),
    walkins_count: Number(values.walkins_count),
    enrollments_count: Number(values.enrollments_count),
    value_amount: Number(values.value_amount || 0),
  }
}

export default function HistoricalAnalyticsPage() {
  const [branches, setBranches] = useState([])
  const [entries, setEntries] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const visibleBranches = useMemo(
    () =>
      branches
        .filter((branch) => branch.is_active !== false)
        .filter((branch) => preferredBranchOrder.some((name) => name.toLowerCase() === String(branch.name || '').toLowerCase()))
        .sort((a, b) => branchSortIndex(a) - branchSortIndex(b) || String(a.name).localeCompare(String(b.name))),
    [branches]
  )

  useEffect(() => {
    loadPage()
  }, [])

  const loadPage = async () => {
    setLoading(true)
    try {
      const [branchesRes, entriesRes] = await Promise.all([
        api.get('/branches/'),
        api.get('/historical-analytics/'),
      ])
      setBranches(normaliseListResponse(branchesRes.data))
      setEntries(normaliseListResponse(entriesRes.data))
    } catch {
      setMessage('Failed to load historical analytics.')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
  }

  const saveEntry = async (event) => {
    event.preventDefault()
    setMessage('')

    const duplicate = entries.find(
      (entry) =>
        entry.id !== editingId &&
        Number(entry.year) === Number(form.year) &&
        Number(entry.month) === Number(form.month) &&
        Number(entry.branch) === Number(form.branch)
    )

    if (duplicate) {
      setMessage('An entry already exists for this year, month, and branch.')
      return
    }

    try {
      const payload = preparePayload(form)
      if (editingId) {
        await api.patch(`/historical-analytics/${editingId}/`, payload)
        setMessage('Historical analytics entry updated.')
      } else {
        await api.post('/historical-analytics/', payload)
        setMessage('Historical analytics entry saved.')
      }
      resetForm()
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to save historical analytics.')
    }
  }

  const editEntry = (entry) => {
    setEditingId(entry.id)
    setForm({
      year: entry.year,
      month: entry.month,
      branch: entry.branch,
      leads_count: entry.leads_count,
      walkins_count: entry.walkins_count,
      enrollments_count: entry.enrollments_count,
      value_amount: entry.value_amount || 0,
    })
    setMessage('')
  }

  const deleteEntry = async (entry) => {
    if (!window.confirm(`Delete historical analytics for ${entry.branch_name}, ${entry.month}/${entry.year}?`)) return
    try {
      await api.delete(`/historical-analytics/${entry.id}/`)
      setMessage('Historical analytics entry deleted.')
      if (editingId === entry.id) resetForm()
      await loadPage()
    } catch {
      setMessage('Failed to delete historical analytics entry.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Historical Analytics</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Past year monthly activity counts</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Enter 2023, 2024, and 2025 branch totals for leads, walk-ins, and enrollments.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={saveEntry} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">
            {editingId ? 'Edit historical entry' : 'Add historical entry'}
          </h2>
          <div className="mt-5 space-y-4">
            <select value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <select value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              {months.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <select value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" required>
              <option value="">Select branch</option>
              {visibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {[
              ['leads_count', 'Leads Count'],
              ['walkins_count', 'Walk-ins Count'],
              ['enrollments_count', 'Enrollments Count'],
            ].map(([field, label]) => (
              <input
                key={field}
                type="number"
                min="0"
                value={form[field]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                placeholder={label}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                required
              />
            ))}
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.value_amount}
              onChange={(event) => setForm({ ...form, value_amount: event.target.value })}
              placeholder="Value Amount"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            />
          </div>

          {message && <p className="mt-4 text-sm font-medium text-slate-600">{message}</p>}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              {editingId ? 'Update Entry' : 'Save Entry'}
            </button>
            <button type="button" onClick={resetForm} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Clear
            </button>
          </div>
        </form>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Historical records</h2>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {entries.length} Records
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading historical records...</div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-slate-500">No historical records available yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1120px]">
                <div className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <div>Branch</div>
                  <div>Month</div>
                  <div>Year</div>
                  <div>Leads</div>
                  <div>Walk-ins</div>
                  <div>Enrollments</div>
                  <div>Value</div>
                  <div>Action</div>
                </div>
                <div className="divide-y divide-slate-200">
                  {entries.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr_1fr] gap-4 px-6 py-5 text-sm">
                      <div className="font-semibold text-slate-950">{entry.branch_name}</div>
                      <div>{months.find((month) => month.value === Number(entry.month))?.label}</div>
                      <div>{entry.year}</div>
                      <div>{entry.leads_count}</div>
                      <div>{entry.walkins_count}</div>
                      <div>{entry.enrollments_count}</div>
                      <div className="font-semibold text-slate-950">{money(entry.value_amount)}</div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => editEntry(entry)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">
                          Edit
                        </button>
                        <button type="button" onClick={() => deleteEntry(entry)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
