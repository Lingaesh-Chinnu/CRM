import { useState } from 'react'
import ModalCloseButton from './ModalCloseButton'

function formatDateTime(value) {
  if (!value) return 'Not provided'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function counselorLabel(user) {
  if (!user) return ''
  const name = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username
  return user.branch_name ? `${name} - ${user.branch_name}` : name
}

export default function CounselorReassignmentPanel({
  enrollment,
  counselors = [],
  isAdmin = false,
  saving = false,
  onReassign,
}) {
  const [open, setOpen] = useState(false)
  const [selectedCounselor, setSelectedCounselor] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const history = enrollment?.counselor_change_history || []

  const startChange = () => {
    setSelectedCounselor('')
    setReason('')
    setError('')
    setOpen(true)
  }

  const submit = async () => {
    if (!selectedCounselor) {
      setError('Select a counselor.')
      return
    }
    setError('')
    try {
      await onReassign?.({ counselor: selectedCounselor, reason: reason.trim() })
      setOpen(false)
    } catch {
      setError('Failed to reassign counselor.')
    }
  }

  return (
    <>
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned Counselor</p>
            <p className="mt-2 text-lg font-black text-slate-950">{enrollment?.counselor_name || 'Not assigned'}</p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={startChange}
              className="w-fit rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Request Counselor Change
            </button>
          )}
        </div>

        <div className="mt-5 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Counselor History</h3>
          {history.length === 0 ? (
            <p className="mt-3 text-sm font-medium text-slate-500">No counselor reassignment history.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {history.map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">
                    {item.old_counselor_name || 'Unassigned'} -&gt; {item.new_counselor_name || 'Unassigned'}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {formatDateTime(item.changed_at)} | Changed by {item.changed_by_name || 'Admin'}
                  </p>
                  {item.reason ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.reason}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {open && (
        <div onClick={saving ? undefined : () => setOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div onClick={(event) => event.stopPropagation()} className="relative w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl">
            <ModalCloseButton onClick={() => setOpen(false)} disabled={saving} label="Close counselor reassignment modal" />
            <h3 className="pr-10 text-lg font-black tracking-tight text-slate-950">Request Counselor Change</h3>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">New Counselor</span>
                <select
                  value={selectedCounselor}
                  onChange={(event) => setSelectedCounselor(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                >
                  <option value="">Select counselor</option>
                  {counselors.map((counselor) => (
                    <option key={counselor.id} value={counselor.id} disabled={String(counselor.id) === String(enrollment?.counselor_id || '')}>
                      {counselorLabel(counselor)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-600">Reason</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  placeholder="Optional reason"
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
                />
              </label>
              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
            </div>
            <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
              <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex min-w-[110px] justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={saving} className="inline-flex min-w-[150px] justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? 'Saving...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
