export default function StatusFilterChips({ items, value, onChange, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-2 text-xs font-bold text-slate-600 ${className}`}>
      {items.map((item) => {
        const active = String(value || '') === String(item.value || '')
        return (
          <button
            key={item.value || 'total'}
            type="button"
            onClick={() => onChange(item.value || '')}
            aria-pressed={active}
            className={`rounded-full border px-3 py-1 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-100 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-cyan-100 ${
              active
                ? 'border-slate-950 bg-slate-950 text-white shadow-[0_8px_22px_-12px_rgba(15,23,42,0.9)]'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}
          >
            <span>{item.label}</span>
            <span className={active ? 'ml-1 text-white' : 'ml-1 text-slate-950'}>{item.count}</span>
          </button>
        )
      })}
    </div>
  )
}
