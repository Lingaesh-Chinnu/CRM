import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { api } from '../../services/api'
import PhoneNumberEditor from '../../components/common/PhoneNumberEditor'

function normaliseListResponse(data) {
  return data.results || data
}

function formatDate(value) {
  if (!value) return 'Not provided'

  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function compactValue(value, fallback = 'Not provided') {
  return value || fallback
}

export default function StudentsListPage() {
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [courses, setCourses] = useState([])
  const [filters, setFilters] = useState({
    branch: '',
    course: '',
    search: '',
  })
  const [loading, setLoading] = useState(true)
  const { user } = useSelector((state) => state.auth)
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    loadFilterOptions()
  }, [])

  useEffect(() => {
    loadStudents()
  }, [filters.branch, filters.course, filters.search, isSuperAdmin])

  const loadFilterOptions = async () => {
    try {
      const [branchesRes, coursesRes] = await Promise.all([
        api.get('/branches/'),
        api.get('/courses/'),
      ])
      setBranches(normaliseListResponse(branchesRes.data))
      setCourses(normaliseListResponse(coursesRes.data))
    } catch {
      setBranches([])
      setCourses([])
    }
  }

  const loadStudents = async () => {
    setLoading(true)

    try {
      const params = {}

      if (isSuperAdmin && filters.branch) {
        params.branch = filters.branch
      }
      if (filters.course) {
        params.course = filters.course
      }
      if (filters.search.trim()) {
        params.search = filters.search.trim()
      }

      const { data } = await api.get('/enrollments/', { params })
      setRows(normaliseListResponse(data))
    } finally {
      setLoading(false)
    }
  }

  const updateStudentPhone = (studentId, phone) => {
    setRows((current) => current.map((student) => student.id === studentId ? { ...student, phone } : student))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Students</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Student profiles collected from walk-ins
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          This view keeps the enrolled students separate from the admissions workflow and shows the personal details collected in the walk-in form.
        </p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-end gap-4">
          {isSuperAdmin && (
            <label className="min-w-[180px] flex-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Branch
              </span>
              <select
                value={filters.branch}
                onChange={(event) => setFilters((current) => ({ ...current, branch: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
              >
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="min-w-[180px] flex-1">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Course
            </span>
            <select
              value={filters.course}
              onChange={(event) => setFilters((current) => ({ ...current, course: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            >
              <option value="">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[260px] flex-[1.4]">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Search
            </span>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Student name, phone, number, email"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:bg-white focus:ring-4 focus:ring-cyan-100"
            />
          </label>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Directory</p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">Student details</h2>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {rows.length} Students
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-slate-500">Loading students...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-slate-500">No students found for the current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1220px]">
              <div className="grid grid-cols-[1.2fr_0.95fr_0.85fr_1fr_1.2fr_0.85fr] gap-5 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <div>Student</div>
                <div>Contact</div>
                <div>Date of Birth</div>
                <div>Branch & Timing</div>
                <div>Address</div>
                <div>Profile</div>
              </div>

              <div className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.2fr_0.95fr_0.85fr_1fr_1.2fr_0.85fr] gap-5 px-6 py-5">
                <div>
                  <p className="text-lg font-bold tracking-tight text-slate-950">{row.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{row.student_number}</p>
                  <p className="mt-3 text-sm font-medium text-slate-800">{compactValue(row.course_name, 'Course pending')}</p>
                </div>

                <div className="space-y-1 text-sm text-slate-700">
                  <PhoneNumberEditor recordType="student" recordId={row.id} phone={row.phone} onSaved={(phone) => updateStudentPhone(row.id, phone)} />
                  <p>{compactValue(row.email, 'Email not added')}</p>
                </div>

                <div className="text-sm font-medium text-slate-700">
                  {formatDate(row.dob)}
                </div>

                <div className="space-y-1 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{compactValue(row.branch_name, 'No branch')}</p>
                  <p>{compactValue(row.pincode, 'Pincode not added')}</p>
                  <p>{compactValue(row.preferred_timing_display, 'Timing not added')}</p>
                </div>

                <div className="text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Address</p>
                  <p className="mt-1 leading-6">{compactValue(row.location, 'Address not added')}</p>
                </div>

                <div className="flex items-start justify-between gap-3 xl:flex-col xl:items-end">
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {row.status}
                  </div>
                  <Link
                    to={`/students/${row.id}`}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                  >
                    View Profile
                  </Link>
                </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
