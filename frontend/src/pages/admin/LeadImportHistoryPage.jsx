import { useEffect, useState } from 'react'
import { api } from '../../services/api'

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN')
}

function statusClass(status) {
  if (status === 'success') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'partial') return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-rose-50 text-rose-700 ring-rose-200'
}

export default function LeadImportHistoryPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRows()
  }, [])

  const loadRows = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/lead-import-history/')
      setRows(data.results || data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Lead Import History</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Counselor lead import monitoring</h1>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        {loading ? (
          <div className="p-6 text-slate-500">Loading import history...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No lead imports recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[1.1fr_1fr_1.4fr_1.2fr_0.7fr_0.7fr_0.7fr_0.8fr_0.9fr] gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <div>Uploaded By</div>
                <div>Branch</div>
                <div>File Name</div>
                <div>Uploaded</div>
                <div>Total</div>
                <div>Success</div>
                <div>Failed</div>
                <div>Status</div>
                <div>Error Log</div>
              </div>
              <div className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.1fr_1fr_1.4fr_1.2fr_0.7fr_0.7fr_0.7fr_0.8fr_0.9fr] gap-4 px-6 py-5 text-sm text-slate-700">
                    <div className="font-semibold text-slate-950">{row.uploaded_by_name || '-'}</div>
                    <div>{row.branch_name || '-'}</div>
                    <div className="break-all">{row.file_name}</div>
                    <div>{formatDateTime(row.created_at)}</div>
                    <div>{row.total_rows}</div>
                    <div>{row.success_count}</div>
                    <div>{row.failed_count}</div>
                    <div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(row.status)}`}>
                        {row.status_display}
                      </span>
                    </div>
                    <div className="max-h-28 overflow-auto text-xs">
                      {(row.error_log || []).length === 0 ? '-' : row.error_log.map((error, index) => (
                        <p key={index} className="mb-1">Row {error.row || '-'}: {error.error}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
