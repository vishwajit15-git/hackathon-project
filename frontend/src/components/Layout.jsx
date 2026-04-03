import React from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LogOut, Home, Users, Calendar, Activity, UserPlus,
  ShieldAlert, MapPin, HeartPulse, BadgeCheck, Search
} from 'lucide-react';

// ─── Role colours ────────────────────────────────────────────────
const ROLE_COLORS = {
  admin:     '#a78bfa',
  police:    '#60a5fa',
  medical:   '#34d399',
  volunteer: '#fbbf24',
  user:      '#f472b6',
};

const ROLE_LABELS = {
  admin:     'Administrator',
  police:    'Police / Security',
  medical:   'Medical / NDRF',
  volunteer: 'Volunteer',
  user:      'Devotee',
};

const Layout = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/auth" />;

  const roleColor = ROLE_COLORS[user?.role] || 'var(--accent-primary)';
  const roleLabel = ROLE_LABELS[user?.role] || user?.role;

  const NavItem = ({ to, icon: Icon, label, exact }) => {
    const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: isActive ? 'var(--bg-glass-hover)' : 'transparent',
          textDecoration: 'none', marginBottom: '0.25rem', transition: 'all 0.2s',
          border: isActive ? '1px solid var(--border-glass)' : '1px solid transparent',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={19} color={isActive ? roleColor : 'currentColor'} />
        <span style={{ fontWeight: isActive ? '600' : '500', fontSize: '0.9rem' }}>{label}</span>
      </Link>
    );
  };

  const SectionLabel = ({ children }) => (
    <span style={{
      display: 'block', fontSize: '0.7rem', textTransform: 'uppercase',
      color: 'var(--text-muted)', marginBottom: '0.5rem',
      marginLeft: '1rem', fontWeight: '700', letterSpacing: '0.05em',
      marginTop: '1rem'
    }}>
      {children}
    </span>
  );

  return (
    <div className="app-container">
      {/* ── Sidebar ──────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: '260px',
        backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-glass)',
        display: 'flex', flexDirection: 'column', padding: '1.5rem', zIndex: 100,
        overflowY: 'auto'
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0 }} className="text-gradient">Smart Crowd</h2>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Management System v1.0</div>
        </div>

        {/* Role pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.5rem 0.75rem', borderRadius: '8px', marginBottom: '1.5rem',
          background: `${roleColor}15`, border: `1px solid ${roleColor}33`
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: roleColor,
            boxShadow: `0 0 6px ${roleColor}`
          }} />
          <span style={{ fontSize: '0.75rem', color: roleColor, fontWeight: '600' }}>{roleLabel}</span>
        </div>

        {/* ── Nav Links (role-specific) ──────────────────── */}
        <div style={{ flex: 1 }}>

          {/* ADMIN */}
          {user.role === 'admin' && (
            <>
              <SectionLabel>Command Center</SectionLabel>
              <NavItem to="/admin"        exact icon={Home}     label="Dashboard" />
              <NavItem to="/admin/alerts"       icon={Activity} label="Alerts Manager" />
              <NavItem to="/admin/slots"        icon={Calendar} label="Slot Manager" />
              <NavItem to="/admin/staff"        icon={UserPlus} label="Staff & Personnel" />
              <SectionLabel>Shared</SectionLabel>
              <NavItem to="/missing"            icon={Search}   label="Missing Persons" />
            </>
          )}

          {/* POLICE */}
          {user.role === 'police' && (
            <>
              <SectionLabel>Security Command</SectionLabel>
              <NavItem to="/police"  exact icon={BadgeCheck}  label="Force Dashboard" />
              <SectionLabel>Shared</SectionLabel>
              <NavItem to="/missing"       icon={Search}      label="Missing Persons" />
            </>
          )}

          {/* MEDICAL */}
          {user.role === 'medical' && (
            <>
              <SectionLabel>Medical Command</SectionLabel>
              <NavItem to="/police"  exact icon={HeartPulse}  label="Med Dashboard" />
              <SectionLabel>Shared</SectionLabel>
              <NavItem to="/missing"       icon={Search}      label="Missing Persons" />
            </>
          )}

          {/* VOLUNTEER */}
          {user.role === 'volunteer' && (
            <>
              <SectionLabel>Field Force</SectionLabel>
              <NavItem to="/volunteer" exact icon={ShieldAlert} label="My Tasks" />
              <NavItem to="/missing"         icon={Search}      label="Missing Persons" />
            </>
          )}

          {/* USER / DEVOTEE */}
          {user.role === 'user' && (
            <>
              <SectionLabel>My Portal</SectionLabel>
              <NavItem to="/portal"  exact icon={Home}     label="Dashboard" />
              <NavItem to="/missing"       icon={Search}   label="Missing Persons" />
            </>
          )}
        </div>

        {/* ── Profile & Logout ──────────────────────────── */}
        <div style={{
          paddingTop: '1rem', borderTop: '1px solid var(--border-glass)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: `linear-gradient(135deg, ${roleColor}, var(--accent-secondary))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '700', color: 'white', fontSize: '1rem', flexShrink: 0
            }}>
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name ? user.name.split(' ')[0] : 'User'}
              </div>
              <div style={{ fontSize: '0.7rem', color: roleColor }}>{roleLabel}</div>
            </div>
          </div>
          <button
            onClick={logout}
            title="Logout"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────────── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
