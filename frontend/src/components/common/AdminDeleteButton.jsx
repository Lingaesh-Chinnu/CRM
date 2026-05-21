import { useState } from 'react'

export default function AdminDeleteButton({
  label = 'record',
  onConfirm,
  disabled = false,
  buttonClassName = '',
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const confirmDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await onConfirm()
      setOpen(false)
    } catch (err) {
      setError(err?.response?.data?.detail || `Failed to delete ${label}.`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        title="Delete Record"
        aria-label="Delete Record"
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        disabled={disabled}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
      >
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v5" />
          <path d="M14 11v5" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black tracking-tight text-slate-950">Delete {label}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Are you sure you want to permanently delete this record?
            </p>
            {error && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
            <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="inline-flex min-w-[110px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex min-w-[140px] justify-center whitespace-nowrap rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
