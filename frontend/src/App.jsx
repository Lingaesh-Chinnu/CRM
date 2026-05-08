// ============================================================
// frontend/src/App.jsx — Route configuration
// ============================================================
import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import PrivateRoute from './components/common/PrivateRoute'
import AdminRoute  from './components/common/AdminRoute'
import MainLayout  from './components/layout/MainLayout'
import { fetchMe } from './store/slices/authSlice'

// Auth pages
import LoginPage from './pages/auth/LoginPage'

// Dashboard
import DashboardPage from './pages/dashboard/DashboardPage'

// Leads
import LeadsListPage   from './pages/leads/LeadsListPage'
import LeadDetailPage  from './pages/leads/LeadDetailPage'
import LeadCreatePage  from './pages/leads/LeadCreatePage'

// Walk-ins
import WalkInsListPage  from './pages/walkins/WalkInsListPage'
import WalkInDetailPage from './pages/walkins/WalkInDetailPage'
import WalkInCreatePage from './pages/walkins/WalkInCreatePage'

// Enrollments
import EnrollmentsListPage  from './pages/enrollments/EnrollmentsListPage'
import EnrollmentDetailPage from './pages/enrollments/EnrollmentDetailPage'
import StudentsListPage from './pages/students/StudentsListPage'
import StudentDetailPage from './pages/students/StudentDetailPage'

// Payments
import PaymentsListPage from './pages/payments/PaymentsListPage'
import PaymentDetailPage from './pages/payments/PaymentDetailPage'

// Admin-only pages
import CoursesPage   from './pages/admin/CoursesPage'
import DiscountsPage from './pages/admin/DiscountsPage'
import UsersPage     from './pages/admin/UsersPage'
import TargetsPage   from './pages/admin/TargetsPage'
import HistoricalAnalyticsPage from './pages/admin/HistoricalAnalyticsPage'
import BranchesPage  from './pages/admin/BranchesPage'
import ReportsPage   from './pages/admin/ReportsPage'
import UserMonitoringPage from './pages/admin/UserMonitoringPage'
import LeadImportHistoryPage from './pages/admin/LeadImportHistoryPage'
import LeadInboxPage from './pages/admin/LeadInboxPage'
import WhatsAppTemplatesPage from './pages/admin/WhatsAppTemplatesPage'

// Public
import PublicWalkInForm from './pages/public/PublicWalkInForm'
import RulesSigningPage from './pages/public/RulesSigningPage'

function RootRedirect() {
  const { initialized } = useSelector((state) => state.auth)

  if (!initialized) {
    return null
  }

  return <Navigate to="/login" replace />
}

export default function App() {
  const dispatch = useDispatch()
  const { initialized } = useSelector((state) => state.auth)

  useEffect(() => {
    if (localStorage.getItem('access_token')) {
      dispatch(fetchMe())
    }
  }, [dispatch])

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/"                  element={<RootRedirect />} />
      <Route path="/login"             element={<LoginPage />} />
      <Route path="/public/walk-in"    element={<PublicWalkInForm />} />
      <Route path="/IIE-Rules-Regulations/:token" element={<RulesSigningPage />} />
      <Route path="/rules-sign/:token" element={<RulesSigningPage />} />

      {/* Protected routes inside MainLayout */}
      <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route path="dashboard" element={<DashboardPage />} />

        {/* Leads */}
        <Route path="leads"           element={<LeadsListPage />} />
        <Route path="leads/new"       element={<LeadCreatePage />} />
        <Route path="leads/:id"       element={<LeadDetailPage />} />

        {/* Walk-ins */}
        <Route path="walkins"         element={<WalkInsListPage />} />
        <Route path="walkins/new"     element={<WalkInCreatePage />} />
        <Route path="walkins/:id"     element={<WalkInDetailPage />} />

        {/* Students */}
        <Route path="students"        element={<StudentsListPage />} />
        <Route path="students/:id"    element={<StudentDetailPage />} />

        {/* Enrollments */}
        <Route path="enrollments"     element={<EnrollmentsListPage />} />
        <Route path="enrollments/:id" element={<EnrollmentDetailPage />} />

        {/* Payments */}
        <Route path="payments"        element={<PaymentsListPage />} />
        <Route path="payments/:id"    element={<PaymentDetailPage />} />

        {/* Viewable by all logged-in users */}
        <Route path="courses"         element={<CoursesPage />} />

        {/* Super Admin only */}
        <Route element={<AdminRoute />}>
          <Route path="admin/courses"  element={<CoursesPage />} />
          <Route path="admin/discounts" element={<DiscountsPage />} />
          <Route path="admin/users"    element={<UsersPage />} />
          <Route path="admin/targets"  element={<TargetsPage />} />
          <Route path="admin/historical-analytics" element={<HistoricalAnalyticsPage />} />
          <Route path="admin/branches" element={<BranchesPage />} />
          <Route path="admin/reports"  element={<ReportsPage />} />
          <Route path="admin/user-monitoring" element={<UserMonitoringPage />} />
          <Route path="admin/lead-import-history" element={<LeadImportHistoryPage />} />
          <Route path="admin/lead-inbox" element={<LeadInboxPage />} />
          <Route path="admin/whatsapp-templates" element={<WhatsAppTemplatesPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
