import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'
import AdminDeleteButton from '../../components/common/AdminDeleteButton'
import { apiErrorMessage } from '../../utils/apiErrors'
import { openProtectedFile } from '../../utils/protectedFiles'
import CourseChangeModal, { CourseChangeHistorySection } from '../../components/common/CourseChangeModal'
import CounselorReassignmentPanel from '../../components/common/CounselorReassignmentPanel'
import CandidateTimeline from '../../components/common/CandidateTimeline'

const studentStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'Hold' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'dropped', label: 'Dropped' },
  { value: 'transferred', label: 'Transferred' },
]

function prettyValue(value, fallback = 'Not provided') {
  return value || fallback
}

function studentStatusValue(value) {
  return value === 'enrolled' ? 'active' : value || 'active'
}

function studentStatusLabel(value) {
  const normalized = studentStatusValue(value)
  return studentStatusOptions.find((option) => option.value === normalized)?.label || 'Active'
}

function formatDate(value, fallback = 'Not provided') {
  if (!value) return fallback

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function money(value) {
  return Number(value || 0).toLocaleString('en-IN')
}

function billWasSent(installment) {
  return Boolean(installment?.bill_last_sent_at || installment?.bill_last_sent_at_display)
}

function sendBillButtonClass(installment) {
  const color = billWasSent(installment)
    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
    : 'bg-slate-950 text-white hover:bg-slate-800'
  return `inline-flex min-w-[120px] justify-center whitespace-nowrap rounded-2xl ${color} px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50`
}

async function shareBillImageFile(data) {
  let blob
  if (data.bill_image_data) {
    const byteCharacters = window.atob(data.bill_image_data)
    const byteArrays = []
    for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
      const slice = byteCharacters.slice(offset, offset + 1024)
      byteArrays.push(new Uint8Array([...slice].map((char) => char.charCodeAt(0))))
    }
    blob = new Blob(byteArrays, { type: data.bill_image_content_type || 'image/png' })
  } else {
    throw new Error('Bill image was not returned by the server.')
  }
  const file = new File(
    [blob],
    data.document_filename || `${data.document_number || 'bill'}.png`,
    { type: blob.type || 'image/png' },
  )
  if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
    throw new Error('Image sharing is not supported in this browser. Use a WhatsApp API-enabled device or browser.')
  }
  await navigator.share({
    files: [file],
    text: data.whatsapp_message || '',
    title: 'Payment Receipt',
  })
}

function latestGeneratedBill(paymentInfo) {
  const bills = [...(paymentInfo?.installments || [])]
    .filter((installment) => installment.bill_number || installment.document_status === 'bill_generated')
    .sort((a, b) => {
      const dateCompare = String(a.payment_date || '').localeCompare(String(b.payment_date || ''))
      return dateCompare || Number(a.id || 0) - Number(b.id || 0)
    })
  return bills[bills.length - 1] || null
}

function nextPendingInstallment(paymentInfo) {
  return (paymentInfo?.installment_summary || []).find((item) => Number(item.pending_amount || 0) > 0) || null
}

function DetailCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useSelector((state) => state.auth)
  const [row, setRow] = useState(null)
  const [courses, setCourses] = useState([])
  const [counselors, setCounselors] = useState([])
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [billActionId, setBillActionId] = useState(null)
  const [sendingBillId, setSendingBillId] = useState(null)
  const [showCourseChange, setShowCourseChange] = useState(false)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    setLoadError('')
    Promise.all([
      api.get(`/enrollments/${id}/`),
      api.get('/courses/'),
      isSuperAdmin ? api.get('/users/', { params: { role: 'staff', is_active: true } }) : api.get('/leads/staff-options/'),
    ])
      .then(([enrollmentRes, coursesRes, usersRes]) => {
        setRow(enrollmentRes.data)
        setCourses(coursesRes.data.results || coursesRes.data)
        const users = usersRes.data.results || usersRes.data || []
        setCounselors(enrollmentRes.data.branch ? users.filter((item) => String(item.branch_id || item.branch || '') === String(enrollmentRes.data.branch)) : users)
      })
      .catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load student profile.')))
  }, [id, isSuperAdmin])

  if (!row) {
    return <div className="p-6 text-slate-500">{loadError || 'Loading student profile...'}</div>
  }

  const updateStudentStatus = async (status) => {
    setStatusSaving(true)
    setMessage('')
    try {
      const { data } = await api.patch(`/enrollments/${row.id}/`, { status })
      setRow(data)
      setMessage('Student status updated.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to update student status.'))
    } finally {
      setStatusSaving(false)
    }
  }

  const deleteStudent = async () => {
    await api.delete(`/enrollments/${row.id}/`)
    navigate('/students', { replace: true })
  }

  const submitCourseChange = async (payload) => {
    setStatusSaving(true)
    setMessage('')
    try {
      const endpoint = isSuperAdmin ? `/enrollments/${row.id}/change-course/` : `/enrollments/${row.id}/request-course-change/`
      const { data } = await api.post(endpoint, payload)
      if (isSuperAdmin) setRow(data)
      setShowCourseChange(false)
      setMessage(isSuperAdmin ? 'Course changed. Fees and pending installments were recalculated.' : 'Course change request submitted for admin approval.')
    } catch (error) {
      setMessage(apiErrorMessage(error, isSuperAdmin ? 'Failed to change course.' : 'Failed to submit course change request.'))
    } finally {
      setStatusSaving(false)
    }
  }

  const reassignCounselor = async (payload) => {
    setStatusSaving(true)
    setMessage('')
    try {
      await api.post(`/enrollments/${row.id}/request-counselor-change/`, payload)
      setMessage('Counselor change request submitted for current counselor approval.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to submit counselor change request.'))
      throw error
    } finally {
      setStatusSaving(false)
    }
  }

  const openBill = async (installment) => {
    if (!installment) return
    setBillActionId(installment.id)
    setMessage('')
    try {
      const { data } = await api.get(`/installments/${installment.id}/view-bill/`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(data)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to open bill.'))
    } finally {
      setBillActionId(null)
    }
  }

  const sendBill = async (installment) => {
    if (!installment || sendingBillId) return
    setSendingBillId(installment.id)
    setMessage('')
    try {
      const { data } = await api.post(`/installments/${installment.id}/send-bill/`)
      let sentData = data
      if (data.share_mode === 'browser_file_share') {
        await shareBillImageFile(data)
        const confirmation = await api.post(`/installments/${installment.id}/confirm-bill-sent/`)
        sentData = confirmation.data
      }
      setMessage(sentData.whatsapp_sent ? 'Bill sent successfully.' : sentData.whatsapp_error || sentData.detail || 'Bill send request failed.')
      if (sentData.whatsapp_sent) {
        setRow((current) => {
          const installments = (current?.payment_info?.installments || []).map((item) => (
            Number(item.id) === Number(installment.id)
              ? {
                ...item,
                bill_last_sent_at: sentData.sent_at,
                bill_last_sent_at_display: sentData.sent_at_display || item.bill_last_sent_at_display,
                bill_last_sent_by_name: sentData.sent_by || item.bill_last_sent_by_name,
              }
              : item
          ))
          return {
            ...current,
            payment_info: {
              ...(current?.payment_info || {}),
              installments,
            },
          }
        })
      }
    } catch (error) {
      setMessage(apiErrorMessage(error, error.message || 'Failed to send bill.'))
    } finally {
      setSendingBillId(null)
    }
  }

  const latestBill = latestGeneratedBill(row.payment_info)
  const nextPending = nextPendingInstallment(row.payment_info)

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Student Profile</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{row.name}</h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setShowCourseChange(true); setMessage('') }} className="w-fit rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800 hover:bg-cyan-100">
              {isSuperAdmin ? 'Change Course' : 'Request Course Change'}
            </button>
            {isSuperAdmin && <AdminDeleteButton label="student" onConfirm={deleteStudent} />}
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {row.student_number} | {row.course_name || 'No course'} | {row.branch_name || 'No branch'}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            to="/students"
            className="inline-flex min-w-[140px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
          >
            Back to Students
          </Link>
          <Link
            to={`/enrollments/${row.id}`}
            className="inline-flex min-w-[150px] justify-center whitespace-nowrap rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Enrollment
          </Link>
          {row.rules_signed_pdf_url && (
            <button
              type="button"
              onClick={() => openProtectedFile(api, row.rules_signed_pdf_url, 'Signed PDF is not available. Please resend and collect the signed form again.', setMessage)}
              className="inline-flex min-w-[190px] justify-center whitespace-nowrap rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              View Signed Rules PDF
            </button>
          )}
          {row.rules_selfie_url && (
            <button
              type="button"
              onClick={() => openProtectedFile(api, row.rules_selfie_url, 'Selfie is not available.', setMessage)}
              className="inline-flex min-w-[120px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              View Selfie
            </button>
          )}
        </div>
        {message && <p className="mt-4 text-sm font-semibold text-slate-600">{message}</p>}
      </section>
      <CounselorReassignmentPanel
        enrollment={row}
        counselors={counselors}
        isAdmin
        saving={statusSaving}
        onReassign={reassignCounselor}
      />

      <CandidateTimeline candidate={row} />

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-950">Billing</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Paid</p>
                <p className="mt-1 font-black text-slate-950">Rs {money(row.payment_info?.paid_amount)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Pending</p>
                <p className="mt-1 font-black text-slate-950">Rs {money(row.payment_info?.balance)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next Amount</p>
                <p className="mt-1 font-black text-slate-950">Rs {money(nextPending?.pending_amount)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next Date</p>
                <p className="mt-1 font-black text-slate-950">{formatDate(nextPending?.due_date || row.payment_info?.next_payment_date, 'Not set')}</p>
              </div>
            </div>
            {latestBill ? (
              <div className="mt-4 space-y-1 text-sm font-semibold text-slate-500">
                <p>Latest bill: {latestBill.document_number || latestBill.bill_number} / {formatDate(latestBill.bill_generated_at || latestBill.payment_date, 'Not set')}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm font-semibold text-slate-500">No generated bill is available for this student yet.</p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <button
              type="button"
              onClick={() => openBill(latestBill)}
              disabled={!latestBill || billActionId === latestBill?.id}
              className="inline-flex min-w-[120px] justify-center whitespace-nowrap rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {billActionId === latestBill?.id ? 'Opening...' : 'View Bill'}
            </button>
            {!isSuperAdmin && (
              <button
                type="button"
                onClick={() => sendBill(latestBill)}
                disabled={!latestBill || sendingBillId === latestBill?.id}
                className={sendBillButtonClass(latestBill)}
              >
                {sendingBillId === latestBill?.id ? 'Sending...' : billWasSent(latestBill) ? 'Bill Sent' : 'Send Bill'}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Phone</p>
          <div className="mt-2">
            <PhoneNumberEditor recordType="student" recordId={row.id} phone={row.phone} onSaved={(phone) => setRow((current) => ({ ...current, phone }))} />
          </div>
        </div>
        <DetailCard label="Email" value={prettyValue(row.email, 'Email not added')} />
        <DetailCard label="Date of Birth" value={formatDate(row.dob)} />
        <DetailCard label="Pincode" value={prettyValue(row.pincode, 'Pincode not added')} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Personal details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <DetailCard label="Branch" value={prettyValue(row.branch_name)} />
            <DetailCard label="Course" value={prettyValue(row.course_name)} />
            <DetailCard label="Qualification" value={prettyValue(row.qualification_display || row.qualification)} />
            <DetailCard label="Degree / Department" value={prettyValue(row.degree)} />
            <DetailCard label="Walkin Date" value={formatDate(row.walkin_date)} />
            <DetailCard label="Enrollment Date" value={formatDate(row.enrollment_date)} />
            <DetailCard label="Start Date" value={formatDate(row.start_date)} />
            <DetailCard label="Preferred Timing" value={prettyValue(row.preferred_timing_display)} />
            <DetailCard label="Source" value={prettyValue(row.source_display)} />
            <DetailCard label="Demo Class Required" value={row.demo_class ? 'Yes' : 'No'} />
            <DetailCard
              label="Interested in Global Certification"
              value={row.interested_global_certification ? 'Yes' : 'No'}
            />
            <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Address</p>
              <p className="mt-2 font-semibold text-slate-900">{prettyValue(row.location, 'Address not added')}</p>
            </div>
          </div>
        </article>

        <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black tracking-tight text-slate-950">Enrollment Snapshot</h2>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Student Status</p>
              <select
                value={studentStatusValue(row.status)}
                onChange={(event) => updateStudentStatus(event.target.value)}
                disabled={statusSaving}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 disabled:opacity-60"
              >
                {studentStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-2 text-xs font-semibold text-slate-500">{statusSaving ? 'Saving...' : studentStatusLabel(row.status)}</p>
            </div>
            <DetailCard label="Batch Timing" value={prettyValue(row.batch_timing)} />
            <DetailCard label="Final Fees" value={`Rs ${Number(row.final_fees || 0).toLocaleString('en-IN')}`} />
            <DetailCard label="Spot Discount" value={`Rs ${Number(row.spot_conversion_discount_amount || 0).toLocaleString('en-IN')}`} />
            <DetailCard label="Net Payable Fees" value={`Rs ${Number(row.net_payable_fee || row.final_fees || 0).toLocaleString('en-IN')}`} />
            <DetailCard
              label="Payment Status"
              value={prettyValue(row.payment_info?.status, 'Payment pending')}
            />
            <DetailCard label="Rules Form" value={prettyValue(row.rules_signing_status, 'pending')} />
          </div>
        </article>
      </section>
      <CourseChangeHistorySection history={row.course_change_history || []} />
      {showCourseChange && (
        <CourseChangeModal
          enrollment={row}
          courses={courses}
          saving={statusSaving}
          mode={isSuperAdmin ? 'direct' : 'request'}
          onCancel={() => setShowCourseChange(false)}
          onSubmit={submitCourseChange}
        />
      )}
    </div>
  )
}
