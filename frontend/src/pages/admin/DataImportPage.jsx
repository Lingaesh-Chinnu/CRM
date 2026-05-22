import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'

const importTabs = [
  { value: 'leads', label: 'Import Leads' },
  { value: 'enrollments', label: 'Import Enrollments' },
  { value: 'payments', label: 'Import Payments' },
]

function statusClass(status) {
  if (status === 'matched') return 'text-emerald-700 bg-emerald-50 border-emerald-200'
  if (status === 'missing') return 'text-rose-700 bg-rose-50 border-rose-200'
  return 'text-amber-700 bg-amber-50 border-amber-200'
}

export default function DataImportPage() {
  const [config, setConfig] = useState(null)
  const [history, setHistory] = useState([])
  const [importType, setImportType] = useState('leads')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.get('/admin-data-import/')
      .then(({ data }) => {
        setConfig(data.types)
        setHistory(data.history || [])
      })
      .catch((error) => setMessage(apiErrorMessage(error, 'Failed to load import setup.')))
  }, [])

  const fields = useMemo(() => config?.[importType]?.fields || [], [config, importType])
  const requiredFields = useMemo(() => config?.[importType]?.required || [], [config, importType])
  const requiredHeadings = fields.filter((field) => requiredFields.includes(field.field)).map((field) => field.label)

  const previewImport = async (event) => {
    event.preventDefault()
    if (!file) {
      setMessage('Upload an Excel .xlsx file.')
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
        duplicates_skipped: data.history?.rows_skipped || 0,
        invalid_rows: data.history?.rows_failed || data.rows_failed || 0,
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
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Data Import</h1>
          </div>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex min-w-[190px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Download Sample Template
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
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

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Template columns</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Uploads must use the downloaded template columns in the same names and order.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fields.map((field) => (
                <span key={field.field} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {field.label}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Required headings</p>
            <p className="mt-2 text-sm leading-6 text-amber-900">{requiredHeadings.join(', ')}</p>
          </div>
        </div>

        <form onSubmit={previewImport} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Excel File</span>
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null)
                setPreview(null)
                setImportSummary(null)
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="self-end rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
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
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Leads Added</p><p className="mt-1 text-2xl font-black">{importSummary.leads_added || 0}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Enrollments Added</p><p className="mt-1 text-2xl font-black">{importSummary.enrollments_added || 0}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Payments Updated</p><p className="mt-1 text-2xl font-black">{importSummary.payments_updated || 0}</p></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Skipped / Invalid</p>
                <p className="mt-1 text-2xl font-black">{importSummary.duplicates_skipped || 0} / {importSummary.invalid_rows || 0}</p>
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
    </div>
  )
}
