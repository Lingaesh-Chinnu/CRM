import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { USER_COLOR_OPTIONS, OwnerDot } from '../../components/common/CandidateIdentity'

const initialForm = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'staff',
  branch: '',
  identity_color: '',
  password: '',
}

const starterBranches = [
  {
    name: 'Gandhipuram',
    address: 'Main center address',
    city: 'City 1',
    state: 'State 1',
    pincode: '600001',
    phone: '9000000001',
    email: 'branch1@example.com',
    is_active: true,
  },
  {
    name: 'Hopes',
    address: 'Second center address',
    city: 'City 2',
    state: 'State 2',
    pincode: '600002',
    phone: '9000000002',
    email: 'branch2@example.com',
    is_active: true,
  },
  {
    name: 'Kuniyamuthur',
    address: 'Third center address',
    city: 'City 3',
    state: 'State 3',
    pincode: '600003',
    phone: '9000000003',
    email: 'branch3@example.com',
    is_active: true,
  },
]

function normaliseListResponse(data) {
  return data.results || data
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPage()
  }, [])

  const loadPage = async () => {
    setLoading(true)
    try {
      const [usersRes, branchesRes] = await Promise.all([
        api.get('/users/'),
        api.get('/branches/'),
      ])
      setUsers(normaliseListResponse(usersRes.data))
      setBranches(normaliseListResponse(branchesRes.data))
    } catch {
      setMessage('Failed to load users page.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const payload = {
        ...form,
        branch: form.branch ? Number(form.branch) : null,
      }
      const { data } = await api.post('/users/', payload)
      setForm(initialForm)
      setMessage(data.detail || 'User created successfully. Login credentials sent to email.')
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to create user.')
    } finally {
      setSaving(false)
    }
  }

  const addStarterBranches = async () => {
    setMessage('')

    try {
      const existingNames = new Set(branches.map((branch) => branch.name?.toLowerCase()))
      const missingBranches = starterBranches.filter(
        (branch) => !existingNames.has(branch.name.toLowerCase())
      )

      if (!missingBranches.length) {
        setMessage('Starter branches already exist.')
        return
      }

      await Promise.all(missingBranches.map((branch) => api.post('/branches/', branch)))
      setMessage('Three starter branches are now available in the user form.')
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : 'Failed to add starter branches.')
    }
  }

  const updateUserField = (index, field, value) => {
    setUsers((current) => {
      const next = [...current]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const saveUser = async (user) => {
    setMessage('')
    try {
      await api.patch(`/users/${user.id}/`, {
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role,
        branch: user.branch || null,
        is_active: !!user.is_active,
        identity_color: user.identity_color || '',
      })
      setMessage(`Updated ${user.username}.`)
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : `Failed to update ${user.username}.`)
    }
  }

  const resetPassword = async (userId, username) => {
    const newPassword = window.prompt(`Enter a new password for ${username} (minimum 8 characters):`)
    if (!newPassword) return

    try {
      await api.post(`/users/${userId}/reset-password/`, { new_password: newPassword })
      setMessage(`Password reset for ${username}.`)
    } catch (error) {
      setMessage(error.response?.data?.error || 'Failed to reset password.')
    }
  }

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete ${user.username}? This cannot be undone.`)) return
    setMessage('')
    try {
      await api.delete(`/users/${user.id}/`)
      setMessage(`Deleted ${user.username}.`)
      await loadPage()
    } catch (error) {
      const details = error.response?.data
      setMessage(typeof details === 'object' ? JSON.stringify(details) : `Failed to delete ${user.username}.`)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Users</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Admin user control</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Create staff users, assign branches, promote admin access when needed, and keep every account active and up to date.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={handleCreate} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Create user</h2>
            <button
              type="button"
              onClick={addStarterBranches}
              className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
            >
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {['username', 'email', 'first_name', 'last_name', 'phone', 'password'].map((field) => (
              <input
                key={field}
                type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                placeholder={field.replaceAll('_', ' ')}
                value={form[field]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                required={['username', 'email', 'password'].includes(field)}
              />
            ))}

            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="staff">Staff</option>
              <option value="super_admin">Admin</option>
            </select>

            <select
              value={form.branch}
              onChange={(event) => setForm({ ...form, branch: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">Select a Branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>

            <select
              value={form.identity_color}
              onChange={(event) => setForm({ ...form, identity_color: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              {USER_COLOR_OPTIONS.map((option) => (
                <option key={option.value || 'neutral'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {message && <p className="mt-4 text-sm font-medium text-slate-600">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create User'}
          </button>
        </form>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-black tracking-tight text-slate-950">Team users</h2>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {users.length} Users
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-slate-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-6 text-slate-500">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[1250px]">
                <div className="grid grid-cols-[1.4fr_1.3fr_1fr_0.9fr_1fr_0.9fr_0.8fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <div>User</div>
                  <div>Contact</div>
                  <div>Role</div>
                  <div>Branch</div>
                  <div>Color</div>
                  <div>Status</div>
                  <div>Password</div>
                  <div>Actions</div>
                </div>

                <div className="divide-y divide-slate-200">
                  {users.map((user, index) => (
                    <div key={user.id} className="grid grid-cols-[1.4fr_1.3fr_1fr_0.9fr_1fr_0.9fr_0.8fr_1fr] gap-4 px-6 py-5">
                      <div className="space-y-3">
                        <input
                          value={user.first_name || ''}
                          onChange={(event) => updateUserField(index, 'first_name', event.target.value)}
                          placeholder="First name"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        />
                        <input
                          value={user.last_name || ''}
                          onChange={(event) => updateUserField(index, 'last_name', event.target.value)}
                          placeholder="Last name"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        />
                        <p className="text-sm font-semibold text-slate-900">{user.username}</p>
                      </div>

                      <div className="space-y-3">
                        <input
                          type="email"
                          value={user.email || ''}
                          onChange={(event) => updateUserField(index, 'email', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        />
                        <input
                          value={user.phone || ''}
                          onChange={(event) => updateUserField(index, 'phone', event.target.value)}
                          placeholder="Phone"
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        />
                      </div>

                      <div>
                        <select
                          value={user.role}
                          onChange={(event) => updateUserField(index, 'role', event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        >
                          <option value="staff">Staff</option>
                          <option value="super_admin">Admin</option>
                        </select>
                      </div>

                      <div>
                        <select
                          value={user.branch || ''}
                          onChange={(event) => updateUserField(index, 'branch', event.target.value ? Number(event.target.value) : null)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        >
                          <option value="">No branch</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex items-center gap-3">
                          <OwnerDot user={{ ...user, name: user.full_name || user.username }} />
                          <select
                            value={user.identity_color || ''}
                            onChange={(event) => updateUserField(index, 'identity_color', event.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                          >
                            {USER_COLOR_OPTIONS.map((option) => (
                              <option key={option.value || 'neutral'} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <select
                          value={user.is_active ? 'active' : 'inactive'}
                          onChange={(event) => updateUserField(index, 'is_active', event.target.value === 'active')}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="flex items-start">
                        <button
                          onClick={() => resetPassword(user.id, user.username)}
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                        >
                          Reset
                        </button>
                      </div>

                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => saveUser(user)}
                          className="h-11 flex-1 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(user)}
                          title="Delete User"
                          aria-label={`Delete user ${user.username}`}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 hover:text-rose-800"
                        >
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
