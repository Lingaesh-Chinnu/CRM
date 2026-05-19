import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

const branchOrder = ['Gandhipuram', 'Hopes', 'Kuniyamuthur']

function statusClass(status) {
  if (status === 'closed') return 'bg-slate-100 text-slate-700 border-slate-200'
  if (status === 'archived') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function audienceLabel(notice) {
  if (notice.audience_type === 'all_branches') return 'All Branches'
  return notice.branch_name || 'Specific Branch'
}

export default function TeamBoardPage() {
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const [notices, setNotices] = useState([])
  const [branches, setBranches] = useState([])
  const [selectedId, setSelectedId] = useState(searchParams.get('notice') || '')
  const [branchFilter, setBranchFilter] = useState(searchParams.get('branch') || '')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    message: '',
    audience_type: 'all_branches',
    branch: '',
  })

  const selectedNotice = useMemo(
    () => notices.find((notice) => String(notice.id) === String(selectedId)) || notices[0] || null,
    [notices, selectedId]
  )

  useEffect(() => {
    if (!isSuperAdmin) return
    api.get('/branches/')
      .then(({ data }) => {
        const rows = data.results || data || []
        setBranches(
          rows
            .filter((branch) => branchOrder.includes(branch.name))
            .sort((a, b) => branchOrder.indexOf(a.name) - branchOrder.indexOf(b.name))
        )
      })
      .catch(() => setBranches([]))
  }, [isSuperAdmin])

  useEffect(() => {
    fetchNotices()
  }, [branchFilter, isSuperAdmin])

  useEffect(() => {
    const noticeId = searchParams.get('notice') || ''
    if (noticeId) setSelectedId(noticeId)
  }, [searchParams])

  const fetchNotices = async () => {
    setLoading(true)
    try {
      const params = {}
      if (isSuperAdmin && branchFilter) params.branch = branchFilter
      const { data } = await api.get('/team-notices/', { params })
      const rows = data.results || data || []
      setNotices(rows)
      if (!selectedId && rows[0]) setSelectedId(String(rows[0].id))
      setMessage('')
    } catch (error) {
      setNotices([])
      setMessage(apiErrorMessage(error, 'Failed to load Team Board.'))
    } finally {
      setLoading(false)
    }
  }

  const openNotice = async (notice) => {
    setSelectedId(String(notice.id))
    setSearchParams({ notice: String(notice.id), ...(isSuperAdmin && branchFilter ? { branch: branchFilter } : {}) })
    try {
      const { data } = await api.get(`/team-notices/${notice.id}/`)
      setNotices((current) => current.map((item) => item.id === data.id ? data : item))
    } catch {
      // Non-blocking: list data is still usable.
    }
  }

  const createNotice = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        ...form,
        branch: form.audience_type === 'specific_branch' ? form.branch : null,
      }
      const { data } = await api.post('/team-notices/', payload)
      setForm({ title: '', message: '', audience_type: 'all_branches', branch: '' })
      setNotices((current) => [data, ...current])
      setSelectedId(String(data.id))
      setMessage('Notice posted to Team Board.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to post notice.'))
    } finally {
      setSaving(false)
    }
  }

  const submitReply = async (event) => {
    event.preventDefault()
    if (!selectedNotice || !reply.trim()) return
    setSaving(true)
    setMessage('')
    try {
      await api.post(`/team-notices/${selectedNotice.id}/reply/`, { reply_message: reply.trim() })
      setReply('')
      const { data } = await api.get(`/team-notices/${selectedNotice.id}/`)
      setNotices((current) => current.map((item) => item.id === data.id ? data : item))
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to submit reply.'))
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (action) => {
    if (!selectedNotice) return
    setSaving(true)
    try {
      const { data } = await api.post(`/team-notices/${selectedNotice.id}/${action}/`)
      setNotices((current) => current.map((item) => item.id === data.id ? data : item))
      setMessage(action === 'close' ? 'Notice closed.' : 'Notice archived.')
    } catch (error) {
      setMessage(apiErrorMessage(error, `Failed to ${action} notice.`))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Team Board</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Team Notice Board</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Internal CRM notices and branch replies.
        </p>
      </section>

      {isSuperAdmin && (
        <form onSubmit={createNotice} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px]">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Notice title"
              required
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white"
            />
            <select
              value={form.audience_type}
              onChange={(event) => setForm((current) => ({ ...current, audience_type: event.target.value, branch: '' }))}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900"
            >
              <option value="all_branches">All Branches</option>
              <option value="specific_branch">Specific Branch</option>
            </select>
            <select
              value={form.branch}
              onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))}
              disabled={form.audience_type !== 'specific_branch'}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              <option value="">Select branch</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>
          <textarea
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            placeholder="Write internal team notice..."
            required
            rows={4}
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white"
          />
          <button disabled={saving} className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Posting...' : 'Post Notice'}
          </button>
        </form>
      )}

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {isSuperAdmin && (
          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-5 py-4">
            {[{ id: '', name: 'All Branches' }, ...branches].map((branch) => (
              <button
                key={branch.id || 'all-branches'}
                type="button"
                onClick={() => {
                  const value = branch.id ? String(branch.id) : ''
                  setBranchFilter(value)
                  setSearchParams(value ? { branch: value } : {})
                }}
                className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] ${
                  branchFilter === String(branch.id || '') ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-600'
                }`}
              >
                {branch.name}
              </button>
            ))}
          </div>
        )}
        {message && <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">{message}</div>}
        <div className="grid min-h-[520px] lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            {loading ? (
              <div className="p-5 text-sm text-slate-500">Loading notices...</div>
            ) : notices.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">No team notices found.</div>
            ) : notices.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => openNotice(notice)}
                className={`block w-full border-b border-slate-100 px-5 py-4 text-left hover:bg-slate-50 ${
                  selectedNotice?.id === notice.id ? 'bg-cyan-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-black tracking-tight text-slate-950">{notice.title}</h2>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass(notice.status)}`}>
                    {notice.status}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{notice.message}</p>
                <p className="mt-3 text-xs font-semibold text-slate-500">{audienceLabel(notice)} | {notice.created_display}</p>
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-6">
            {!selectedNotice ? (
              <div className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">Select a notice to view replies.</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight text-slate-950">{selectedNotice.title}</h2>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Posted by {selectedNotice.created_by_name || 'Admin'} | {selectedNotice.created_display}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">{audienceLabel(selectedNotice)}</span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(selectedNotice.status)}`}>{selectedNotice.status}</span>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{selectedNotice.message}</p>
                </div>

                {isSuperAdmin && selectedNotice.status === 'active' && (
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => updateStatus('close')} disabled={saving} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                      Close
                    </button>
                    <button type="button" onClick={() => updateStatus('archive')} disabled={saving} className="rounded-2xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700">
                      Archive
                    </button>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Replies</h3>
                  <div className="mt-3 space-y-3">
                    {(selectedNotice.replies || []).length === 0 ? (
                      <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No replies yet.</p>
                    ) : selectedNotice.replies.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-500">
                          <span>{item.replied_by_name || 'User'}{item.branch_name ? ` | ${item.branch_name}` : ''}</span>
                          <span>{item.created_display}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{item.reply_message}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {!isSuperAdmin && selectedNotice.status === 'active' && (
                  <form onSubmit={submitReply} className="rounded-2xl border border-slate-200 p-4">
                    <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Reply</label>
                    <textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      rows={4}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white"
                      placeholder="Write your reply inside CRM..."
                    />
                    <button disabled={saving || !reply.trim()} className="mt-3 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                      Submit Reply
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
