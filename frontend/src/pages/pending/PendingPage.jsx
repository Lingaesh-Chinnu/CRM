import { Link, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import QuickFollowUpEdit from '../../components/common/QuickFollowUpEdit'

const moduleConfig = {
  leads: { title: 'Lead Pending', endpoint: '/pending/leads/', detailPrefix: '/leads', followType: 'lead' },
  walkins: { title: 'Walk-in Pending', endpoint: '/pending/walkins/', detailPrefix: '/walkins', followType: 'walkin' },
  payments: { title: 'Payment Pending', endpoint: '/pending/payments/', detailPrefix: '/payments' },
}

const durationOptions = [
  { value: '', label: 'All overdue' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' },
]

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function statusTone(status) {
  if (['paid', 'converted', 'enrolled', 'active'].includes(status)) return 'green'
  if (['partial', 'follow_up', 'pending'].includes(status)) return 'amber'
  if (['unpaid', 'not_interested', 'dropped'].includes(status)) return 'red'
  return 'slate'
}

export default function PendingPage() {
  const { module = 'leads' } = useParams()
  const config = moduleConfig[module] || moduleConfig.leads
  const { user } = useSelector((state) => state.auth)
  const isAdmin = user?.role === 'super_admin'
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [filters, setFilters] = useState({
    branch: '',
    user: '',
    duration: '',
    date_from: '',
    date_to: '',
  })

  const params = useMemo(() => {
    const next = {}
    if (isAdmin && filters.branch) next.branch = filters.branch
    if (filters.user) next.user = filters.user
    if (filters.duration) next.duration = filters.duration
    if (filters.duration === 'custom') {
      if (filters.date_from) next.date_from = filters.date_from
      if (filters.date_to) next.date_to = filters.date_to
    }
    return next
  }, [filters, isAdmin])

  const loadRows = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(config.endpoint, { params })
      setRows(data.results || [])
      setMessage('')
    } catch (error) {
      setRows([])
      setMessage(apiErrorMessage(error, 'Failed to load pending items.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [config.endpoint, params])

  useEffect(() => {
    Promise.all([
      isAdmin ? api.get('/branches/') : Promise.resolve({ data: [] }),
      api.get('/leads/staff-options/', { params: isAdmin && filters.branch ? { branch: filters.branch } : {} }),
    ])
      .then(([branchRes, userRes]) => {
        setBranches(branchRes.data.results || branchRes.data || [])
        setUsers(userRes.data.results || userRes.data || [])
      })
      .catch(() => {
        setBranches([])
        setUsers([])
      })
  }, [isAdmin, filters.branch])

  const updateFollowUp = (id) => {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  const leadWalkinColumns = [
    { key: 'due', header: 'Due Date', width: '92px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{formatDate(row.due_date)}</span> },
    { key: 'name', header: 'Candidate', width: 'minmax(140px,1fr)', className: 'flex items-center', render: (row) => <div className="min-w-0"><Link to={row.detail_url || `${config.detailPrefix}/${row.id}`} className="truncate font-bold text-slate-950 hover:text-cyan-700">{row.name}</Link><p className="mt-1 truncate text-xs text-slate-500">{row.phone || '-'}</p></div> },
    { key: 'course', header: 'Course', width: 'minmax(120px,0.9fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.course_name || '-'}</span> },
    ...(isAdmin ? [{ key: 'branch', header: 'Branch', width: 'minmax(90px,0.7fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.branch_name || '-'}</span> }] : []),
    { key: 'status', header: 'Status', width: '108px', className: 'flex items-center', render: (row) => <StatusBadge tone={statusTone(row.status)}>{row.status_display || row.status}</StatusBadge> },
    { key: 'user', header: 'Counselor', width: 'minmax(100px,0.75fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.assigned_to_name || '-'}</span> },
    { key: 'remarks', header: 'Quick Update', width: 'minmax(180px,1.2fr)', className: 'flex items-center', render: (row) => <QuickFollowUpEdit type={config.followType} recordId={row.id} remark={row.remarks} nextDate={row.due_date} followUpDate={row.due_date} onSaved={() => updateFollowUp(row.id)} /> },
  ]

  const paymentColumns = [
    { key: 'due', header: 'Due Date', width: '92px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{formatDate(row.due_date)}</span> },
    { key: 'student', header: 'Student', width: 'minmax(140px,1fr)', className: 'flex items-center', render: (row) => <div className="min-w-0"><Link to={row.detail_url || `/payments/${row.id}`} className="truncate font-bold text-slate-950 hover:text-cyan-700">{row.student_name}</Link><p className="mt-1 truncate text-xs text-slate-500">{row.student_number || row.phone || '-'}</p></div> },
    { key: 'course', header: 'Course', width: 'minmax(110px,0.85fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.course_name || '-'}</span> },
    ...(isAdmin ? [{ key: 'branch', header: 'Branch', width: 'minmax(90px,0.7fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.branch_name || '-'}</span> }] : []),
    { key: 'installment', header: 'Installment', width: 'minmax(120px,0.9fr)', className: 'flex items-center', render: (row) => <span className="truncate text-slate-700">{row.installment_label || '-'}</span> },
    { key: 'dueAmount', header: 'Due', width: '96px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{money(row.due_amount)}</span> },
    { key: 'balance', header: 'Balance', width: '100px', className: 'flex items-center', render: (row) => <span className="whitespace-nowrap font-semibold text-slate-900">{money(row.pending_balance)}</span> },
    { key: 'action', header: 'Action', width: '104px', className: 'flex items-center', render: (row) => <Link to={row.detail_url || `/payments/${row.id}`} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">Collect</Link> },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Pending</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{config.title}</h1>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {isAdmin && (
            <select value={filters.branch} onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value, user: '' }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
              <option value="">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          )}
          <select value={filters.user} onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <option value="">All users</option>
            {users.map((item) => <option key={item.id} value={item.id}>{item.name || item.full_name || item.username}</option>)}
          </select>
          <select value={filters.duration} onChange={(event) => setFilters((current) => ({ ...current, duration: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            {durationOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {filters.duration === 'custom' && (
            <>
              <input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
              <input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold" />
            </>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {message && <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-700">{message}</div>}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-black tracking-tight text-slate-950">{rows.length} pending items</h2>
        </div>
        {loading ? (
          <div className="p-6 text-slate-500">Loading pending items...</div>
        ) : (
          <div className="p-4">
            <CRMTable rows={rows} columns={module === 'payments' ? paymentColumns : leadWalkinColumns} emptyMessage="No pending items found." />
          </div>
        )}
      </section>
    </div>
  )
}
