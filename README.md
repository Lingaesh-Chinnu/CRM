# CRM + ERP System

A comprehensive Customer Relationship Management (CRM) and Enterprise Resource Planning (ERP) system built with Django REST Framework backend and React frontend.

## Features

- **Lead Management**: Track and manage potential customers
- **Walk-in Management**: Handle walk-in registrations
- **Enrollment Management**: Process course enrollments
- **Payment Tracking**: Monitor payments and installments
- **Dashboard Analytics**: Real-time business insights
- **User Management**: Role-based access control
- **Branch Management**: Multi-branch support
- **Reports & Exports**: Excel export functionality

## Tech Stack

### Backend
- **Django 4.2.9** - Web framework
- **Django REST Framework** - API development
- **SQLite** - Database (development)
- **JWT Authentication** - Secure authentication

### Frontend (Web)
- **React 18** - UI framework
- **Vite** - Build tool
- **Redux Toolkit** - State management
- **React Router** - Navigation
- **Tailwind CSS** - Styling
- **Axios** - HTTP client

### Mobile (React Native)
- **React Native 0.72** - Mobile framework
- **React Navigation** - Navigation
- **Redux Toolkit** - State management

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- npm or yarn

### Backend Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run database migrations:**
   ```bash
   python manage.py migrate
   ```

3. **Start the Django server:**
   ```bash
   python manage.py runserver
   ```

   The API will be available at: `http://127.0.0.1:8000/api/`
   Admin panel: `http://127.0.0.1:8000/admin/`

### Frontend (Web) Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

   The web app will be available at: `http://localhost:5173/`

### Merged Webpage Mode

If you want the project to work as a single webpage served by Django:

1. **Build the frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Start Django:**
   ```bash
   cd ..
   python manage.py runserver
   ```

3. **Open the web app:**
   - Webpage: `http://127.0.0.1:8000/`
   - Login page: `http://127.0.0.1:8000/login`
   - API: `http://127.0.0.1:8000/api/`

### Mobile Setup (React Native)

1. **Navigate to mobile directory:**
   ```bash
   cd mobile
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **For Android:**
   ```bash
   npm run android
   ```

4. **For iOS:**
   ```bash
   npm run ios
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login/` - User login
- `POST /api/auth/logout/` - User logout
- `POST /api/auth/token/refresh/` - Refresh JWT token
- `GET /api/auth/me/` - Get current user info

### Core Resources
- `/api/leads/` - Lead management
- `/api/walkins/` - Walk-in management
- `/api/enrollments/` - Enrollment management
- `/api/payments/` - Payment tracking
- `/api/branches/` - Branch management
- `/api/users/` - User management

### Analytics
- `GET /api/dashboard/summary/` - Dashboard statistics
- `GET /api/dashboard/branch-comparison/` - Branch comparison
- `GET /api/dashboard/trends/` - Trend analysis

## Project Structure

```
crm-erp/
├── automation.py              # Automation scripts
├── DEPLOYMENT.md              # Deployment guide
├── docker-compose.yml         # Docker configuration
├── frontend.js                # Frontend build script
├── mobile.tsx                 # Mobile app entry
├── models.py                  # Django models
├── README.md                  # This file
├── schema.sql                 # Database schema
├── serializers.py             # DRF serializers
├── settings.py                # Django settings
├── urls.py                    # URL configuration
├── views.py                   # API views
├── manage.py                  # Django CLI
├── requirements.txt           # Python dependencies
├── wsgi.py                    # WSGI application
│
├── frontend/                  # React web frontend
│   ├── src/
│   │   ├── components/        # Reusable components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API services
│   │   └── store/             # Redux store
│   ├── package.json
│   └── vite.config.js
│
└── mobile/                    # React Native mobile app
    ├── src/
    │   ├── screens/           # Screen components
    │   ├── navigation/        # Navigation setup
    │   ├── services/          # API services
    │   └── store/             # Redux store
    └── package.json
```

## Development

### Running All Services

1. **Start Backend:**
   ```bash
   python manage.py runserver
   ```

2. **Start Frontend (in new terminal):**
   ```bash
   cd frontend && npm run dev
   ```

3. **Start Mobile (in new terminal):**
   ```bash
   cd mobile && npm run android  # or npm run ios
   ```

### Environment Variables

Create a `.env` file in the root directory:

```env
DEBUG=True
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///db.sqlite3
ALLOWED_HOSTS=localhost,127.0.0.1
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

This project is licensed under the MIT License.
│       │   ├── serializers.py
│       │   └── views.py
│       │
│       ├── dashboard/               ← KPI + analytics endpoints
│       │   └── views.py             ← Summary, branch comparison, trends
│       │
│       ├── reports/                 ← Excel exports
│       │   └── views.py             ← Leads + Enrollments export
│       │
│       └── automation/              ← WhatsApp + Celery + Notifications
│           ├── models.py            ← WhatsAppMessage, Notification
│           ├── serializers.py
│           ├── whatsapp.py          ← WhatsAppClient + message helpers
│           ├── tasks.py             ← 5 scheduled Celery tasks
│           └── views.py             ← Webhook, send, public form
│
├── frontend/                        ← React + Vite + Redux
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx                 ← Entry point
│       ├── App.jsx                  ← All routes
│       ├── index.css
│       │
│       ├── store/
│       │   ├── index.js             ← Redux store
│       │   └── slices/
│       │       ├── authSlice.js     ← Login/logout + token persistence
│       │       └── notificationSlice.js
│       │
│       ├── services/
│       │   └── api.js               ← Axios instance + JWT refresh + all services
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   ├── MainLayout.jsx   ← Sidebar + TopBar + Outlet
│       │   │   ├── Sidebar.jsx      ← RBAC nav items
│       │   │   └── TopBar.jsx       ← User info + notifications
│       │   ├── common/
│       │   │   ├── PrivateRoute.jsx
│       │   │   ├── AdminRoute.jsx
│       │   │   ├── DataTable.jsx    ← Reusable paginated table
│       │   │   ├── SearchBar.jsx    ← Search + filter bar
│       │   │   ├── StatusBadge.jsx  ← Coloured status pill
│       │   │   ├── Modal.jsx
│       │   │   └── FormField.jsx
│       │   └── dashboard/
│       │       ├── KPICard.jsx
│       │       ├── TrendChart.jsx   ← Recharts line chart
│       │       └── BranchTable.jsx
│       │
│       └── pages/
│           ├── auth/LoginPage.jsx
│           ├── dashboard/DashboardPage.jsx
│           ├── leads/
│           │   ├── LeadsListPage.jsx
│           │   ├── LeadDetailPage.jsx
│           │   └── LeadCreatePage.jsx
│           ├── walkins/
│           │   ├── WalkInsListPage.jsx
│           │   ├── WalkInDetailPage.jsx
│           │   └── WalkInCreatePage.jsx
│           ├── enrollments/
│           │   ├── EnrollmentsListPage.jsx
│           │   └── EnrollmentDetailPage.jsx
│           ├── payments/
│           │   ├── PaymentsListPage.jsx
│           │   └── PaymentDetailPage.jsx
│           ├── admin/
│           │   ├── CoursesPage.jsx
│           │   ├── UsersPage.jsx
│           │   ├── TargetsPage.jsx
│           │   ├── BranchesPage.jsx
│           │   └── ReportsPage.jsx
│           └── public/
│               └── PublicWalkInForm.jsx   ← Shareable no-auth form
│
├── mobile/                          ← React Native (Expo)
│   ├── App.tsx                      ← Root + Redux + Navigation
│   ├── package.json
│   └── src/
│       ├── navigation/
│       │   └── RootNavigator.tsx    ← Auth gate + tabs + stacks
│       ├── store/                   ← Same Redux slices (AsyncStorage)
│       ├── services/
│       │   └── api.ts               ← Axios with AsyncStorage tokens
│       └── screens/
│           ├── auth/LoginScreen.tsx
│           ├── dashboard/DashboardScreen.tsx
│           ├── leads/
│           │   ├── LeadsScreen.tsx  ← Infinite scroll FlatList
│           │   ├── LeadDetailScreen.tsx
│           │   └── LeadCreateScreen.tsx
│           ├── walkins/
│           │   ├── WalkInsScreen.tsx
│           │   ├── WalkInDetailScreen.tsx
│           │   └── WalkInCreateScreen.tsx
│           ├── enrollments/EnrollmentsScreen.tsx
│           ├── payments/
│           │   ├── PaymentsScreen.tsx
│           │   └── PaymentAddScreen.tsx
│           └── profile/ProfileScreen.tsx
│
└── nginx/
    └── nginx.conf                   ← Reverse proxy config

# ============================================================
# KEY DESIGN DECISIONS
# ============================================================

1. RBAC (Role-Based Access Control)
   - IsSuperAdmin: full access
   - IsStaffOrAdmin: authenticated access with branch isolation
   - Staff can only see their own branch's data
   - Staff can only edit walkin_date + remarks on leads

2. Auto-generated IDs
   - Leads: LD-YYYYMM-XXXX
   - Walk-ins: WI-YYYYMM-XXXX
   - Students: STU-YYYYMM-XXXX

3. Auto-calculations
   - Course final_fees = actual_fees - discount_amount (MySQL generated column)
   - Enrollment final_fees = actual_fees - discount_amount (Python save())
   - Payment.paid_amount auto-updated on every instalment save
   - Payment.status auto-updated: paid / partial / unpaid

4. Auto-status logic
   - WalkIn: if "joined" in remarks → status = converted
   - Lead: status updated when converted to walk-in

5. Automation (Celery Beat)
   - Fee reminders: daily 10:00 AM
   - Birthday wishes: daily 8:00 AM
   - First class reminders: daily 9:00 AM
   - Walk-in reminders: daily 7:00 PM
   - Follow-up reminders: every Monday 9:00 AM

6. JWT Security
   - Access token: 8 hours
   - Refresh token: 7 days + blacklisting
   - Token rotation on refresh
   - Custom claims: role, branch_id, full_name

7. Public Walk-in Form
   - POST /api/public/walkin/ — no authentication
   - Sends WhatsApp confirmation on submit
   - Shareable link: https://yourcrm.com/public/walk-in
