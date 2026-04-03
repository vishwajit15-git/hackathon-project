import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { UserPlus, Shield, Users, MapPin, Activity } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const ZONES = ['A', 'B', 'C'];

const StaffManager = () => {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const { showToast } = useNotifications();

  // Add Staff State
  const [staffData, setStaffData] = useState({
    name: '',
    email: '',
    password: 'Password123', // Default for staff creation
    phone: '',
    role: 'police'
  });

  const fetchVolunteers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/volunteer/all?limit=50');
      setVolunteers(res.data.volunteers || []);
    } catch (err) {
      console.error("Error fetching volunteers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolunteers();
  }, []);

  const handleStaffChange = (e) => {
    setStaffData({ ...staffData, [e.target.name]: e.target.value });
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/admin/create-user', staffData);
      showToast('Staff user created successfully!', 'success');
      setShowAddStaff(false);
      setStaffData({ name: '', email: '', password: 'Password123', phone: '', role: 'police' });
      fetchVolunteers(); // Refresh list to show newly activated staff
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create staff user', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2><Shield style={{ display: 'inline', marginRight: '0.5rem', marginBottom: '-4px' }} /> Staff & Personnel</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => setShowAddStaff(!showAddStaff)}>
            <UserPlus size={18} /> Create Staff
          </button>
        </div>
      </div>

      {showAddStaff && (
        <div className="glass-panel" style={{ marginBottom: '2rem', border: '1px solid var(--accent-primary)' }}>
          <h3 style={{ marginBottom: '1rem' }}>Onboard New Personnel</h3>
          <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <input className="input-control" name="name" placeholder="Full Name" value={staffData.name} onChange={handleStaffChange} required style={{ flex: 1 }} />
              <input className="input-control" name="email" type="email" placeholder="Email" value={staffData.email} onChange={handleStaffChange} required style={{ flex: 1 }} />
              <input className="input-control" name="password" type="text" placeholder="Password" value={staffData.password} onChange={handleStaffChange} required style={{ flex: 1 }} title="Password for the user account" />
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <input className="input-control" name="phone" placeholder="Phone Number" value={staffData.phone} onChange={handleStaffChange} required style={{ flex: 1 }} />
              <select name="role" className="input-control" value={staffData.role} onChange={handleStaffChange} style={{ flex: 1 }}>
                <option value="police">Police Officer</option>
                <option value="medical">Medical Staff</option>
                <option value="volunteer">Volunteer (Staff Level)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Create Account</button>
          </form>
        </div>
      )}

      <h3 style={{ marginBottom: '1rem' }}><Users style={{ display: 'inline', marginRight: '0.5rem', marginBottom: '-4px' }} /> Active Field Force</h3>
      
      {loading ? <p>Loading personnel...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {volunteers.length === 0 ? (
            <div className="glass-panel text-center text-muted" style={{ gridColumn: '1/-1' }}>No active volunteers registered.</div>
          ) : (
            volunteers.map(v => (
              <div key={v._id} className="glass-panel" style={{ borderTop: `4px solid ${v.status === 'available' ? 'var(--status-success)' : 'var(--status-warning)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{v.user?.name || 'UID: ' + v.uid.substring(0, 8) + '...'}</h4>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.user?.email || 'System Account'}</div>
                  </div>
                  <span className="badge" style={{ 
                    background: v.status === 'available' ? 'rgba(43, 147, 72, 0.2)' : 'rgba(255, 183, 3, 0.2)', 
                    color: v.status === 'available' ? 'var(--status-success)' : 'var(--status-warning)' 
                  }}>
                    {v.status.replace('_', ' ')}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPin size={16} color="var(--text-muted)" />
                    <span>{v.zone ? v.zone.replace('ZONE_', 'Zone ') : 'Unassigned'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={16} color="var(--text-muted)" />
                    <span>Tasks Completed: {v.tasksCompleted || 0}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default StaffManager;
