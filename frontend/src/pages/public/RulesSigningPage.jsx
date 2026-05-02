import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../services/api'

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function formatDate(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function RulesSigningPage() {
  const { token } = useParams()
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api
      .get(`/public/rules-sign/${token}/`)
      .then(({ data: response }) => setData(response))
      .catch(() => setMessage('This signing link is invalid or unavailable.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      const previous = document.createElement('canvas')
      previous.width = canvas.width
      previous.height = canvas.height
      previous.getContext('2d').drawImage(canvas, 0, 0)

      canvas.width = Math.floor(rect.width * ratio)
      canvas.height = Math.floor(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.4
      ctx.strokeStyle = '#020617'
      if (hasSignature) {
        ctx.drawImage(previous, 0, 0, previous.width / ratio, previous.height / ratio)
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [hasSignature])

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const startDrawing = (event) => {
    if (data?.status === 'submitted') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = pointFromEvent(event)
    drawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    canvas.setPointerCapture?.(event.pointerId)
  }

  const draw = (event) => {
    if (!drawingRef.current || data?.status === 'submitted') return
    const ctx = canvasRef.current.getContext('2d')
    const point = pointFromEvent(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDrawing = () => {
    drawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    setMessage('')
  }

  const submitSignature = async () => {
    if (!hasSignature) {
      setMessage('Please add your signature before submitting.')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      const signature = canvasRef.current.toDataURL('image/png')
      const { data: response } = await api.post(`/public/rules-sign/${token}/`, { signature })
      setData((current) => ({
        ...current,
        status: 'submitted',
        submitted_at: response.submitted_at,
        signed_pdf_url: response.signed_pdf_url,
      }))
      setMessage('Signed form submitted successfully.')
    } catch (error) {
      setMessage(error.response?.data?.detail || 'Unable to submit the signed form.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-100 p-6 text-slate-600">Loading form...</div>
  }

  if (!data) {
    return <div className="min-h-screen bg-slate-100 p-6 text-slate-700">{message}</div>
  }

  const details = data.candidate || {}
  const submitted = data.status === 'submitted'

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">IIE Rules & Regulation</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Review and Sign
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Please review the form details and sign in the signature box.
          </p>
          {submitted && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              This form has already been submitted.
            </div>
          )}
        </section>

        <section className="grid gap-4 rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:grid-cols-2 sm:p-8">
          {[
            ['Name', details.name],
            ['Course Enrolled', details.course_enrolled],
            ['Batch Timing', details.batch_timing],
            ['Batch Start Date', formatDate(details.batch_start_date)],
            ['Duration', details.duration],
            ['Total Course Fee', formatCurrency(details.total_course_fee)],
            ['Payment Mode', details.payment_mode || 'Not set'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className="mt-2 font-semibold text-slate-950">{value || 'Not set'}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <h2 className="text-lg font-black text-slate-950">Installment Plan</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {(data.installments || []).map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 text-xl font-black text-slate-950">{formatCurrency(item.amount)}</p>
                <p className="mt-1 text-sm text-slate-600">{formatDate(item.due_date)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <h2 className="text-lg font-black text-slate-950">Rules and Regulations</h2>
          <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
            {(data.rules_content || []).map((paragraph, index) => (
              <p key={`${paragraph.slice(0, 20)}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <h2 className="text-lg font-black text-slate-950">Student Signature</h2>
          <canvas
            ref={canvasRef}
            className="mt-4 h-48 w-full touch-none rounded-2xl border border-slate-300 bg-white"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          {message && <p className="mt-4 text-sm font-semibold text-slate-700">{message}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            {!submitted && (
              <>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
                >
                  Clear Signature
                </button>
                <button
                  type="button"
                  onClick={submitSignature}
                  disabled={submitting}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Signed Form'}
                </button>
              </>
            )}
            {data.signed_pdf_url && (
              <a
                href={data.signed_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800"
              >
                View Signed PDF
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
