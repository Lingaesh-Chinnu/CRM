function formatDateTime(value) {
  if (!value) return 'Unknown time'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function StatusHistory({ rows = [] }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
      <h2 className="text-lg font-black tracking-tight text-slate-950">Status History</h2>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No status changes recorded yet.</p>
      ) : (
        <ol className="mt-5 space-y-3">
          {rows.map((item) => (
            <li key={item.id} className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-950">
                {item.old_status_display || 'Initial'} <span className="px-1 text-slate-400">→</span> {item.new_status_display}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(item.changed_at)}{item.changed_by_name ? ` by ${item.changed_by_name}` : ''}</p>
              {item.remarks && <p className="mt-2 text-sm text-slate-700">{item.remarks}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
