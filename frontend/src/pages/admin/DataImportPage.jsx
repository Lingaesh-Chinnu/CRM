import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import { downloadExport } from '../../utils/exportData'

const importTabs = [
  { value: 'leads', label: 'Leads' },
  { value: 'walkins', label: 'Walk-ins' },
  { value: 'courses', label: 'Courses' },
  { value: 'enrollments', label: 'Enrollments' },
  { value: 'students', label: 'Students' },
  { value: 'payments', label: 'Payments' },
]

const exportTabs = [
  { value: 'leads', label: 'Leads Export' },
  { value: 'walkins', label: 'Walkins Export' },
  { value: 'enrollments', label: 'Enrollments Export' },
  { value: 'students', label: 'Students Export' },
  { value: 'payments', label: 'Payments Export' },
  { value: 'courses', label: 'Courses Export' },
  { value: 'users', label: 'Users Report Export' },
]

const periodOptions = [
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_1_month', label: 'Last 1 Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_1_year', label: 'Last 1 Year' },
  { value: 'last_2_years', label: 'Last 2 Years' },
  { value: 'last_3_years', label: 'Last 3 Years' },
  { value: 'custom', label: 'Custom Date Range' },
]

function statusClass(status) {
  if (status === 'matched') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (status === 'missing') return 'text-rose-700 bg-rose-50 border-rose-200'
  return 'text-amber-700 bg-amber-50 border-amber-200'
}

export default function DataImportPage() {
  const [section, setSection] = useState('import')
  const [history, setHistory] = useState([])
  const [importType, setImportType] = useState('leads')
  const [exportType, setExportType] = useState('leads')
  const [period, setPeriod] = useState('last_1_month')
  const [branch, setBranch] = useState('')
  const [user, setUser] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [branches, setBranches] = useState([])
  const [users, setUsers] = useState([])
  const [exportPreview, setExportPreview] = useState(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/admin-data-import/'),
      api.get('/branches/').catch(() => ({ data: [] })),
      api.get('/leads/staff-options/').catch(() => ({ data: [] })),
    ])
      .then(([importRes, branchesRes, usersRes]) => {
        setHistory(importRes.data.history || [])
        setBranches(branchesRes.data.results || branchesRes.data || [])
        setUsers(usersRes.data.results || usersRes.data || [])
      })
      .catch((error) => setMessage(apiErrorMessage(error, 'Failed to load Data House setup.')))
  }, [])

  const exportParams = (download = false) => ({
    type: exportType,
    period,
    ...(branch ? { branch } : {}),
    ...(user ? { user } : {}),
    ...(period === 'custom' && dateFrom ? { date_from: dateFrom } : {}),
    ...(period === 'custom' && dateTo ? { date_to: dateTo } : {}),
    ...(download ? { download: 1 } : {}),
  })

  const previewExport = async () => {
    setExportLoading(true)
    setMessage('')
    try {
      const { data } = await api.get('/admin-data-export/', { params: exportParams(false) })
      setExportPreview(data)
    } catch (error) {
      setExportPreview(null)
      setMessage('Export generation failed. Please try again.')
    } finally {
      setExportLoading(false)
    }
  }

  const downloadDataExport = async () => {
    setExportLoading(true)
    setMessage('')
    try {
      await downloadExport('/admin-data-export/', exportParams(true), `${exportType}.xlsx`)
    } catch (error) {
      setMessage('Export generation failed. Please try again.')
    } finally {
      setExportLoading(false)
    }
  }

  const previewImport = async (event) => {
    event.preventDefault()
    if (!file) {
      setMessage('Upload an Excel .xlsx or CSV file.')
      return
    }
    const form = new FormData()
    form.append('file', file)
    form.append('import_type', importType)
    setLoading(true)
    setMessage('')
    setImportSummary(null)
    try {
      const { data } = await api.post('/admin-data-import/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(data)
      setHistory((current) => [data.history, ...current.filter((row) => row.id !== data.history?.id)])
    } catch (error) {
      const data = error.response?.data
      if (data?.column_results) {
        setPreview(data)
        setHistory((current) => [data.history, ...current.filter((row) => row.id !== data.history?.id)])
      }
      setMessage(apiErrorMessage(error, 'Validation failed.'))
    } finally {
      setLoading(false)
    }
  }

  const confirmImport = async () => {
    if (!preview?.preview_token) return
    setLoading(true)
    setMessage('')
    try {
      const { data } = await api.post('/admin-data-import/', {
        action: 'confirm',
        preview_token: preview.preview_token,
      })
      setMessage(`Import complete. Imported ${data.rows_imported} rows.`)
      setImportSummary({
        ...(data.import_summary || {}),
        new_records_added: data.import_summary?.new_records_added ?? data.rows_imported ?? 0,
        duplicates_skipped: data.history?.rows_skipped || 0,
        invalid_rows: data.history?.rows_failed || data.rows_failed || 0,
        failed_rows: data.import_summary?.failed_rows ?? data.rows_failed ?? 0,
      })
      setPreview(null)
      setFile(null)
      setHistory((current) => [data.history, ...current.filter((row) => row.id !== data.history?.id)])
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Import failed.'))
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = async () => {
    const response = await api.get('/admin-data-import/template/', {
      params: { type: importType },
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${importType}-import-template.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Data House</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ['import', 'Import Data'],
            ['export', 'Export Data'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${section === value ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {section === 'import' && (
      <>
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="flex flex-wrap gap-2">
          {importTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setImportType(tab.value)
                setPreview(null)
                setImportSummary(null)
                setMessage('')
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${importType === tab.value ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={previewImport} className="mt-5 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Download Template
          </button>
          <label className="block min-w-0">
            <span className="sr-only">Excel File</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null)
                setPreview(null)
                setImportSummary(null)
              }}
              className="min-h-[48px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-inner file:mr-4 file:rounded-xl file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900 file:shadow-sm transition focus:border-cyan-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-cyan-100"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[48px] items-center justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Validating...' : 'Validate & Preview'}
          </button>
        </form>

        {preview?.column_results && (
          <div className="mt-6">
            <h2 className="text-lg font-black tracking-tight text-slate-950">Column Validation</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {preview.column_results.map((result) => (
                <div key={result.field} className={`rounded-2xl border p-4 ${statusClass(result.status)}`}>
                  <p className="text-sm font-black">{result.label}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]">
                    {result.status === 'matched' ? 'Matched' : result.status === 'missing' ? 'Missing' : 'Optional'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview?.summary && (
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Ready to Import</p>
              <p className="mt-2 text-2xl font-black">{preview.summary.ready_to_import}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Skipped Duplicates</p>
              <p className="mt-2 text-2xl font-black">{preview.summary.skipped_duplicates}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 text-rose-800">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Invalid Rows</p>
              <p className="mt-2 text-2xl font-black">{preview.summary.invalid_rows}</p>
            </div>
          </div>
        )}

        {(preview?.missing_columns?.length > 0 || preview?.extra_columns?.length > 0) && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-black text-rose-900">Missing columns</p>
              <p className="mt-2 text-sm text-rose-800">{preview.missing_columns?.join(', ') || 'None'}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-900">Extra columns</p>
              <p className="mt-2 text-sm text-amber-800">{preview.extra_columns?.join(', ') || 'None'}</p>
            </div>
          </div>
        )}

        {preview?.invalid_order && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-black text-rose-900">Template order mismatch</p>
            <p className="mt-2 text-sm text-rose-800">
              Use the downloaded template without renaming or reordering columns.
            </p>
          </div>
        )}

        {preview?.ready_rows?.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Row</th>
                  {Object.keys(preview.ready_rows[0].preview).slice(0, 6).map((key) => <th key={key} className="px-4 py-3">{key}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.ready_rows.slice(0, 10).map((row) => (
                  <tr key={row.row}>
                    <td className="px-4 py-3 font-semibold">{row.row}</td>
                    {Object.keys(row.preview).slice(0, 6).map((key) => <td key={key} className="px-4 py-3">{row.preview[key] || '-'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(preview?.failed_rows?.length > 0 || preview?.skipped_rows?.length > 0) && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-900">Errors and skipped rows</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm text-amber-900">
              {[...(preview.failed_rows || []), ...(preview.skipped_rows || [])].slice(0, 50).map((row) => (
                <p key={`${row.row}-${row.skip_reason || row.errors?.join(',')}`}>
                  Row {row.row}: {row.skip_reason || row.errors?.join(' ')}
                </p>
              ))}
            </div>
          </div>
        )}

        {message && <p className="mt-5 text-sm font-semibold text-slate-600">{message}</p>}

        {importSummary && (
          <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Import Summary</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Imported to</p>
                <p className="mt-1 text-sm font-black">
                  {importSummary.imported_to?.length
                    ? importSummary.imported_to.map((item) => `${item.branch} Branch`).join(', ')
                    : 'No branch records'}
                </p>
              </div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">New Records Added</p><p className="mt-1 text-2xl font-black">{importSummary.new_records_added || 0}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Duplicate Records Skipped</p><p className="mt-1 text-2xl font-black">{importSummary.duplicates_skipped || 0}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Invalid Rows</p><p className="mt-1 text-2xl font-black">{importSummary.invalid_rows || 0}</p></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Failed Rows</p>
                <p className="mt-1 text-2xl font-black">{importSummary.failed_rows || 0}</p>
              </div>
            </div>
          </div>
        )}

        {preview?.preview_token && preview?.summary?.ready_to_import > 0 && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={confirmImport}
              disabled={loading}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? 'Importing...' : 'Confirm Import'}
            </button>
          </div>
        )}
      </section>
      </>
      )}

      {section === 'export' && (
        <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-6">
          <div className="flex flex-wrap gap-2">
            {exportTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setExportType(tab.value)
                  setExportPreview(null)
                }}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold ${exportType === tab.value ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Date Filter</span>
              <select value={period} onChange={(event) => { setPeriod(event.target.value); setExportPreview(null) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Branch</span>
              <select value={branch} onChange={(event) => { setBranch(event.target.value); setExportPreview(null) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                <option value="">All branches</option>
                {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">User / Counselor</span>
              <select value={user} onChange={(event) => { setUser(event.target.value); setExportPreview(null) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                <option value="">All users</option>
                {users.map((item) => <option key={item.id} value={item.id}>{item.name || item.full_name || item.username}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-3">
              <button type="button" onClick={previewExport} disabled={exportLoading} className="min-h-[48px] rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {exportLoading ? 'Loading...' : 'Preview'}
              </button>
              <button type="button" onClick={downloadDataExport} disabled={exportLoading} className="min-h-[48px] rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60">
                Download Excel
              </button>
            </div>
            {period === 'custom' && (
              <>
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">From Date</span>
                  <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setExportPreview(null) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900" />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">To Date</span>
                  <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setExportPreview(null) }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900" />
                </label>
              </>
            )}
          </div>

          {message && <p className="mt-5 text-sm font-semibold text-slate-600">{message}</p>}

          {exportPreview && (
            <div className="mt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-slate-950">{exportPreview.label}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Showing {exportPreview.rows.length} of {exportPreview.total} {exportPreview.label}
                  </p>
                </div>
                <p className="text-sm text-slate-500">
                  {exportPreview.filters.branch} / {exportPreview.filters.user} / {exportPreview.filters.period}
                </p>
              </div>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      {exportPreview.headers.slice(0, 8).map((header) => <th key={header} className="px-4 py-3">{header}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exportPreview.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.slice(0, 8).map((value, index) => <td key={index} className="px-4 py-3">{value || '-'}</td>)}
                      </tr>
                    ))}
                    {exportPreview.rows.length === 0 && (
                      <tr>
                        <td colSpan={Math.min(exportPreview.headers.length, 8)} className="px-4 py-8 text-center text-slate-500">No records match these filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {section === 'import' && (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <h2 className="text-xl font-black tracking-tight text-slate-950">Import History</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Imported By</th>
                <th className="px-4 py-3">Imported</th>
                <th className="px-4 py-3">Skipped</th>
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.file_name}</td>
                  <td className="px-4 py-3">{row.import_type_display || row.import_type}</td>
                  <td className="px-4 py-3">{row.imported_by_name || 'Admin'}</td>
                  <td className="px-4 py-3">{row.rows_imported}</td>
                  <td className="px-4 py-3">{row.rows_skipped}</td>
                  <td className="px-4 py-3">{row.rows_failed}</td>
                  <td className="px-4 py-3">{row.status_display || row.status}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">No imports yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  )
}
