import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const initialForm = {
  name: '',
  branch_code: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
  is_active: true,
}

function normaliseListResponse(data) {
  return data.results || data
}

export default function BranchesPage() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadBranches()
  }, [])

  const loadBranches = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/branches/')
      setBranches(normaliseListResponse(data))
    } catch {
      setMessage('Failed to load branches.')
    } finally {
      setLoading(false)
    }
  }

  const createBranch = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      await api.post('/branches/', form)
      setForm(initialForm)
      setMessage('Branch created successfully.')
      await loadBranches()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to create branch.')
    } finally {
      setSaving(false)
    }
  }

  const updateBranchField = (index, field, value) => {
    setBranches((current) => {
      const next = [...current]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const saveBranch = async (branch) => {
    setMessage('')
    try {
      await api.patch(`/branches/${branch.id}/`, {
        name: branch.name,
        branch_code: branch.branch_code || '',
        address: branch.address || '',
        city: branch.city || '',
        state: branch.state || '',
        pincode: branch.pincode || '',
        phone: branch.phone || '',
        is_active: !!branch.is_active,
      })
      setMessage(`Updated ${branch.name}.`)
      await loadBranches()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to update branch.')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Branches</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Branch management</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Add centers, update contact details, and keep branch status active or inactive without leaving the admin workspace.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={createBranch} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Add branch</h2>
          <div className="mt-5 space-y-4">
            {['name', 'branch_code', 'address', 'city', 'state', 'pincode', 'phone'].map((field) => (
              field === 'address' ? (
                <textarea
                  key={field}
                  value={form[field]}
                  placeholder={field}
                  onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  className="min-h-[110px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required={field === 'name'}
                />
              ) : (
                <input
                  key={field}
                  type="text"
                  value={form[field]}
                  placeholder={field === 'branch_code' ? 'branch code (auto if blank)' : field}
                  maxLength={field === 'branch_code' ? 2 : undefined}
                  onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                  required={field === 'name'}
                />
              )
            ))}

            <select
              value={form.is_active ? 'active' : 'inactive'}
              onChange={(event) => setForm({ ...form, is_active: event.target.value === 'active' })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create Branch'}
          </button>
        </form>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Branch directory</h2>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {branches.length} Branches
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading branches...</div>
          ) : branches.length === 0 ? (
            <div className="p-6 text-slate-500">No branches available yet.</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {branches.map((branch, index) => (
                <div key={branch.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[1.4fr_1fr_0.8fr]">
                  <div className="space-y-3">
                    <input
                      value={branch.branch_code || ''}
                      onChange={(event) => updateBranchField(index, 'branch_code', event.target.value)}
                      placeholder="Branch code"
                      maxLength={2}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold"
                    />
                    <input
                      value={branch.name || ''}
                      onChange={(event) => updateBranchField(index, 'name', event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold"
                    />
                    <textarea
                      value={branch.address || ''}
                      onChange={(event) => updateBranchField(index, 'address', event.target.value)}
                      className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    />
                  </div>

                  <div className="space-y-3">
                    {['city', 'state', 'pincode', 'phone'].map((field) => (
                      <input
                        key={field}
                        value={branch[field] || ''}
                        onChange={(event) => updateBranchField(index, field, event.target.value)}
                        placeholder={field}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                      />
                    ))}
                  </div>

                  <div className="space-y-3">
                    <select
                      value={branch.is_active ? 'active' : 'inactive'}
                      onChange={(event) => updateBranchField(index, 'is_active', event.target.value === 'active')}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button
                      onClick={() => saveBranch(branch)}
                      className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Save Branch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
