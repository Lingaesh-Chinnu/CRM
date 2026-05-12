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
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const streamRef = useRef(null)
  const drawingRef = useRef(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [selfie, setSelfie] = useState('')
  const [identitySource, setIdentitySource] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [message, setMessage] = useState('')

  const stopCamera = (updateState = true) => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (updateState) {
      setCameraActive(false)
    }
  }

  useEffect(() => {
    document.title = 'IIE Rules & Regulations'
    api
      .get(`/public/rules-sign/${token}/`)
      .then(({ data: response }) => setData(response))
      .catch(() => setMessage('This signing link is invalid or unavailable.'))
      .finally(() => setLoading(false))
    return () => {
      document.title = 'Indra Institute of Education'
    }
  }, [token])

  useEffect(() => () => stopCamera(false), [])

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
    if (data?.status === 'submitted' || !selfie) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const point = pointFromEvent(event)
    drawingRef.current = true
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    canvas.setPointerCapture?.(event.pointerId)
  }

  const draw = (event) => {
    if (!drawingRef.current || data?.status === 'submitted' || !selfie) return
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

  const openCamera = async () => {
    setCameraError('')
    setMessage('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is required to complete the signing process. Please allow camera permission.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch {
      setCameraError('Camera access is required to complete the signing process. Please allow camera permission.')
    }
  }

  const captureSelfie = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    setSelfie(canvas.toDataURL('image/jpeg', 0.86))
    setIdentitySource('camera')
    clearSignature()
    stopCamera()
  }

  const retakeSelfie = () => {
    setSelfie('')
    setIdentitySource('')
    clearSignature()
    openCamera()
  }

  const resizeImageFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const maxDimension = 1280
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.84))
      }
      image.onerror = () => reject(new Error('Invalid image file.'))
      image.src = reader.result
    }
    reader.onerror = () => reject(new Error('Unable to read image file.'))
    reader.readAsDataURL(file)
  })

  const uploadImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setMessage('Only jpg, jpeg, png, or webp image files are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('Identity photo must be 5MB or smaller.')
      return
    }
    try {
      stopCamera()
      const imageData = await resizeImageFile(file)
      setSelfie(imageData)
      setIdentitySource('upload')
      clearSignature()
      setMessage('')
      setCameraError('')
    } catch (error) {
      setMessage(error.message || 'Unable to process selected image.')
    }
  }

  const replaceImage = () => {
    setSelfie('')
    setIdentitySource('')
    clearSignature()
    fileInputRef.current?.click()
  }

  const submitSignature = async () => {
    if (!selfie) {
      setMessage('Identity photo is required before signing the form.')
      return
    }
    if (!hasSignature) {
      setMessage('Please add your signature before submitting.')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      const signature = canvasRef.current.toDataURL('image/png')
      const { data: response } = await api.post(`/public/rules-sign/${token}/`, { selfie, signature })
      setData((current) => ({
        ...current,
        status: 'submitted',
        submitted_at: response.submitted_at,
        signed_pdf_url: response.signed_pdf_url,
        selfie_url: response.selfie_url,
      }))
      stopCamera()
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

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6">
        <section className="mx-auto max-w-4xl rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Submitted</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            IIE Rules & Regulations
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            This form has already been submitted and is locked.
          </p>
          {data.submitted_at && (
            <p className="mt-3 text-sm font-semibold text-slate-700">
              Submitted on {formatDate(data.submitted_at)}
            </p>
          )}
          {data.signed_pdf_url ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={data.signed_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
              >
                View Signed PDF
              </a>
              <a
                href={data.signed_pdf_url}
                download
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
              >
                Download PDF
              </a>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              Signed PDF is not available.
            </p>
          )}
        </section>
      </main>
    )
  }

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
          <h2 className="text-lg font-black text-slate-950">Identity Photo</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            {selfie ? (
              <img src={selfie} alt="Identity photo preview" className="mx-auto max-h-80 w-full object-contain" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`mx-auto max-h-80 w-full bg-slate-900 object-contain ${cameraActive ? 'block' : 'hidden'}`}
              />
            )}
            {!selfie && !cameraActive && (
              <div className="flex min-h-48 items-center justify-center px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Camera preview or uploaded image will appear here.
              </div>
            )}
          </div>
          {cameraError && <p className="mt-4 text-sm font-semibold text-rose-700">{cameraError}</p>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={uploadImage}
            className="hidden"
          />
          <div className="mt-5 flex flex-wrap gap-3">
            {!selfie && !cameraActive && (
              <>
                <button
                  type="button"
                  onClick={openCamera}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  Take Selfie
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
                >
                  Upload Image
                </button>
              </>
            )}
            {!selfie && cameraActive && (
              <>
                <button
                  type="button"
                  onClick={captureSelfie}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
                >
                  Capture Selfie
                </button>
                <button
                  type="button"
                  onClick={() => { stopCamera(); fileInputRef.current?.click() }}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
                >
                  Upload Image
                </button>
              </>
            )}
            {selfie && (
              <>
                <button
                  type="button"
                  onClick={identitySource === 'camera' ? retakeSelfie : replaceImage}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
                >
                  {identitySource === 'camera' ? 'Retake' : 'Replace Image'}
                </button>
                <button
                  type="button"
                  onClick={identitySource === 'camera' ? replaceImage : retakeSelfie}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
                >
                  {identitySource === 'camera' ? 'Replace Image' : 'Retake'}
                </button>
              </>
            )}
          </div>
        </section>

        <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.45)] sm:p-8">
          <h2 className="text-lg font-black text-slate-950">Student Signature</h2>
          <canvas
            ref={canvasRef}
            className={`mt-4 h-48 w-full touch-none rounded-2xl border border-slate-300 bg-white ${!selfie ? 'opacity-50' : ''}`}
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
                  disabled={!selfie}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900"
                >
                  Clear Signature
                </button>
                <button
                  type="button"
                  onClick={submitSignature}
                  disabled={submitting || !selfie || !hasSignature}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
