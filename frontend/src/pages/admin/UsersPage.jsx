import { useEffect, useState } from 'react'
import { api } from '../../services/api'

const initialForm = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  role: 'staff',
  branch: '',
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

function formatDate(value) {
  if (!value) return 'Date not set'

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getStatusLabel(value) {
  if (value === 'active') return 'Active'
  if (value === 'completed') return 'Completed'
  if (value === 'dropped') return 'Inactive'
  if (value === 'on_hold') return 'On Hold'
  return 'Unknown'
}

function getPaymentLabel(value) {
  if (value === 'paid') return 'Fully Paid'
  if (value === 'partial') return 'Partial'
  if (value === 'unpaid') return 'Pending'
  return 'Payment pending'
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [students, setStudents] = useState([])
  const [branches, setBranches] = useState([])
  const [studentFilters, setStudentFilters] = useState({
    branch: '',
    course: '',
    status: '',
    search: '',
  })
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingStudentId, setUpdatingStudentId] = useState(null)
  const [message, setMessage] = useState('')

  const courseOptions = Array.from(
    new Set(students.map((student) => student.course_name).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right))

  const filteredStudents = students.filter((student) => {
    const matchesBranch = !studentFilters.branch || String(student.branch_name || '') === String(
      branches.find((branch) => String(branch.id) === String(studentFilters.branch))?.name || ''
    )
    const matchesCourse = !studentFilters.course || student.course_name === studentFilters.course
    const matchesStatus = !studentFilters.status || student.status === studentFilters.status
    const searchValue = studentFilters.search.trim().toLowerCase()
    const matchesSearch =
      !searchValue ||
      student.name?.toLowerCase().includes(searchValue) ||
      student.student_number?.toLowerCase().includes(searchValue) ||
      student.phone?.toLowerCase().includes(searchValue) ||
      student.email?.toLowerCase().includes(searchValue)

    return matchesBranch && matchesCourse && matchesStatus && matchesSearch
  })

  useEffect(() => {
    loadPage()
  }, [])

  const loadPage = async () => {
    setLoading(true)
    try {
      const [usersRes, branchesRes, enrollmentsRes] = await Promise.all([
        api.get('/users/'),
        api.get('/branches/'),
        api.get('/enrollments/'),
      ])
      setUsers(normaliseListResponse(usersRes.data))
      setBranches(normaliseListResponse(branchesRes.data))
      setStudents(normaliseListResponse(enrollmentsRes.data))
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
      await api.post('/users/', {
        ...form,
        branch: form.branch ? Number(form.branch) : null,
      })
      setForm(initialForm)
      setMessage('User created successfully.')
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

  const updateStudentField = (studentId, field, value) => {
    setStudents((current) =>
      current.map((student) =>
        student.id === studentId ? { ...student, [field]: value } : student
      )
    )
  }

  const saveStudentStatus = async (studentId, status) => {
    setUpdatingStudentId(studentId)
    setMessage('')

    try {
      await api.patch(`/enrollments/${studentId}/`, { status })
      setMessage('Student status updated.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Failed to update student status.')
      await loadPage()
    } finally {
      setUpdatingStudentId(null)
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
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-[1.4fr_1.3fr_1fr_0.9fr_1fr_0.8fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <div>User</div>
                  <div>Contact</div>
                  <div>Role</div>
                  <div>Branch</div>
                  <div>Status</div>
                  <div>Password</div>
                  <div>Actions</div>
                </div>

                <div className="divide-y divide-slate-200">
                  {users.map((user, index) => (
                    <div key={user.id} className="grid grid-cols-[1.4fr_1.3fr_1fr_0.9fr_1fr_0.8fr_1fr] gap-4 px-6 py-5">
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

                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => saveUser(user)}
                          className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          className="w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                        >
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

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Students</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Enrolled students</h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {filteredStudents.length} Students
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 px-6 py-5">
          <label className="min-w-[180px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Branch
            </span>
            <select
              value={studentFilters.branch}
              onChange={(event) => setStudentFilters((current) => ({ ...current, branch: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[180px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Course
            </span>
            <select
              value={studentFilters.course}
              onChange={(event) => setStudentFilters((current) => ({ ...current, course: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All courses</option>
              {courseOptions.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[160px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Status
            </span>
            <select
              value={studentFilters.status}
              onChange={(event) => setStudentFilters((current) => ({ ...current, status: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="dropped">Inactive</option>
              <option value="on_hold">On Hold</option>
            </select>
          </label>

          <label className="min-w-[240px] flex-[1.3]">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Search
            </span>
            <input
              value={studentFilters.search}
              onChange={(event) => setStudentFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Student name, number, phone, email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading students...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-6 text-slate-500">No enrolled students match the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1220px]">
              <div className="grid grid-cols-[1.25fr_1.1fr_1fr_1fr_0.95fr_1fr_0.95fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <div>Student</div>
                <div>Course</div>
                <div>Enrollment Date</div>
                <div>Contact</div>
                <div>Branch</div>
                <div>Status</div>
                <div>Payment</div>
              </div>

              <div className="divide-y divide-slate-200">
                {filteredStudents.map((student) => (
                  <div key={student.id} className="grid grid-cols-[1.25fr_1.1fr_1fr_1fr_0.95fr_1fr_0.95fr] gap-4 px-6 py-5">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{student.name}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        {student.student_number}
                      </p>
                    </div>

                    <div className="text-sm text-slate-700">
                      {student.course_name || 'Course pending'}
                    </div>

                    <div className="text-sm text-slate-700">
                      {formatDate(student.enrollment_date)}
                    </div>

                    <div className="space-y-1 text-sm text-slate-700">
                      <p>{student.phone || 'Phone not added'}</p>
                      <p className="text-slate-500">{student.email || 'Email not added'}</p>
                    </div>

                    <div className="text-sm text-slate-700">
                      {student.branch_name || 'No branch'}
                    </div>

                    <div className="space-y-2">
                      <select
                        value={student.status || 'active'}
                        disabled={updatingStudentId === student.id}
                        onChange={async (event) => {
                          const nextStatus = event.target.value
                          updateStudentField(student.id, 'status', nextStatus)
                          await saveStudentStatus(student.id, nextStatus)
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:opacity-60"
                      >
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="dropped">Inactive</option>
                        <option value="on_hold">On Hold</option>
                      </select>
                      <p className="text-xs text-slate-500">{getStatusLabel(student.status)}</p>
                    </div>

                    <div className="space-y-1 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{getPaymentLabel(student.payment_status)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
