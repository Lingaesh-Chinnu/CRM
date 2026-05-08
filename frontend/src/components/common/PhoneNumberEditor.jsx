import { useState } from 'react'
import { api } from '../../services/api'

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

export default function PhoneNumberEditor({ recordType, recordId, phone, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(phone || '')
  const [pendingPhone, setPendingPhone] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const currentPhone = phone || ''

  const startEdit = () => {
    setDraft(currentPhone)
    setError('')
    setMessage('')
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraft(currentPhone)
    setError('')
    setEditing(false)
  }

  const requestSave = () => {
    const nextPhone = digitsOnly(draft)
    const oldPhone = digitsOnly(currentPhone)

    if (!nextPhone) {
      setDraft(currentPhone)
      setError('')
      setEditing(false)
      return
    }
    if (nextPhone.length !== 10) {
      setError('Phone number should be 10 digits.')
      return
    }
    if (nextPhone === oldPhone) {
      setDraft(currentPhone)
      setError('')
      setEditing(false)
      return
    }

    setPendingPhone(nextPhone)
    setConfirmOpen(true)
  }

  const confirmSave = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data } = await api.post(`/phone-numbers/${recordType}/${recordId}/`, { phone: pendingPhone })
      onSaved?.(data.phone)
      setDraft(data.phone)
      setEditing(false)
      setConfirmOpen(false)
      setMessage('Phone number updated successfully.')
    } catch (err) {
      setConfirmOpen(false)
      setError(err.response?.data?.phone || err.response?.data?.detail || 'Unable to update phone number.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      {editing ? (
        <div className="flex flex-nowrap items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Phone number"
            className="h-9 min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
          />
          <button type="button" onClick={requestSave} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
            Save
          </button>
          <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-nowrap items-center gap-2">
          <span className="font-semibold text-slate-900">{currentPhone || 'Phone not added'}</span>
          <button type="button" onClick={startEdit} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 hover:bg-slate-50">
            Edit
          </button>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      {message && <p className="text-xs font-semibold text-emerald-700">{message}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black tracking-tight text-slate-950">Confirm phone change</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Are you sure you want to change the phone number from {currentPhone} to {pendingPhone}?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={saving} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                Cancel
              </button>
              <button type="button" onClick={confirmSave} disabled={saving} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? 'Saving...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
