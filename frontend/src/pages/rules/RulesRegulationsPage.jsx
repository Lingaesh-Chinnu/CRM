import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { apiErrorMessage } from '../../utils/apiErrors'
import { openProtectedFile } from '../../utils/protectedFiles'
import CRMTable, { StatusBadge } from '../../components/common/CRMTable'
import PaginationControls from '../../components/common/PaginationControls'
import useDebouncedValue from '../../hooks/useDebouncedValue'

const PAGE_SIZE = 100

function normaliseListResponse(data) {
  return data.results || data
}

function formatDate(value, fallback = '-') {
  if (!value) return fallback
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fileNameFor(row) {
  const identifier = row?.student_number || row?.candidate?.student_number || row?.enrollment_id || 'candidate'
  return `IIE-Rules-Regulations-${identifier}.pdf`
}

async function downloadProtectedFile(url, filename, setMessage) {
  try {
    const { data } = await api.get(url, { responseType: 'blob' })
    const objectUrl = window.URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
  } catch (error) {
    let detail = error.response?.data?.detail
    if (!detail && error.response?.data instanceof Blob) {
      try {
        detail = JSON.parse(await error.response.data.text()).detail
      } catch {
        detail = ''
      }
    }
    setMessage(detail || 'Document is not available.')
  }
}

function RulesRegulationsList() {
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim())

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    loadRows()
  }, [debouncedSearch, page])

  const loadRows = async () => {
    setLoading(true)
    try {
      const params = { page, page_size: PAGE_SIZE }
      if (debouncedSearch) params.search = debouncedSearch
      const { data } = await api.get('/rules-regulations/', { params })
      const nextRows = normaliseListResponse(data)
      setRows(nextRows)
      setTotalCount(data.count ?? nextRows.length)
      setMessage('')
    } catch (error) {
      setRows([])
      setTotalCount(0)
      setMessage(apiErrorMessage(error, 'Failed to load Rules & Regulations documents.'))
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      key: 'candidate_name',
      header: 'Candidate Name',
      width: 'minmax(170px,1.2fr)',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/rules-regulations/${row.id}`} className="whitespace-normal break-words font-bold leading-5 text-slate-950 hover:text-cyan-700">
            {row.candidate_name}
          </Link>
          <p className="mt-1 truncate text-xs text-slate-500">{row.student_number || '-'}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone Number', width: 'minmax(110px,0.75fr)', render: (row) => row.phone || '-' },
    { key: 'course', header: 'Course', width: 'minmax(140px,1fr)', render: (row) => row.course || '-' },
    { key: 'enrollment_date', header: 'Enrollment Date', width: 'minmax(110px,0.7fr)', render: (row) => formatDate(row.enrollment_date) },
    { key: 'signed_date', header: 'Signed Date', width: 'minmax(110px,0.7fr)', render: (row) => formatDate(row.signed_date) },
    {
      key: 'status',
      header: 'Status',
      width: 'minmax(115px,0.65fr)',
      render: (row) => <StatusBadge tone={row.status === 'available' ? 'green' : 'amber'}>{row.status_label}</StatusBadge>,
    },
    {
      key: 'view',
      header: 'View',
      width: 'minmax(80px,0.45fr)',
      render: (row) => (
        <Link to={`/rules-regulations/${row.id}`} className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-900 transition hover:bg-slate-50">
          View
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Documents</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Rules & Regulations</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          Signed Rules & Regulations forms submitted by candidates.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <label className="block max-w-xl">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Search
          </span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Candidate name, student number, phone"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
          />
        </label>
      </section>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      )}

      <section className="space-y-3">
        {loading ? (
          <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-500">
            Loading documents...
          </div>
        ) : (
          <>
            <CRMTable columns={columns} rows={rows} emptyMessage="No signed Rules & Regulations documents found." />
            <PaginationControls page={page} count={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  )
}

function RulesRegulationsDetail() {
  const { id } = useParams()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [selfieObjectUrl, setSelfieObjectUrl] = useState('')
  const [signatureObjectUrl, setSignatureObjectUrl] = useState('')
  const [pdfObjectUrl, setPdfObjectUrl] = useState('')

  useEffect(() => {
    loadDetail()
  }, [id])

  useEffect(() => {
    let cancelled = false
    const objectUrls = []

    async function loadFiles() {
      setSelfieObjectUrl('')
      setSignatureObjectUrl('')
      setPdfObjectUrl('')
      if (!row?.files) return
      try {
        if (row.files.selfie_url) {
          const { data } = await api.get(row.files.selfie_url, { responseType: 'blob' })
          if (!cancelled) {
            const url = window.URL.createObjectURL(data)
            objectUrls.push(url)
            setSelfieObjectUrl(url)
          }
        }
        if (row.files.signature_url) {
          const { data } = await api.get(row.files.signature_url, { responseType: 'blob' })
          if (!cancelled) {
            const url = window.URL.createObjectURL(data)
            objectUrls.push(url)
            setSignatureObjectUrl(url)
          }
        }
        if (row.files.pdf_url) {
          const { data } = await api.get(row.files.pdf_url, { responseType: 'blob' })
          if (!cancelled) {
            const url = window.URL.createObjectURL(data)
            objectUrls.push(url)
            setPdfObjectUrl(url)
          }
        }
      } catch {
        if (!cancelled) {
          setMessage('One or more stored files could not be loaded.')
        }
      }
    }

    loadFiles()

    return () => {
      cancelled = true
      objectUrls.forEach((url) => window.URL.revokeObjectURL(url))
    }
  }, [row?.id])

  const loadDetail = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/rules-regulations/${id}/`)
      setRow(data)
      setMessage('')
    } catch (error) {
      setRow(null)
      setMessage(apiErrorMessage(error, 'Failed to load Rules & Regulations document.'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-10 text-center text-sm font-semibold text-slate-500">
        Loading document...
      </div>
    )
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <Link to="/rules-regulations" className="text-sm font-bold text-cyan-700 hover:text-cyan-900">Back to Rules & Regulations</Link>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message || 'Document was not found.'}
        </div>
      </div>
    )
  }

  const candidate = row.candidate || {}

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <Link to="/rules-regulations" className="text-sm font-bold text-cyan-700 hover:text-cyan-900">Back to Rules & Regulations</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Rules & Regulations</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{candidate.name}</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">{candidate.student_number || '-'}</p>
          </div>
          <StatusBadge tone={row.status === 'available' ? 'green' : 'amber'}>{row.status_label}</StatusBadge>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <div className="rounded-[20px] border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-black text-slate-950">Candidate Information</h2>
            <dl className="mt-5 space-y-4 text-sm">
              {[
                ['Candidate Name', candidate.name],
                ['Student Number', candidate.student_number],
                ['Phone Number', candidate.phone],
                ['Course', candidate.course],
                ['Branch', candidate.branch],
                ['Enrollment Date', formatDate(candidate.enrollment_date)],
                ['Signed Date', formatDate(row.signed_date)],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[130px_1fr] gap-3">
                  <dt className="font-semibold text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-words font-bold text-slate-900">{value || '-'}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-black text-slate-950">Submitted Photo</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {selfieObjectUrl ? (
                <img src={selfieObjectUrl} alt={`${candidate.name} submitted selfie`} className="max-h-[460px] w-full object-contain" />
              ) : (
                <div className="px-4 py-12 text-center text-sm font-semibold text-slate-500">Photo unavailable</div>
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-black text-slate-950">Submitted Signature</h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {signatureObjectUrl ? (
                <img src={signatureObjectUrl} alt={`${candidate.name} submitted signature`} className="max-h-56 w-full object-contain" />
              ) : (
                <div className="px-4 py-12 text-center text-sm font-semibold text-slate-500">Signature unavailable</div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-slate-950">Signed Rules & Regulations</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!row.files?.pdf_url}
                onClick={() => openProtectedFile(api, row.files.pdf_url, 'Document is not available.', setMessage)}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                View PDF
              </button>
              <button
                type="button"
                disabled={!row.files?.download_pdf_url}
                onClick={() => downloadProtectedFile(row.files.download_pdf_url, fileNameFor(row), setMessage)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Download PDF
              </button>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {pdfObjectUrl ? (
              <iframe title="Signed Rules & Regulations PDF" src={pdfObjectUrl} className="h-[72vh] min-h-[520px] w-full" />
            ) : (
              <div className="px-4 py-16 text-center text-sm font-semibold text-slate-500">Document unavailable</div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default function RulesRegulationsPage() {
  const { id } = useParams()
  return id ? <RulesRegulationsDetail /> : <RulesRegulationsList />
}
