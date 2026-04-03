import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/Auth/AuthPage';
import Layout from './components/Layout';
import { useAuth } from './context/AuthContext';

const AdminDash    = React.lazy(() => import('./pages/AdminDash/AdminDash').catch(()    => ({ default: () => <div>Admin Dashboard missing</div> })));
const SlotManager  = React.lazy(() => import('./pages/AdminDash/SlotManager').catch(()  => ({ default: () => <div>Slot Manager missing</div> })));
const AlertManager = React.lazy(() => import('./pages/AdminDash/AlertManager').catch(() => ({ default: () => <div>Alert Manager missing</div> })));
const StaffManager = React.lazy(() => import('./pages/AdminDash/StaffManager').catch(() => ({ default: () => <div>Staff Manager missing</div> })));
const UserPortal   = React.lazy(() => import('./pages/UserPortal/UserPortal').catch(()   => ({ default: () => <div>User Portal missing</div> })));
const MissingPersons = React.lazy(() => import('./pages/MissingPersons/MissingPersons').catch(() => ({ default: () => <div>Missing Persons missing</div> })));
const VolunteerDash  = React.lazy(() => import('./pages/VolunteerDash/VolunteerDash').catch(()  => ({ default: () => <div>Volunteer Dash missing</div> })));
const PoliceDash     = React.lazy(() => import('./pages/PoliceDash/PoliceDash').catch(()     => ({ default: () => <div>Police Dashboard missing</div> })));

// ─── Role-based redirect helper ──────────────────────────────────
const getDefaultPath = (role) => {
  if (role === 'admin')                          return '/admin';
  if (role === 'police' || role === 'medical')   return '/police';
  if (role === 'volunteer')                      return '/volunteer';
  return '/portal';
};

// ─── Protected route wrapper ─────────────────────────────────────
function PrivateRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/auth" />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to={getDefaultPath(user?.role)} />;
  }
  return children;
}

function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Router>
      <React.Suspense fallback={
        <div className="auth-layout">
          <div className="text-gradient" style={{ fontSize: '2rem' }}>Loading...</div>
        </div>
      }>
        <Routes>
          {/* Public */}
          <Route path="/auth" element={!isAuthenticated ? <AuthPage /> : <Navigate to={getDefaultPath(user?.role)} />} />

          {/* Protected (all behind Layout) */}
          <Route path="/" element={<Layout />}>

            {/* Base redirect — per role */}
            <Route index element={
              isAuthenticated
                ? <Navigate to={getDefaultPath(user?.role)} />
                : <Navigate to="/auth" />
            } />

            {/* ── Admin routes ──────────────────────────────── */}
            <Route path="/admin" element={
              <PrivateRoute allowedRoles={['admin']}>
                <AdminDash />
              </PrivateRoute>
            } />
            <Route path="/admin/slots" element={
              <PrivateRoute allowedRoles={['admin']}>
                <SlotManager />
              </PrivateRoute>
            } />
            <Route path="/admin/alerts" element={
              <PrivateRoute allowedRoles={['admin']}>
                <AlertManager />
              </PrivateRoute>
            } />
            <Route path="/admin/staff" element={
              <PrivateRoute allowedRoles={['admin']}>
                <StaffManager />
              </PrivateRoute>
            } />

            {/* ── Police / Medical dashboard ────────────────── */}
            <Route path="/police" element={
              <PrivateRoute allowedRoles={['police', 'medical']}>
                <PoliceDash />
              </PrivateRoute>
            } />

            {/* ── Volunteer dashboard ───────────────────────── */}
            <Route path="/volunteer" element={
              <PrivateRoute allowedRoles={['volunteer']}>
                <VolunteerDash />
              </PrivateRoute>
            } />

            {/* ── Devotee / User portal ─────────────────────── */}
            <Route path="/portal" element={
              <PrivateRoute allowedRoles={['user']}>
                <UserPortal />
              </PrivateRoute>
            } />

            {/* ── Missing persons (multi-role) ──────────────── */}
            <Route path="/missing" element={
              <PrivateRoute allowedRoles={['admin', 'police', 'medical', 'user', 'volunteer']}>
                <MissingPersons />
              </PrivateRoute>
            } />

          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </React.Suspense>
    </Router>
  );
}

export default App;
