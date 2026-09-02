import React, { useState, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-loaded route components for high-speed initial bundle delivery
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AddClientPage = lazy(() => import('./pages/AddClientPage'));
const EditClientPage = lazy(() => import('./pages/EditClientPage'));
const ManageClientsPage = lazy(() => import('./pages/ManageClientsPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const CreateInvoicePage = lazy(() => import('./pages/CreateInvoicePage'));
const TariffManagementPage = lazy(() => import('./pages/TariffManagementPage'));
const PricingSettingsPage = lazy(() => import('./pages/PricingSettingsPage'));
const TrainerManagementPage = lazy(() => import('./pages/TrainerManagementPage'));
const AdminCredentialsPage = lazy(() => import('./pages/AdminCredentialsPage'));
const WhatsAppRemindersPage = lazy(() => import('./pages/WhatsAppRemindersPage'));
const InquiryManagementPage = lazy(() => import('./pages/InquiryManagementPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const StaffEnrollmentPage = lazy(() => import('./pages/StaffEnrollmentPage'));
const StaffDirectoryPage = lazy(() => import('./pages/StaffDirectoryPage'));
const ClientMeasurementsPage = lazy(() => import('./pages/ClientMeasurementsPage'));
const PTPackageManagementPage = lazy(() => import('./pages/PTPackageManagementPage'));
const PTAssignmentPage = lazy(() => import('./pages/PTAssignmentPage'));
const PTClassLogPage = lazy(() => import('./pages/PTClassLogPage'));
const TrainerSalaryReportPage = lazy(() => import('./pages/TrainerSalaryReportPage'));
const AdvanceBookingPage = lazy(() => import('./pages/AdvanceBookingPage'));
const GSTReportPage = lazy(() => import('./pages/GSTReportPage'));
const ClientServiceSalesHistoryPage = lazy(() => import('./pages/ClientServiceSalesHistoryPage'));
const SupplementManagementPage = lazy(() => import('./pages/SupplementManagementPage'));
const SupplementCatalogPage = lazy(() => import('./pages/SupplementCatalogPage'));
const SupplementPurchasePage = lazy(() => import('./pages/SupplementPurchasePage'));
const SupplementSalePage = lazy(() => import('./pages/SupplementSalePage'));
const SupplementRevenuePage = lazy(() => import('./pages/SupplementRevenuePage'));
const OtherServicesPage = lazy(() => import('./pages/OtherServicesPage'));

const PageLoadingFallback = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '60vh',
    gap: '1rem',
    color: '#38bdf8',
    fontSize: '0.95rem',
    fontWeight: '600'
  }}>
    <div style={{
      width: '32px',
      height: '32px',
      border: '3px solid rgba(56, 189, 248, 0.2)',
      borderTopColor: '#38bdf8',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
    <span>Loading module...</span>
  </div>
);

const RoleProtectedRoute = ({ children, isLoggedIn, userRole, allowedRoles }) => {
  const location = useLocation();
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    const defaultPath = userRole === 'superadmin' ? '/dashboard' : '/manage-clients';
    return <Navigate to={defaultPath} replace />;
  }

  return children;
};

function App() {
  const [auth, setAuth] = useState({
    isLoggedIn: localStorage.getItem('isLoggedIn') === 'true',
    userRole: localStorage.getItem('userRole') || ''
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };

  const handleLogin = (role) => {
    setAuth({ isLoggedIn: true, userRole: role });
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('userRole', role);
  };

  const handleLogout = () => {
    setAuth({ isLoggedIn: false, userRole: '' });
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userRole');
    localStorage.removeItem('alertSnoozed');
  };

  const isSuperAdmin = auth.isLoggedIn && auth.userRole === 'superadmin';

  return (
    <Router>
      <div className={`app-root ${auth.isLoggedIn ? 'logged-in superadmin-layout' : 'logged-out'} ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>

        {auth.isLoggedIn && (
          <Sidebar userRole={auth.userRole} onLogout={handleLogout} isCollapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        )}

        <div className="app-main-content">
          <ErrorBoundary>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
              <Route
                path="/login"
                element={auth.isLoggedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />}
              />

            <Route
              path="/dashboard"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <DashboardPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/add-client"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <AddClientPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/manage-clients"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <ManageClientsPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/whatsapp-reminders"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <WhatsAppRemindersPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/attendance"
              element={<Navigate to={auth.userRole === 'superadmin' ? '/dashboard' : '/manage-clients'} replace />}
            />

            <Route
              path="/inquiries"
              element={<Navigate to={auth.userRole === 'superadmin' ? '/dashboard' : '/manage-clients'} replace />}
            />

            <Route
              path="/edit-client/:id"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <EditClientPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/transactions"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <TransactionsPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/create-invoice"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <CreateInvoicePage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <TariffManagementPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/gst-report"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <GSTReportPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/service-sales-history"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <ClientServiceSalesHistoryPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/other-services"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <OtherServicesPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/trainers"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <TrainerManagementPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/pt-packages"
              element={<Navigate to="/settings" replace />}
            />

            <Route
              path="/pt-assignments"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <PTAssignmentPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/pt-class-log"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <PTClassLogPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/advance-bookings"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <AdvanceBookingPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/trainer-salary-report"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <TrainerSalaryReportPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/expenses"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <ExpensesPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/measurements"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <ClientMeasurementsPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/staff-enrollment"
              element={<Navigate to={auth.userRole === 'superadmin' ? '/dashboard' : '/manage-clients'} replace />}
            />

            <Route
              path="/staff-directory"
              element={<Navigate to={auth.userRole === 'superadmin' ? '/dashboard' : '/manage-clients'} replace />}
            />

            <Route
              path="/admin-credentials"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
                  <AdminCredentialsPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/supplements/catalog"
              element={<Navigate to="/supplements?tab=catalog" replace />}
            />

            <Route
              path="/supplements/purchases"
              element={<Navigate to="/supplements?tab=purchases" replace />}
            />

            <Route
              path="/supplements/sales"
              element={<Navigate to="/supplements?tab=sales" replace />}
            />

            <Route
              path="/supplements/revenue"
              element={<Navigate to="/supplements?tab=revenue" replace />}
            />

            <Route
              path="/supplements"
              element={
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['admin', 'superadmin']}>
                  <SupplementManagementPage />
                </RoleProtectedRoute>
              }
            />

            <Route
              path="/"
              element={
                auth.isLoggedIn
                  ? <Navigate to={auth.userRole === 'superadmin' ? '/dashboard' : '/manage-clients'} replace />
                  : <Navigate to="/login" replace />
              }
            />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Global Floating Powered By Credit Badge */}
        {auth.isLoggedIn && (
          <div className="global-powered-by">
            Powered by <span>Together Tech</span>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
