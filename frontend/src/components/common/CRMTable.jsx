import { Link } from 'react-router-dom'

export function StatusBadge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    red: 'bg-rose-50 text-rose-700 ring-rose-100',
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  }

  return (
    <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ring-1 ${tones[tone] || tones.slate}`}>
      <span className="truncate">{children}</span>
    </span>
  )
}

export function TableActionLink({ to, children = 'Open' }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50"
    >
      {children}
    </Link>
  )
}

export default function CRMTable({ columns, rows, keyField = 'id', emptyMessage = 'No records found.' }) {
  const gridTemplateColumns = columns.map((column) => column.width || 'minmax(0,1fr)').join(' ')

  return (
    <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white">
      <div className="hidden min-[900px]:block">
        <div
          className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"
          style={{ gridTemplateColumns }}
        >
          {columns.map((column) => (
            <div key={column.key} className={column.headerClassName || ''}>{column.header}</div>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm font-medium text-slate-500">{emptyMessage}</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {rows.map((row) => (
              <div
                key={row[keyField]}
                className="grid gap-3 px-4 py-3 text-sm transition hover:bg-slate-50"
                style={{ gridTemplateColumns }}
              >
                {columns.map((column) => (
                  <div key={column.key} className={`min-w-0 ${column.className || ''}`}>
                    {column.render ? column.render(row) : row[column.key]}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-200 min-[900px]:hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm font-medium text-slate-500">{emptyMessage}</div>
        ) : rows.map((row) => (
          <article key={row[keyField]} className="space-y-3 px-4 py-4">
            {columns.map((column) => (
              <div key={column.key} className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{column.header}</p>
                <div className="mt-1 text-sm text-slate-800">
                  {column.render ? column.render(row) : row[column.key]}
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </div>
  )
}
