import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'
import AdminDeleteButton from '../../components/common/AdminDeleteButton'
import { apiErrorMessage } from '../../utils/apiErrors'
import { openProtectedFile } from '../../utils/protectedFiles'
import CourseChangeModal, { CourseChangeHistorySection } from '../../components/common/CourseChangeModal'

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
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [showCourseChange, setShowCourseChange] = useState(false)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    setLoadError('')
    Promise.all([
      api.get(`/enrollments/${id}/`),
      api.get('/courses/'),
    ])
      .then(([enrollmentRes, coursesRes]) => {
        setRow(enrollmentRes.data)
        setCourses(coursesRes.data.results || coursesRes.data)
      })
      .catch((error) => setLoadError(apiErrorMessage(error, 'Failed to load student profile.')))
  }, [id])

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

  const changeCourse = async (payload) => {
    setStatusSaving(true)
    setMessage('')
    try {
      const { data } = await api.post(`/enrollments/${row.id}/change-course/`, payload)
      setRow(data)
      setShowCourseChange(false)
      setMessage('Course changed. Fees and pending installments were recalculated.')
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Failed to change course.'))
    } finally {
      setStatusSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Student Profile</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{row.name}</h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setShowCourseChange(true); setMessage('') }} className="w-fit rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800 hover:bg-cyan-100">
              Change Course
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
          onCancel={() => setShowCourseChange(false)}
          onSubmit={changeCourse}
        />
      )}
    </div>
  )
}
