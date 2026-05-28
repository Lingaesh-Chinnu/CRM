function formatTimelineDate(value) {
  if (!value) return 'Not available'

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function CandidateTimeline({ candidate }) {
  const items = [
    { label: 'Lead Created', value: candidate?.lead_created_date },
    { label: 'Walkin Date', value: candidate?.walkin_date },
    { label: 'Enrollment', value: candidate?.enrollment_date },
    { label: 'First Payment', value: candidate?.first_payment_date },
  ]

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
      <h2 className="text-lg font-black tracking-tight text-slate-950">Candidate Timeline</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
              <p className="mt-1 font-semibold text-slate-950">{formatTimelineDate(item.value)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
