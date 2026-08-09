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
import ChangePasswordPage from './pages/auth/ChangePasswordPage'

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
import NotificationsPage from './pages/notifications/NotificationsPage'
import TeamBoardPage from './pages/team/TeamBoardPage'
import CounselorChangeRequestsPage from './pages/CounselorChangeRequestsPage'
import PendingPage from './pages/pending/PendingPage'
import PerformanceHubPage from './pages/performance/PerformanceHubPage'
import RulesRegulationsPage from './pages/rules/RulesRegulationsPage'

// Admin-only pages
import CoursesPage   from './pages/admin/CoursesPage'
import DiscountsPage from './pages/admin/DiscountsPage'
import UsersPage     from './pages/admin/UsersPage'
import TargetsPage   from './pages/admin/TargetsPage'
import HistoricalAnalyticsPage from './pages/admin/HistoricalAnalyticsPage'
import BranchesPage  from './pages/admin/BranchesPage'
import ReportsPage   from './pages/admin/ReportsPage'
import MonthlyConsolidatedReportPage from './pages/admin/MonthlyConsolidatedReportPage'
import ReceiptsPage  from './pages/admin/ReceiptsPage'
import UserMonitoringPage from './pages/admin/UserMonitoringPage'
import LeadImportHistoryPage from './pages/admin/LeadImportHistoryPage'
import LeadInboxPage from './pages/admin/LeadInboxPage'
import WhatsAppTemplatesPage from './pages/admin/WhatsAppTemplatesPage'
import DataImportPage from './pages/admin/DataImportPage'
import DeleteCandidatesPage from './pages/admin/DeleteCandidatesPage'
import CourseChangeRequestsPage from './pages/admin/CourseChangeRequestsPage'
import WalkInAssignmentRequestsPage from './pages/admin/WalkInAssignmentRequestsPage'

// Public
import PublicWalkInForm from './pages/public/PublicWalkInForm'
import PublicLeadForm from './pages/public/PublicLeadForm'
import RulesSigningPage from './pages/public/RulesSigningPage'

function RootRedirect() {
  const { initialized } = useSelector((state) => state.auth)

  if (!initialized) {
    return null
  }

  return <Navigate to="/login" replace />
}

function UserPerformanceRoute() {
  const { user, initialized } = useSelector((state) => state.auth)

  if (!initialized) return null
  if (user?.role === 'super_admin') {
    return <Navigate to="/admin/consolidated-report" replace />
  }
  return <PerformanceHubPage />
}

export default function App() {
  const dispatch = useDispatch()
  const { initialized } = useSelector((state) => state.auth)

  useEffect(() => {
    document.title = 'Indra Institute of Education'
    if (localStorage.getItem('access_token')) {
      dispatch(fetchMe())
    }
  }, [dispatch])

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/"                  element={<RootRedirect />} />
      <Route path="/login"             element={<LoginPage />} />
      <Route path="/change-password"   element={<PrivateRoute><ChangePasswordPage /></PrivateRoute>} />
      <Route path="/public/walk-in"    element={<PublicWalkInForm />} />
      <Route path="/public/walkin"     element={<PublicWalkInForm />} />
      <Route path="/lead-form"         element={<PublicLeadForm />} />
      <Route path="/public/lead-form"  element={<PublicLeadForm />} />
      <Route path="/public-lead-form"  element={<PublicLeadForm />} />
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
        <Route path="enrollments/yet-to-enroll" element={<EnrollmentsListPage queue="yet_to_enroll" />} />
        <Route path="enrollments/:id" element={<EnrollmentDetailPage />} />

        {/* Payments */}
        <Route path="payments"        element={<PaymentsListPage />} />
        <Route path="payments/:id"    element={<PaymentDetailPage />} />

        {/* Notifications */}
        <Route path="notifications"   element={<NotificationsPage />} />
        <Route path="team-board"      element={<TeamBoardPage />} />
        <Route path="performance-hub" element={<UserPerformanceRoute />} />
        <Route path="counselor-change-requests" element={<CounselorChangeRequestsPage />} />
        <Route path="pending/:module" element={<PendingPage />} />
        <Route path="rules-regulations" element={<RulesRegulationsPage />} />
        <Route path="rules-regulations/:id" element={<RulesRegulationsPage />} />

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
          <Route path="admin/consolidated-report" element={<MonthlyConsolidatedReportPage />} />
          <Route path="admin/receipts" element={<ReceiptsPage />} />
          <Route path="admin/user-monitoring" element={<UserMonitoringPage />} />
          <Route path="admin/lead-import-history" element={<LeadImportHistoryPage />} />
          <Route path="admin/data-import" element={<DataImportPage />} />
          <Route path="admin/lead-inbox" element={<LeadInboxPage />} />
          <Route path="admin/delete-candidates" element={<DeleteCandidatesPage />} />
          <Route path="admin/whatsapp-templates" element={<WhatsAppTemplatesPage />} />
          <Route path="admin/course-change-requests" element={<CourseChangeRequestsPage />} />
          <Route path="admin/walkin-assignment-requests" element={<WalkInAssignmentRequestsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
