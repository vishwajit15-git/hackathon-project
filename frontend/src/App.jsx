import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/Auth/AuthPage';
import Layout from './components/Layout';
import { useAuth } from './context/AuthContext';

// Lazy loading missing dash stubs for now to avoid crashes
const AdminDash = React.lazy(() => import('./pages/AdminDash/AdminDash').catch(() => ({ default: () => <div>Admin Dashboard Module missing</div> })));
const SlotManager = React.lazy(() => import('./pages/AdminDash/SlotManager').catch(() => ({ default: () => <div>Slot Manager missing</div> })));
const AlertManager = React.lazy(() => import('./pages/AdminDash/AlertManager').catch(() => ({ default: () => <div>Alert Manager missing</div> })));
const StaffManager = React.lazy(() => import('./pages/AdminDash/StaffManager').catch(() => ({ default: () => <div>Staff Manager missing</div> })));
const UserPortal = React.lazy(() => import('./pages/UserPortal/UserPortal').catch(() => ({ default: () => <div>User Portal Module missing</div> })));
const MissingPersons = React.lazy(() => import('./pages/MissingPersons/MissingPersons').catch(() => ({ default: () => <div>Missing Persons Module missing</div> })));
const VolunteerDash = React.lazy(() => import('./pages/VolunteerDash/VolunteerDash').catch(() => ({ default: () => <div>Volunteer Dash Module missing</div> })));

function PrivateRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  
  if (!isAuthenticated) return <Navigate to="/auth" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" />; // fallback
  }
  return children;
}

function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <Router>
      <React.Suspense fallback={<div className="auth-layout"><div className="text-gradient" style={{fontSize: '2rem'}}>Loading...</div></div>}>
        <Routes>
          {/* Public Route */}
          <Route path="/auth" element={!isAuthenticated ? <AuthPage /> : <Navigate to="/" />} />

          {/* Protected Routes Wrapper */}
          <Route path="/" element={<Layout />}>
            
            {/* Base Redirect based on role */}
            <Route index element={
              isAuthenticated ? (
                user.role === 'admin' || user.role === 'police' ? <Navigate to="/admin" /> :
                user.role === 'volunteer' ? <Navigate to="/volunteer" /> :
                <Navigate to="/portal" />
              ) : <Navigate to="/auth" />
            } />

            {/* Role Specific Routes */}
            <Route path="/admin" element={
              <PrivateRoute allowedRoles={['admin', 'police', 'medical']}>
                <AdminDash />
              </PrivateRoute>
            } />

            <Route path="/admin/slots" element={
              <PrivateRoute allowedRoles={['admin']}>
                <SlotManager />
              </PrivateRoute>
            } />

            <Route path="/admin/alerts" element={
              <PrivateRoute allowedRoles={['admin', 'police']}>
                <AlertManager />
              </PrivateRoute>
            } />

            <Route path="/admin/staff" element={
              <PrivateRoute allowedRoles={['admin']}>
                <StaffManager />
              </PrivateRoute>
            } />
            
            <Route path="/portal" element={
              <PrivateRoute allowedRoles={['user']}>
                <UserPortal />
              </PrivateRoute>
            } />

            <Route path="/volunteer" element={
              <PrivateRoute allowedRoles={['volunteer']}>
                <VolunteerDash />
              </PrivateRoute>
            } />

            <Route path="/missing" element={
              <PrivateRoute allowedRoles={['admin', 'police', 'user', 'volunteer']}>
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
