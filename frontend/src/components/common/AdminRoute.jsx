// ============================================================
// frontend/src/components/common/AdminRoute.jsx
// ============================================================
import { useSelector } from 'react-redux'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

export default function AdminRoute() {
  const { user, initialized } = useSelector((state) => state.auth)
  const location = useLocation()

  if (!initialized) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm font-semibold text-slate-600 shadow-sm">
          Checking admin access...
        </div>
      </div>
    )
  }

  if (!user || user.role !== 'super_admin') {
    return <Navigate to="/dashboard" state={{ from: location }} replace />
  }

  return <Outlet />
}
