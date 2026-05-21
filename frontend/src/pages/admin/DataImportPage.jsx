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
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState(null)
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
  const headers = preview?.headers || []

  const previewImport = async (event) => {
    event.preventDefault()
    if (!file) {
      setMessage('Upload an Excel .xlsx file.')
      return
    }
    const form = new FormData()
    form.append('file', file)
    form.append('import_type', importType)
    form.append('mapping', JSON.stringify(mapping))
    setLoading(true)
    setMessage('')
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
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Admin</p>
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
                setMapping({})
                setMessage('')
              }}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold ${importType === tab.value ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {tab.label}
            </button>
          ))}
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
            <h2 className="text-lg font-black tracking-tight text-slate-950">Column Mapping</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fields.map((field) => {
                const result = preview.column_results.find((item) => item.field === field.field)
                return (
                  <div key={field.field} className={`rounded-2xl border p-4 ${statusClass(result?.status)}`}>
                    <p className="text-sm font-black">{field.label}</p>
                    <select
                      value={mapping[field.field] || result?.header || ''}
                      onChange={(event) => setMapping((current) => ({ ...current, [field.field]: event.target.value }))}
                      className="mt-3 w-full rounded-xl border border-white/60 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">Not mapped</option>
                      {Array.from(new Set(headers)).map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
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
