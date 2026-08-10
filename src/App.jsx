import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AddClientPage from './pages/AddClientPage';
import EditClientPage from './pages/EditClientPage';
import ManageClientsPage from './pages/ManageClientsPage';
import TransactionsPage from './pages/TransactionsPage';
import CreateInvoicePage from './pages/CreateInvoicePage';
import TariffManagementPage from './pages/TariffManagementPage';
import PricingSettingsPage from './pages/PricingSettingsPage';
import TrainerManagementPage from './pages/TrainerManagementPage';
import AdminCredentialsPage from './pages/AdminCredentialsPage';
import WhatsAppRemindersPage from './pages/WhatsAppRemindersPage';
import InquiryManagementPage from './pages/InquiryManagementPage';
import ExpensesPage from './pages/ExpensesPage';
import StaffEnrollmentPage from './pages/StaffEnrollmentPage';
import StaffDirectoryPage from './pages/StaffDirectoryPage';
import ClientMeasurementsPage from './pages/ClientMeasurementsPage';
import PTPackageManagementPage from './pages/PTPackageManagementPage';
import PTAssignmentPage from './pages/PTAssignmentPage';
import PTClassLogPage from './pages/PTClassLogPage';
import TrainerSalaryReportPage from './pages/TrainerSalaryReportPage';
import AdvanceBookingPage from './pages/AdvanceBookingPage';
import GSTReportPage from './pages/GSTReportPage';
import SupplementManagementPage from './pages/SupplementManagementPage';
import SupplementCatalogPage from './pages/SupplementCatalogPage';
import SupplementPurchasePage from './pages/SupplementPurchasePage';
import SupplementSalePage from './pages/SupplementSalePage';
import SupplementRevenuePage from './pages/SupplementRevenuePage';
import OtherServicesPage from './pages/OtherServicesPage';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

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
      <div className={`app-root ${auth.isLoggedIn ? 'logged-in' : 'logged-out'} ${isSuperAdmin ? 'superadmin-layout' : 'admin-layout'} ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>

        {auth.isLoggedIn && (
          isSuperAdmin
            ? <Sidebar onLogout={handleLogout} isCollapsed={sidebarCollapsed} onToggle={toggleSidebar} />
            : <Navbar onLogout={handleLogout} userRole={auth.userRole} />
        )}

        <div className="app-main-content">
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
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
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
                <RoleProtectedRoute isLoggedIn={auth.isLoggedIn} userRole={auth.userRole} allowedRoles={['superadmin']}>
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
