import { useState } from 'react'

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset()
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10)
}

export default function FollowUpHistory({ followUps = [], onSave }) {
  const [form, setForm] = useState({
    next_follow_up_date: '',
    remarks: '',
    close_follow_up: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedFollowUp, setSelectedFollowUp] = useState(null)
  const sortedFollowUps = [...followUps].sort((a, b) => {
    const dateDiff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    return dateDiff || Number(b.id || 0) - Number(a.id || 0)
  })
  const latestFollowUp = sortedFollowUps[0]

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        follow_up_date: todayIso(),
        next_follow_up_date: form.close_follow_up ? null : form.next_follow_up_date,
        remarks: form.remarks.trim(),
        close_follow_up: form.close_follow_up,
      })
      setForm({
        next_follow_up_date: '',
        remarks: '',
        close_follow_up: false,
      })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save follow-up.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black tracking-tight text-slate-950">Remarks & Follow-up</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {sortedFollowUps.length} Total
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Latest Follow-up</p>
          <button
            type="button"
            onClick={() => {
              setSelectedFollowUp(latestFollowUp || null)
              setHistoryOpen(true)
            }}
            disabled={sortedFollowUps.length === 0}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            View All Follow-ups
          </button>
        </div>

        {latestFollowUp ? (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Remark</p>
              <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">{latestFollowUp.remarks || ''}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Next Follow-up Date</p>
              <p className="mt-1 font-semibold text-slate-900">{formatDate(latestFollowUp.next_follow_up_date) || 'No further follow-up'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Updated By</p>
                <p className="mt-1 font-semibold text-slate-900">{latestFollowUp.updated_by_name || ''}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Timestamp</p>
                <p className="mt-1 font-semibold text-slate-900">{formatDateTime(latestFollowUp.created_at)}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm font-medium text-slate-500">No follow-ups saved yet.</p>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-200 bg-white p-4 shadow-[0_18px_45px_-35px_rgba(34,211,238,0.55)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Add New Follow-up</p>
        <div className="mt-4 space-y-3">
          <textarea
            value={form.remarks}
            onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
            placeholder="Remark"
            className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
          />
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Next Follow-up Date
            </span>
            <input
              type="date"
              value={form.next_follow_up_date}
              onChange={(event) => setForm((current) => ({ ...current, next_follow_up_date: event.target.value }))}
              disabled={form.close_follow_up}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              required={!form.close_follow_up}
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={form.close_follow_up}
              onChange={(event) => setForm((current) => ({
                ...current,
                close_follow_up: event.target.checked,
                next_follow_up_date: event.target.checked ? '' : current.next_follow_up_date,
              }))}
              className="h-4 w-4 accent-slate-950"
            />
            No next follow-up needed
          </label>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={saving || !form.remarks.trim() || (!form.close_follow_up && !form.next_follow_up_date)}
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Follow-up'}
          </button>
        </div>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="grid w-full max-w-5xl gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_30px_90px_-35px_rgba(15,23,42,0.65)] lg:grid-cols-[360px_minmax(0,1fr)]">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">All Follow-ups</p>
                  <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">History</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {sortedFollowUps.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedFollowUp(entry)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedFollowUp?.id === entry.id
                        ? 'border-cyan-300 bg-cyan-50'
                        : 'border-slate-200 bg-slate-50 hover:bg-white'
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-950">{formatDate(entry.next_follow_up_date) || 'No date'}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{entry.remarks || 'No remark'}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {formatDateTime(entry.created_at)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-5">
              {selectedFollowUp ? (
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Remark</p>
                    <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-700">{selectedFollowUp.remarks || ''}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Next Follow-up Date</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatDate(selectedFollowUp.next_follow_up_date) || 'No further follow-up'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Updated By</p>
                      <p className="mt-1 font-semibold text-slate-900">{selectedFollowUp.updated_by_name || ''}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Timestamp</p>
                      <p className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedFollowUp.created_at)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-500">Select a follow-up to view details.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
