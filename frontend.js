// ============================================================
// frontend/src/main.jsx — Entry point
// ============================================================
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { store } from './store'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
)


// ============================================================
// frontend/src/App.jsx — Route configuration
// ============================================================
import { Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import PrivateRoute from './components/common/PrivateRoute'
import AdminRoute  from './components/common/AdminRoute'
import MainLayout  from './components/layout/MainLayout'

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

// Payments
import PaymentsListPage from './pages/payments/PaymentsListPage'
import PaymentDetailPage from './pages/payments/PaymentDetailPage'

// Admin-only pages
import CoursesPage   from './pages/admin/CoursesPage'
import UsersPage     from './pages/admin/UsersPage'
import TargetsPage   from './pages/admin/TargetsPage'
import BranchesPage  from './pages/admin/BranchesPage'
import ReportsPage   from './pages/admin/ReportsPage'

// Public
import PublicWalkInForm from './pages/public/PublicWalkInForm'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login"             element={<LoginPage />} />
      <Route path="/public/walk-in"    element={<PublicWalkInForm />} />

      {/* Protected routes inside MainLayout */}
      <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />

        {/* Leads */}
        <Route path="leads"           element={<LeadsListPage />} />
        <Route path="leads/new"       element={<LeadCreatePage />} />
        <Route path="leads/:id"       element={<LeadDetailPage />} />

        {/* Walk-ins */}
        <Route path="walkins"         element={<WalkInsListPage />} />
        <Route path="walkins/new"     element={<WalkInCreatePage />} />
        <Route path="walkins/:id"     element={<WalkInDetailPage />} />

        {/* Enrollments */}
        <Route path="enrollments"     element={<EnrollmentsListPage />} />
        <Route path="enrollments/:id" element={<EnrollmentDetailPage />} />

        {/* Payments */}
        <Route path="payments"        element={<PaymentsListPage />} />
        <Route path="payments/:id"    element={<PaymentDetailPage />} />

        {/* Super Admin only */}
        <Route element={<AdminRoute />}>
          <Route path="admin/courses"  element={<CoursesPage />} />
          <Route path="admin/users"    element={<UsersPage />} />
          <Route path="admin/targets"  element={<TargetsPage />} />
          <Route path="admin/branches" element={<BranchesPage />} />
          <Route path="admin/reports"  element={<ReportsPage />} />
        </Route>
      </Route>
    </Routes>
  )
}


// ============================================================
// frontend/src/store/index.js — Redux store
// ============================================================
import { configureStore } from '@reduxjs/toolkit'
import authReducer         from './slices/authSlice'
import notifReducer        from './slices/notificationSlice'

export const store = configureStore({
  reducer: {
    auth:          authReducer,
    notifications: notifReducer,
  },
})


// ============================================================
// frontend/src/store/slices/authSlice.js
// ============================================================
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../services/api'

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login/', credentials)
    // Persist tokens in localStorage
    localStorage.setItem('access_token',  data.access)
    localStorage.setItem('refresh_token', data.refresh)
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data?.detail || 'Login failed')
  }
})

export const logout = createAsyncThunk('auth/logout', async (_, { getState }) => {
  const refresh = localStorage.getItem('refresh_token')
  try { await api.post('/auth/logout/', { refresh }) } catch {}
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
})

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user:    null,
    loading: false,
    error:   null,
    // Rehydrate from token on page refresh
    isAuthenticated: !!localStorage.getItem('access_token'),
  },
  reducers: {
    setUser: (state, action) => { state.user = action.payload },
    clearAuth: (state) => { state.user = null; state.isAuthenticated = false },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending,  (s) => { s.loading = true; s.error = null })
      .addCase(login.fulfilled,(s, a) => { s.loading = false; s.isAuthenticated = true; s.user = a.payload.user })
      .addCase(login.rejected, (s, a) => { s.loading = false; s.error = a.payload })
      .addCase(logout.fulfilled, (s) => { s.user = null; s.isAuthenticated = false })
  },
})

export const { setUser, clearAuth } = authSlice.actions
export default authSlice.reducer


// ============================================================
// frontend/src/services/api.js — Axios instance with JWT
// ============================================================
import axios from 'axios'
import { store } from '../store'
import { clearAuth } from '../store/slices/authSlice'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 — refresh or logout
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${original.baseURL}/auth/token/refresh/`,
            { refresh }
          )
          localStorage.setItem('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          store.dispatch(clearAuth())
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// ── Typed service modules ──────────────────────────────────────

export const authService = {
  login:   (creds)  => api.post('/auth/login/', creds),
  logout:  (refresh)=> api.post('/auth/logout/', { refresh }),
  me:      ()       => api.get('/auth/me/'),
}

export const leadService = {
  list:    (params) => api.get('/leads/', { params }),
  get:     (id)     => api.get(`/leads/${id}/`),
  create:  (data)   => api.post('/leads/', data),
  update:  (id, d)  => api.patch(`/leads/${id}/`, d),
  delete:  (id)     => api.delete(`/leads/${id}/`),
  convert: (id)     => api.post(`/leads/${id}/convert-to-walkin/`),
}

export const walkinService = {
  list:    (params) => api.get('/walkins/', { params }),
  get:     (id)     => api.get(`/walkins/${id}/`),
  create:  (data)   => api.post('/walkins/', data),
  update:  (id, d)  => api.patch(`/walkins/${id}/`, d),
  enroll:  (id, d)  => api.post(`/walkins/${id}/convert-to-enrollment/`, d),
}

export const enrollmentService = {
  list:   (params) => api.get('/enrollments/', { params }),
  get:    (id)     => api.get(`/enrollments/${id}/`),
  create: (data)   => api.post('/enrollments/', data),
  update: (id, d)  => api.patch(`/enrollments/${id}/`, d),
}

export const paymentService = {
  list:          (params) => api.get('/payments/', { params }),
  get:           (id)     => api.get(`/payments/${id}/`),
  addInstalment: (data)   => api.post('/installments/', data),
}

export const courseService = {
  list:   (params) => api.get('/courses/', { params }),
  create: (data)   => api.post('/courses/', data),
  update: (id, d)  => api.put(`/courses/${id}/`, d),
  delete: (id)     => api.delete(`/courses/${id}/`),
}

export const dashboardService = {
  summary:    ()       => api.get('/dashboard/summary/'),
  branches:   (month)  => api.get('/dashboard/branch-comparison/', { params: { month } }),
  trends:     (days)   => api.get('/dashboard/trends/', { params: { days } }),
}

export const reportService = {
  exportLeads:       () => api.get('/reports/export/leads/',       { responseType: 'blob' }),
  exportEnrollments: () => api.get('/reports/export/enrollments/', { responseType: 'blob' }),
}

export const whatsappService = {
  send: (data) => api.post('/whatsapp/send/', data),
}


// ============================================================
// frontend/src/components/layout/MainLayout.jsx
// ============================================================
import { Outlet } from 'react-router-dom'
import Sidebar      from './Sidebar'
import TopBar       from './TopBar'

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}


// ============================================================
// frontend/src/components/layout/Sidebar.jsx
// ============================================================
import { NavLink } from 'react-router-dom'
import { useSelector } from 'react-redux'

const NAV_ITEMS = [
  { path: '/dashboard',    label: 'Dashboard',   icon: '◉', roles: ['super_admin','staff'] },
  { path: '/leads',        label: 'Leads',        icon: '◎', roles: ['super_admin','staff'] },
  { path: '/walkins',      label: 'Walk-ins',     icon: '◈', roles: ['super_admin','staff'] },
  { path: '/enrollments',  label: 'Enrollments',  icon: '◆', roles: ['super_admin','staff'] },
  { path: '/payments',     label: 'Payments',     icon: '◇', roles: ['super_admin','staff'] },
  // Admin only
  { path: '/admin/courses', label: 'Courses',    icon: '▣', roles: ['super_admin'] },
  { path: '/admin/users',   label: 'Users',      icon: '▤', roles: ['super_admin'] },
  { path: '/admin/targets', label: 'Targets',    icon: '▥', roles: ['super_admin'] },
  { path: '/admin/branches',label: 'Branches',   icon: '▦', roles: ['super_admin'] },
  { path: '/admin/reports', label: 'Reports',    icon: '▧', roles: ['super_admin'] },
]

export default function Sidebar() {
  const { user } = useSelector((s) => s.auth)
  const role      = user?.role || 'staff'

  const visible = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">CRM ERP</div>
      <nav>
        {visible.map((item) => (
          <NavLink key={item.path} to={item.path} className="sidebar-link">
            <span className="sidebar-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}


// ============================================================
// frontend/src/components/common/PrivateRoute.jsx
// ============================================================
import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'

export default function PrivateRoute({ children }) {
  const { isAuthenticated } = useSelector((s) => s.auth)
  return isAuthenticated ? children : <Navigate to="/login" replace />
}


// ============================================================
// frontend/src/components/common/AdminRoute.jsx
// ============================================================
import { Navigate, Outlet } from 'react-router-dom'
import { useSelector } from 'react-redux'

export default function AdminRoute() {
  const { user } = useSelector((s) => s.auth)
  if (!user) return null
  return user.role === 'super_admin' ? <Outlet /> : <Navigate to="/dashboard" replace />
}


// ============================================================
// frontend/src/pages/dashboard/DashboardPage.jsx
// ============================================================
import { useEffect, useState } from 'react'
import { dashboardService } from '../../services/api'
import KPICard from '../../components/dashboard/KPICard'
import TrendChart from '../../components/dashboard/TrendChart'
import BranchTable from '../../components/dashboard/BranchTable'
import { useSelector } from 'react-redux'

export default function DashboardPage() {
  const [summary,  setSummary]  = useState(null)
  const [trends,   setTrends]   = useState([])
  const [branches, setBranches] = useState([])
  const { user } = useSelector((s) => s.auth)

  useEffect(() => {
    dashboardService.summary().then(r => setSummary(r.data))
    dashboardService.trends(30).then(r => setTrends(r.data))
    if (user?.role === 'super_admin') {
      dashboardService.branches().then(r => setBranches(r.data))
    }
  }, [user])

  if (!summary) return <div>Loading dashboard...</div>

  return (
    <div>
      <h1>Dashboard</h1>

      {/* KPI tiles */}
      <div className="kpi-grid">
        <KPICard label="Total Leads"       value={summary.total_leads}       sub={`+${summary.leads_this_month} this month`} color="blue" />
        <KPICard label="Walk-ins"          value={summary.total_walkins}     sub={`+${summary.walkins_this_month} this month`} color="teal" />
        <KPICard label="Enrollments"       value={summary.total_enrollments} sub={`+${summary.enroll_this_month} this month`} color="green" />
        <KPICard label="Total Revenue"     value={`₹${Number(summary.total_revenue).toLocaleString()}`}
                                           sub={`₹${Number(summary.revenue_this_month).toLocaleString()} this month`} color="purple" />
        <KPICard label="Pending Payments"  value={summary.pending_payments}  color="red" />
        <KPICard label="Pending Amount"    value={`₹${Number(summary.pending_amount).toLocaleString()}`} color="orange" />
      </div>

      {/* Trend chart */}
      <TrendChart data={trends} />

      {/* Branch comparison — admin only */}
      {user?.role === 'super_admin' && <BranchTable data={branches} />}
    </div>
  )
}


// ============================================================
// frontend/src/pages/leads/LeadsListPage.jsx
// ============================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { leadService } from '../../services/api'
import DataTable    from '../../components/common/DataTable'
import SearchBar    from '../../components/common/SearchBar'
import StatusBadge  from '../../components/common/StatusBadge'
import toast        from 'react-hot-toast'

export default function LeadsListPage() {
  const [leads,    setLeads]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [params,   setParams]   = useState({ page: 1, search: '', status: '' })
  const [total,    setTotal]    = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    leadService.list(params)
      .then(r => { setLeads(r.data.results); setTotal(r.data.count) })
      .catch(() => toast.error('Failed to load leads'))
      .finally(() => setLoading(false))
  }, [params])

  const columns = [
    { key: 'lead_number',    label: 'Lead No' },
    { key: 'name',           label: 'Name' },
    { key: 'phone',          label: 'Phone' },
    { key: 'course_name',    label: 'Course' },
    { key: 'walkin_date',    label: 'Walk-in Date' },
    { key: 'status',         label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'branch_name',    label: 'Branch' },
    { key: 'assigned_to_name', label: 'Assigned To' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>Leads</h1>
        <button className="btn-primary" onClick={() => navigate('/leads/new')}>+ Add Lead</button>
      </div>
      <SearchBar
        onSearch={(q) => setParams(p => ({ ...p, search: q, page: 1 }))}
        filters={[
          { name: 'status', label: 'Status', options: [
            {value:'new','label':'New'},{value:'follow_up','label':'Follow Up'},
            {value:'walk_in','label':'Walk-in'},{value:'converted','label':'Converted'},
          ]},
        ]}
        onFilter={(f) => setParams(p => ({ ...p, ...f, page: 1 }))}
      />
      <DataTable
        columns={columns}
        data={leads}
        loading={loading}
        total={total}
        page={params.page}
        onPageChange={(pg) => setParams(p => ({ ...p, page: pg }))}
        onRowClick={(row) => navigate(`/leads/${row.id}`)}
      />
    </div>
  )
}
