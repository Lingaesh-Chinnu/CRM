import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'

export default function LeadInboxPage() {
  const [leads, setLeads] = useState([])
  const [branches, setBranches] = useState([])
  const [message, setMessage] = useState('')

  const load = async () => {
    const [leadRes, branchRes] = await Promise.all([
      api.get('/leads/admin-inbox/'),
      api.get('/branches/'),
    ])
    setLeads(leadRes.data.results || leadRes.data)
    setBranches((branchRes.data.results || branchRes.data).filter((branch) => branch.is_active !== false))
  }

  useEffect(() => { load() }, [])

  const assignBranch = async (leadId, branchId) => {
    if (!branchId) return
    await api.post(`/leads/${leadId}/assign-branch/`, { branch: Number(branchId) })
    setMessage('Lead assigned and branch users notified.')
    await load()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin Lead Inbox</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Unassigned external leads</h1>
        {message && <p className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
      </section>
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {leads.length === 0 ? (
          <div className="p-6 text-slate-500">No unassigned leads.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {leads.map((lead) => (
              <div key={lead.id} className="grid gap-4 px-6 py-5 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-950">{lead.name}</p>
                    {lead.is_duplicate && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                        Duplicate
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {lead.phone} | {lead.course_name || lead.external_course_interested || 'No course'} | {lead.source_display || lead.source}
                  </p>
                  {lead.external_message && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{lead.external_message}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">{new Date(lead.created_at).toLocaleString('en-IN')}</p>
                </div>
                <select onChange={(event) => assignBranch(lead.id, event.target.value)} defaultValue="" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <option value="">Assign branch</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
                <Link to={`/leads/${lead.id}`} className="text-sm font-semibold text-slate-700 hover:text-slate-950">View details</Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
