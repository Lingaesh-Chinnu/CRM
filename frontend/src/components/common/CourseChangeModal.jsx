import { useMemo, useState } from 'react'

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function courseFinalFee(course) {
  return Math.max(Number(course?.actual_fees || 0) - Number(course?.discount_amount || 0), 0)
}

export function CourseChangeHistorySection({ history = [] }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
      <h2 className="text-xl font-black tracking-tight text-slate-950">Course Changed History</h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No course changes recorded.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {history.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {item.old_course_name || 'Previous course'} to {item.new_course_name || 'New course'}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {money(item.old_fee)} to {money(item.new_fee)}
                  </p>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {item.created_at ? new Date(item.created_at).toLocaleString('en-IN') : item.effective_date}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Changed by {item.changed_by_name || 'System'} | Effective {item.effective_date || 'Not provided'}
              </p>
              {item.reason && <p className="mt-2 text-sm text-slate-600">{item.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function CourseChangeModal({ enrollment, courses, saving, onCancel, onSubmit }) {
  const [courseId, setCourseId] = useState('')
  const [reason, setReason] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(today())
  const [confirmed, setConfirmed] = useState(false)

  const selectedCourse = useMemo(
    () => courses.find((course) => String(course.id) === String(courseId)),
    [courses, courseId],
  )
  const paidAmount = Number(enrollment?.payment_info?.paid_amount || 0)
  const spotDiscount = Number(enrollment?.spot_conversion_discount_amount || 0)
  const newFinalFee = courseFinalFee(selectedCourse)
  const newNetPayable = Math.max(newFinalFee - spotDiscount, 0)
  const newBalance = newNetPayable - paidAmount

  const submit = () => {
    if (!courseId) return
    onSubmit({
      course: Number(courseId),
      reason,
      effective_date: effectiveDate,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 px-4 py-6">
      <div className="w-full max-w-2xl rounded-[24px] bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xl font-black tracking-tight text-slate-950">Change Course</h3>
            <p className="mt-1 text-sm text-slate-500">
              Changing course will recalculate remaining fees and installments. Existing payments will be preserved.
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} className="w-fit rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Course</p>
            <p className="mt-2 font-semibold text-slate-950">{enrollment?.course_name || 'Not provided'}</p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select New Course</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" required>
              <option value="">Select course</option>
              {courses
                .filter((course) => String(course.id) !== String(enrollment?.course))
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} - {money(courseFinalFee(course))}
                  </option>
                ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reason for change</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" placeholder="Optional" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Effective Date</span>
            <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          </label>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fee Preview</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-slate-500">Old Fee</p><p className="font-black text-slate-950">{money(enrollment?.net_payable_fee || enrollment?.final_fees)}</p></div>
            <div><p className="text-xs text-slate-500">New Fee</p><p className="font-black text-slate-950">{money(newNetPayable)}</p></div>
            <div><p className="text-xs text-slate-500">Already Paid</p><p className="font-black text-slate-950">{money(paidAmount)}</p></div>
            <div><p className="text-xs text-slate-500">New Balance</p><p className="font-black text-slate-950">{money(newBalance)}</p></div>
          </div>
        </div>

        {confirmed && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Changing course will recalculate remaining fees and installments. Existing payments will be preserved.
          </div>
        )}

        <div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row">
          <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-w-[110px] justify-center rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Cancel
          </button>
          {!confirmed ? (
            <button type="button" onClick={() => setConfirmed(true)} disabled={!courseId || saving} className="inline-flex min-w-[150px] justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              Preview & Confirm
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!courseId || saving} className="inline-flex min-w-[170px] justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving...' : 'Change Course'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
