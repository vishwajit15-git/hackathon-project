import React from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Home, User, ShieldAlert, Users, Calendar, Activity, UserPlus } from 'lucide-react';

const Layout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/auth" />;
  }

  const handleLogout = () => {
    logout();
  };

  const NavItem = ({ to, icon: Icon, label }) => {
    const isActive = location.pathname.startsWith(to);
    return (
      <Link 
        to={to === '/portal' ? (user.role === 'admin' ? '/admin' : '/portal') : to} 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-sm)',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isActive ? 'var(--bg-glass-hover)' : 'transparent',
          textDecoration: 'none',
          marginBottom: '0.5rem',
          transition: 'all 0.2s',
          border: isActive ? '1px solid var(--border-glass)' : '1px solid transparent'
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <Icon size={20} color={isActive ? 'var(--accent-primary)' : 'currentColor'} />
        <span style={{ fontWeight: isActive ? '600' : '500' }}>{label}</span>
      </Link>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <nav style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '260px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-glass)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        zIndex: 100
      }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800' }} className="text-gradient">Smart Crowd</h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Management System</div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Admin / Police Routes */}
          {(user.role === 'admin' || user.role === 'police') && (
             <>
               <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', marginLeft: '1rem', fontWeight: '700' }}>Command Center</span>
               <NavItem to="/admin" icon={Home} label="Dashboard" />
               <NavItem to="/admin/alerts" icon={Activity} label="Alerts Manager" />
               <NavItem to="/admin/slots" icon={Calendar} label="Slot Manager" />
               <NavItem to="/admin/staff" icon={UserPlus} label="Staff & Personnel" />
               <NavItem to="/missing" icon={Users} label="Missing Persons" />
             </>
          )}

          {/* User Routes */}
          {user.role === 'user' && (
             <>
               <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', marginLeft: '1rem', fontWeight: '700' }}>My Portal</span>
               <NavItem to="/portal" icon={Home} label="Dashboard" />
               <NavItem to="/missing" icon={Users} label="Missing Persons" />
             </>
          )}

           {/* Volunteer Routes */}
           {user.role === 'volunteer' && (
             <>
               <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', marginLeft: '1rem', fontWeight: '700' }}>Field Force</span>
               <NavItem to="/volunteer" icon={ShieldAlert} label="My Tasks" />
             </>
          )}
        </div>

        {/* User Profile & Logout */}
        <div style={{
          paddingTop: '1rem',
          borderTop: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              color: 'white'
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600' }}>{user.name.split(' ')[0]}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer',
              padding: '0.5rem'
            }}
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {/* Main Content View */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
