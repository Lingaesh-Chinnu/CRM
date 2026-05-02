import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

function prettyValue(value, fallback = 'Not provided') {
  return value || fallback
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
  const [row, setRow] = useState(null)

  useEffect(() => {
    api.get(`/enrollments/${id}/`).then(({ data }) => setRow(data))
  }, [id])

  if (!row) {
    return <div className="p-6 text-slate-500">Loading student profile...</div>
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Student Profile</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{row.name}</h1>
        <p className="mt-3 text-sm text-slate-500">
          {row.student_number} | {row.course_name || 'No course'} | {row.branch_name || 'No branch'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/students"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
          >
            Back to Students
          </Link>
          <Link
            to={`/enrollments/${row.id}`}
            className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Enrollment
          </Link>
          {row.rules_signed_pdf_url && (
            <a
              href={row.rules_signed_pdf_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              View Signed Rules PDF
            </a>
          )}
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
          <h2 className="text-xl font-black tracking-tight text-slate-950">Enrollment snapshot</h2>
          <div className="mt-5 space-y-4">
            <DetailCard label="Status" value={prettyValue(row.status)} />
            <DetailCard label="Batch Timing" value={prettyValue(row.batch_timing)} />
            <DetailCard label="Final Fees" value={`Rs ${Number(row.final_fees || 0).toLocaleString('en-IN')}`} />
            <DetailCard
              label="Payment Status"
              value={prettyValue(row.payment_info?.status, 'Payment pending')}
            />
            <DetailCard label="Rules Form" value={prettyValue(row.rules_signing_status, 'pending')} />
          </div>
        </article>
      </section>
    </div>
  )
}
