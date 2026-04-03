import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, ShieldCheck, Sparkles, ArrowRight, Loader2 } from 'lucide-react';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'user'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let user;
      if (isLogin) {
        user = await login(formData.email, formData.password);
      } else {
        user = await signup(formData);
      }
      
      if (user.role === 'admin' || user.role === 'police') {
        navigate('/admin');
      } else if (user.role === 'volunteer') {
        navigate('/volunteer');
      } else {
        navigate('/portal');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="glass-panel auth-card">
        <div className="text-center">
          <div className="auth-badge">
            <Sparkles size={12} style={{ marginRight: '4px', display: 'inline' }} />
            Nexus Crowd v1.0
          </div>
          <h2 className="text-gradient" style={{ fontSize: '2.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>
            {isLogin ? 'Welcome Back' : 'Join the Force'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>
            {isLogin ? 'Access the command center to monitor live safety.' : 'Register to help manage and secure the gathering.'}
          </p>
        </div>

        {error && (
          <div className="glass-panel" style={{ backgroundColor: 'rgba(208,0,0,0.1)', borderColor: 'rgba(208,0,0,0.3)', color: '#ff4d4d', padding: '1rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <div className="input-with-icon">
                <User className="input-icon" size={18} />
                <input type="text" name="name" className="input-control" value={formData.name} onChange={handleChange} required={!isLogin} placeholder="Ravi Kumar" />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Email Address</label>
            <div className="input-with-icon">
              <Mail className="input-icon" size={18} />
              <input type="email" name="email" className="input-control" value={formData.email} onChange={handleChange} required placeholder="you@example.com" />
            </div>
          </div>

          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Phone Number</label>
              <div className="input-with-icon">
                <Phone className="input-icon" size={18} />
                <input type="tel" name="phone" className="input-control" value={formData.phone} onChange={handleChange} required={!isLogin} placeholder="9876543210" />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="input-with-icon">
              <Lock className="input-icon" size={18} />
              <input type="password" name="password" className="input-control" value={formData.password} onChange={handleChange} required placeholder="••••••••" />
            </div>
          </div>

          {!isLogin && (
            <div className="input-group">
              <label className="input-label">Identity Role</label>
              <div className="input-with-icon">
                <ShieldCheck className="input-icon" size={18} />
                <select name="role" className="input-control" value={formData.role} onChange={handleChange}>
                  <option value="user">Devotee / Personal Account</option>
                  <option value="admin">System Administrator</option>
                  <option value="police">Police / Security Force</option>
                  <option value="medical">Medical Response Team</option>
                  <option value="volunteer">Volunteer Liaison</option>
                </select>
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ height: '3.5rem', marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '1rem' }} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="text-center" style={{ marginTop: '2rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isLogin ? "New to the platform?" : "Already part of the force?"}
          </span>
          <button type="button" onClick={() => setIsLogin(!isLogin)} className="auth-link">
            {isLogin ? 'Start your journey' : 'Sign in here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
