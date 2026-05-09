import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { fetchMe } from '../../store/slices/authSlice'

export default function ChangePasswordPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')

    if (form.new_password !== form.confirm_password) {
      setMessage('New passwords do not match.')
      return
    }

    setSaving(true)
    try {
      await api.post('/auth/change-password/', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      await dispatch(fetchMe()).unwrap()
      navigate('/dashboard', { replace: true })
    } catch (error) {
      const details = error.response?.data
      if (details?.new_password) {
        setMessage(Array.isArray(details.new_password) ? details.new_password.join(' ') : details.new_password)
      } else if (details?.current_password) {
        setMessage(details.current_password)
      } else {
        setMessage('Failed to change password.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Account security</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Change password</h1>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            placeholder="Current password"
            value={form.current_password}
            onChange={(event) => setForm({ ...form, current_password: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            required
          />
          <input
            type="password"
            placeholder="New password"
            value={form.new_password}
            onChange={(event) => setForm({ ...form, new_password: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={form.confirm_password}
            onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            required
          />
        </div>

        {message && <p className="mt-4 text-sm font-medium text-rose-600">{message}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}
