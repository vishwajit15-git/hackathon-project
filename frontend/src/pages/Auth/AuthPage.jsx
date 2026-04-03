import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Lock, User, Phone, Sparkles, ArrowRight, Loader2,
  Shield, Users, Activity, HeartPulse, BadgeCheck
} from 'lucide-react';

const ROLE_INFO = {
  admin:     { icon: Shield,      label: 'System Administrator', color: '#a78bfa' },
  police:    { icon: BadgeCheck,  label: 'Police / Security',    color: '#60a5fa' },
  medical:   { icon: HeartPulse, label: 'Medical / NDRF',        color: '#34d399' },
  volunteer: { icon: Users,       label: 'Volunteer',             color: '#fbbf24' },
  user:      { icon: Activity,    label: 'Devotee',               color: '#f472b6' },
};

const getRedirectPath = (role) => {
  if (role === 'admin') return '/admin';
  if (role === 'police' || role === 'medical') return '/police';
  if (role === 'volunteer') return '/volunteer';
  return '/portal';
};

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      if (isLogin) {
        user = await login(formData.email, formData.password);
      } else {
        // Public signup is always 'user' role — personnel are created by admin
        user = await signup({ ...formData, role: 'user' });
      }
      navigate(getRedirectPath(user.role));
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="glass-panel auth-card">

        {/* Header */}
        <div className="text-center" style={{ marginBottom: '1.5rem' }}>
          <div className="auth-badge" style={{ marginBottom: '0.75rem' }}>
            <Sparkles size={12} style={{ marginRight: '4px', display: 'inline' }} />
            Nexus Crowd v1.0
          </div>
          <h2 className="text-gradient" style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.25rem' }}>
            {isLogin ? 'Welcome Back' : 'Join as Devotee'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0' }}>
            {isLogin
              ? 'Sign in to access your personalized dashboard.'
              : 'Register as a devotee to book slots.'}
          </p>

          {/* Role icons for context — login screen only */}
          {isLogin && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {Object.entries(ROLE_INFO).map(([role, info]) => {
                const Icon = info.icon;
                return (
                  <div key={role} title={info.label} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    padding: '0.5rem 0.75rem', borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '0.65rem', color: info.color, minWidth: '60px'
                  }}>
                    <Icon size={16} color={info.color} />
                    <span>{info.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="glass-panel" style={{
            backgroundColor: 'rgba(208,0,0,0.1)', borderColor: 'rgba(208,0,0,0.3)',
            color: '#ff4d4d', padding: '1rem', marginBottom: '1.5rem',
            borderRadius: 'var(--radius-sm)', fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <div className="input-with-icon">
                <User className="input-icon" size={18} />
                <input type="text" name="name" className="input-control" value={formData.name}
                  onChange={handleChange} required={!isLogin} placeholder="Ravi Kumar" />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email Address</label>
            <div className="input-with-icon">
              <Mail className="input-icon" size={18} />
              <input type="email" name="email" className="input-control" value={formData.email}
                onChange={handleChange} required placeholder="you@example.com" />
            </div>
          </div>

          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Phone Number</label>
              <div className="input-with-icon">
                <Phone className="input-icon" size={18} />
                <input type="tel" name="phone" className="input-control" value={formData.phone}
                  onChange={handleChange} required={!isLogin} placeholder="9876543210" />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="input-with-icon">
              <Lock className="input-icon" size={18} />
              <input type="password" name="password" className="input-control" value={formData.password}
                onChange={handleChange} required placeholder="••••••••" />
            </div>
          </div>

          {!isLogin && (
            <div className="glass-panel" style={{
              padding: '0.75rem 1rem', fontSize: '0.8rem',
              color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
              borderColor: 'rgba(167, 139, 250, 0.3)', backgroundColor: 'rgba(167,139,250,0.05)'
            }}>
              🛡️ <strong style={{ color: 'var(--text-primary)' }}>Personnel accounts</strong> (Admin, Police, Medical, Volunteer)
              are created by System Administrators only. Contact your supervisor if you need a personnel account.
            </div>
          )}

          <button type="submit" className="btn btn-primary" id="auth-submit-btn"
            style={{ height: '3rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '0.95rem' }}
            disabled={loading}>
            {loading ? (
              <><Loader2 className="animate-spin" size={18} /><span>Authenticating...</span></>
            ) : (
              <><span>{isLogin ? 'Sign In' : 'Create Account'}</span><ArrowRight size={16} /></>
            )}
          </button>
        </form>

        <div className="text-center" style={{ marginTop: '1.5rem', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isLogin ? 'New devotee?' : 'Already have an account?'}
          </span>
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="auth-link">
            {isLogin ? 'Register here' : 'Sign in here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
