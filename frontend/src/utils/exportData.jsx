import { api } from '../services/api'

export async function downloadExport(endpoint, params, fallbackName) {
  let response
  try {
    response = await api.get(endpoint, {
      params,
      responseType: 'blob',
    })
  } catch (error) {
    const blob = error.response?.data
    const contentType = blob?.type || error.response?.headers?.['content-type'] || ''
    if (blob instanceof Blob && contentType.includes('application/json')) {
      try {
        error.response.data = JSON.parse(await blob.text())
      } catch {
        error.response.data = { message: 'Export generation failed.' }
      }
    }
    throw error
  }
  const disposition = response.headers['content-disposition'] || ''
  const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] || fallbackName
  const url = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
  return response
}

export function ExportMenu({ onExport, exporting }) {
  return (
    <details className="relative">
      <summary className={`inline-flex min-h-[44px] cursor-pointer list-none items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 ${exporting ? 'pointer-events-none opacity-60' : ''}`}>
        {exporting ? 'Exporting...' : 'Export'}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
        <button
          type="button"
          onClick={() => onExport('xlsx')}
          disabled={exporting}
          className="block w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => onExport('csv')}
          disabled={exporting}
          className="block w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Export CSV
        </button>
      </div>
    </details>
  )
}
