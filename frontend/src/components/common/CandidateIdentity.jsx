import { useState } from 'react'

const colorClasses = {
  purple: 'bg-purple-500 ring-purple-100',
  green: 'bg-emerald-500 ring-emerald-100',
  orange: 'bg-orange-500 ring-orange-100',
  blue: 'bg-blue-500 ring-blue-100',
  cyan: 'bg-cyan-500 ring-cyan-100',
  teal: 'bg-teal-500 ring-teal-100',
  amber: 'bg-amber-500 ring-amber-100',
  rose: 'bg-rose-500 ring-rose-100',
}

export const USER_COLOR_OPTIONS = [
  { value: '', label: 'Neutral', dotClass: 'bg-slate-400 ring-slate-100' },
  { value: 'purple', label: 'Purple', dotClass: colorClasses.purple },
  { value: 'green', label: 'Green', dotClass: colorClasses.green },
  { value: 'orange', label: 'Orange', dotClass: colorClasses.orange },
  { value: 'blue', label: 'Blue', dotClass: colorClasses.blue },
  { value: 'cyan', label: 'Cyan', dotClass: colorClasses.cyan },
  { value: 'teal', label: 'Teal', dotClass: colorClasses.teal },
  { value: 'amber', label: 'Amber', dotClass: colorClasses.amber },
  { value: 'rose', label: 'Rose', dotClass: colorClasses.rose },
]

export function userColorClass(color) {
  return colorClasses[color] || 'bg-slate-400 ring-slate-100'
}

export function OwnerDot({ user, className = '' }) {
  const color = user?.identity_color || user?.color || ''
  const label = user?.name || user?.full_name || user?.username || 'Unassigned'
  return (
    <span
      title={label}
      aria-label={`Owner: ${label}`}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${userColorClass(color)} ${className}`}
    />
  )
}

function compactUserName(user) {
  const name = user?.name || user?.full_name || user?.username || ''
  return name.trim().split(/\s+/)[0] || ''
}

export function TeamColorLegend({ users = [], className = '' }) {
  const seen = new Set()
  const uniqueUsers = users
    .filter((user) => compactUserName(user))
    .filter((user) => {
      const key = user?.id ? `id:${user.id}` : `name:${compactUserName(user).toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  const visibleUsers = uniqueUsers.slice(0, 6)
  const hiddenCount = uniqueUsers.length - visibleUsers.length

  if (visibleUsers.length === 0) return null

  return (
    <div className={`flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs font-medium text-slate-500 ${className}`}>
      {visibleUsers.map((user) => {
        const color = user?.identity_color || user?.color || ''
        const label = user?.name || user?.full_name || user?.username || compactUserName(user)
        return (
          <span key={user?.id || label} title={label} className="inline-flex max-w-[120px] items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${userColorClass(color).replace(/ ring-\S+/g, '')}`} />
            <span className="truncate">{compactUserName(user)}</span>
          </span>
        )
      })}
      {hiddenCount > 0 && <span className="text-slate-400">+{hiddenCount}</span>}
    </div>
  )
}

export function CandidateName({ children, owner, to }) {
  const content = (
    <>
      <OwnerDot user={owner} />
      <span className="truncate">{children}</span>
    </>
  )
  if (to) {
    return (
      <a href={to} className="inline-flex min-w-0 max-w-full items-center gap-2 font-bold text-slate-950 hover:text-cyan-700">
        {content}
      </a>
    )
  }
  return <span className="inline-flex min-w-0 max-w-full items-center gap-2 font-bold text-slate-950">{content}</span>
}

export function ImportantToggle({ active, onToggle, disabled = false }) {
  const [saving, setSaving] = useState(false)

  const handleClick = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (disabled || saving || !onToggle) return
    setSaving(true)
    try {
      await onToggle(!active)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || saving}
      title={active ? 'Unmark important' : 'Mark important'}
      aria-label={active ? 'Unmark important' : 'Mark important'}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none transition ${
        active ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:bg-slate-100 hover:text-amber-500'
      } disabled:opacity-60`}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

export function CandidateInfo({
  important,
  onImportantToggle,
  owner,
  primary,
  secondary,
  secondaryClassName = '',
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <ImportantToggle active={important} onToggle={onImportantToggle} />
        <OwnerDot user={owner} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">{primary}</div>
        <p className={`mt-1 ${secondaryClassName}`}>{secondary}</p>
      </div>
    </div>
  )
}

export function ImportantFilter({ checked, onChange }) {
  return (
    <label className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-cyan-200"
      />
      Important Only
    </label>
  )
}
