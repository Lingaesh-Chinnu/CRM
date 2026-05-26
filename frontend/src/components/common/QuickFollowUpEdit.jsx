import { useState } from 'react'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function QuickFollowUpEdit({
  type,
  recordId,
  remark = '',
  nextDate = '',
  followUpDate = '',
  onSaved,
}) {
  const [editing, setEditing] = useState(false)
  const [draftRemark, setDraftRemark] = useState('')
  const [draftDate, setDraftDate] = useState(nextDate || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const endpoint = type === 'walkin' ? 'walkins' : 'leads'

  const startEdit = () => {
    setDraftRemark('')
    setDraftDate(nextDate || todayIso())
    setError('')
    setEditing(true)
  }

  const save = async () => {
    if (!draftRemark.trim() || !draftDate) {
      setError('Enter a remark and next follow-up date.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post(`/${endpoint}/${recordId}/follow-ups/`, {
        remarks: draftRemark.trim(),
        follow_up_date: followUpDate || todayIso(),
        next_follow_up_date: draftDate,
      })
      setEditing(false)
      onSaved?.(data)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save follow-up.'))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draftRemark}
          onChange={(event) => setDraftRemark(event.target.value)}
          rows={2}
          placeholder="Add new remark"
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
          />
          <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">
            Cancel
          </button>
        </div>
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <p title={remark || 'No remarks'} className="line-clamp-2 min-h-[2.5rem] break-words text-sm font-medium leading-5 text-slate-800">
        {remark || 'No remarks'}
      </p>
      <button type="button" onClick={startEdit} className="mt-1 text-xs font-bold text-cyan-700 hover:text-cyan-900">
        Add follow-up
      </button>
    </div>
  )
}
