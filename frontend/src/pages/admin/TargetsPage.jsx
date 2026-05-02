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

export default function TargetsPage() {
  const [branches, setBranches] = useState([])
  const [targets, setTargets] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

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
        await api.patch(`/branch-targets/${existing.id}/`, preparePayload(form))
        setMessage('Target updated successfully.')
      } else {
        await api.post('/branch-targets/', preparePayload(form))
        setMessage('Targets saved successfully.')
      }

      setForm(emptyForm())
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to save targets.')
    }
  }

  const updateTargetField = (index, field, value) => {
    setTargets((current) => {
      const next = [...current]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const updateExistingTarget = async (target) => {
    setMessage('')
    try {
      await api.patch(`/branch-targets/${target.id}/`, preparePayload(target))
      setMessage(`Updated target for ${target.branch_name}.`)
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to update target.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Targets</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Branch walk-in, enrollment, and value targets</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Fix monthly targets for each branch and update them anytime from the same control room.
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
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
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
                  {targets.map((target, index) => (
                    <div key={target.id} className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr] gap-4 px-6 py-5">
                      <div className="flex items-center text-sm font-semibold text-slate-950">
                        {target.branch_name}
                      </div>
                      <select
                        value={target.month}
                        onChange={(event) => updateTargetField(index, 'month', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      >
                        {monthOptions.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={target.year}
                        onChange={(event) => updateTargetField(index, 'year', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                      <input
                        value={target.lead_target}
                        onChange={(event) => updateTargetField(index, 'lead_target', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                      <input
                        value={target.walkin_target}
                        onChange={(event) => updateTargetField(index, 'walkin_target', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                      <input
                        value={target.enroll_target}
                        onChange={(event) => updateTargetField(index, 'enroll_target', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                      <input
                        value={target.value_target ?? target.revenue_target}
                        onChange={(event) => updateTargetField(index, 'value_target', event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                      <button
                        onClick={() => updateExistingTarget(target)}
                        className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Save
                      </button>
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
