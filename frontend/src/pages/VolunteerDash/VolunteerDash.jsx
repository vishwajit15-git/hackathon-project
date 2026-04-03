import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { MapPin, ShieldAlert, CheckCircle } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const VolunteerDash = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('available');
  const [zone, setZone] = useState('ZONE_A');
  const [loading, setLoading] = useState(false);
  const { showToast } = useNotifications();

  const updateStatus = async (newStatus) => {
    try {
      setLoading(true);
      await api.patch('/volunteer/status', { status: newStatus, zone });
      setStatus(newStatus);
      showToast(`Status updated to ${newStatus.replace('_', ' ')}`, 'success');
    } catch (err) {
      showToast("Failed to update status", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await api.get('/volunteer/tasks');
      setTasks(res.data.data || []);
    } catch (err) {
      setTasks([]);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    if (!socket) return;
    
    socket.on('volunteer:task', (task) => {
      setTasks(prev => [task, ...prev]);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    });

    return () => socket.off('volunteer:task');
  }, [socket]);

  const handleCompleteTask = async () => {
    try {
      setLoading(true);
      await api.patch('/volunteer/complete-task');
      showToast('Task marked as completed!', 'success');
      fetchTasks();
    } catch (err) {
      showToast('Failed to complete task', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '2rem' }}>Field Force Dashboard</h2>

      {/* Status Card */}
      <div className="glass-panel" style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>My Duty Status</h3>
        
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <button 
            onClick={() => updateStatus('available')}
            className={`btn ${status === 'available' ? 'btn-primary' : 'btn-outline'}`}
            disabled={loading}
          >
            Available
          </button>
          <button 
            onClick={() => updateStatus('busy')}
            className={`btn ${status === 'busy' ? '' : 'btn-outline'}`}
            style={status === 'busy' ? { backgroundColor: 'var(--status-warning)', color: '#000' } : {}}
            disabled={loading}
          >
            Engaged
          </button>
          <button 
            onClick={() => updateStatus('off_duty')}
            className={`btn ${status === 'off_duty' ? 'btn-outline' : 'btn-outline'}`}
            style={status === 'off_duty' ? { backgroundColor: 'transparent', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' } : {}}
            disabled={loading}
          >
            Off Duty
          </button>
        </div>

        <div className="input-group" style={{ textAlign: 'left', maxWidth: '300px', margin: '0 auto' }}>
          <label className="input-label">Current Zone</label>
          <select 
            className="input-control" 
            value={zone} 
            onChange={(e) => {
              const newZone = e.target.value;
              setZone(newZone);
              api.patch('/volunteer/location', { zone: newZone });
            }}
          >
            {['A', 'B', 'C'].map(z => 
               <option key={z} value={`ZONE_${z}`}>Zone {z}</option>
            )}
          </select>
        </div>
      </div>

      <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ShieldAlert /> Live Tasks & Directives
      </h3>

      {tasks.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
          You have no active directives. Stay alert.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tasks.map((task, idx) => (
            <div key={idx} className="glass-panel" style={{ borderLeft: `4px solid ${task.type === 'emergency' ? 'var(--status-critical)' : 'var(--accent-primary)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{task.type || 'Direct Assign'}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active</span>
              </div>
              <p style={{ marginBottom: '1rem' }}>{task.message}</p>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  <MapPin size={14} style={{ display: 'inline', marginRight: '4px' }} />
                  {task.zone || zone}
                </div>
                <button 
                  className="btn btn-outline" 
                  disabled={loading}
                  onClick={handleCompleteTask}
                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: 'var(--status-success)', borderColor: 'var(--status-success)' }}
                >
                  <CheckCircle size={14} /> Resolve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VolunteerDash;
