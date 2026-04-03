import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Activity, Radio, CheckCircle } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const ZONES = ['A', 'B', 'C'];

const AlertManager = () => {
  const [history, setHistory] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { showToast, showConfirm } = useNotifications();

  // Form State
  const [formData, setFormData] = useState({
    type: 'MEDICAL_EMERGENCY',
    zone: 'ZONE_A',
    severity: '3',
    message: '',
    messageHindi: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [histRes, activeRes] = await Promise.all([
        api.get('/alerts/history?limit=50'),
        api.get('/alerts/active')
      ]);
      setHistory(histRes.data.alerts || []);
      setActiveAlerts(activeRes.data.alerts || []);
    } catch (err) {
      console.error("Error fetching alerts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!formData.messageHindi && formData.message) {
         // Optionally you could auto-translate here, but the backend calls TTS, backend doesn't translate if messageHindi is missing but wait, backend TTS does translation?
         // Actual backend TTS expects messageHindi. We'll just pass messageHindi as the english text as well.
      }
      const res = await api.post('/alerts', {
        ...formData,
        messageHindi: formData.messageHindi || formData.message
      });
      
      // Local playback for immediate feedback
      if (res.data.alert?.voiceAlertUrl) {
        const audio = new Audio(res.data.alert.voiceAlertUrl);
        audio.play().catch(e => console.error("Local playback failed", e));
      }
      showToast('Alert created and broadcasted!', 'success');
      setShowForm(false);
      fetchData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create alert', 'error');
    }
  };

  const handleResolve = async (id) => {
    showConfirm('Mark this alert as resolved?', async () => {
      try {
        await api.post(`/alerts/${id}/resolve`, { resolutionNotes: 'Resolved by Admin' });
        showToast('Alert resolved', 'success');
        fetchData();
      } catch (err) {
        showToast('Failed to resolve alert', 'error');
      }
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2><Activity style={{ display: 'inline', marginRight: '0.5rem', marginBottom: '-4px' }} /> Alerts Manager</h2>
        <button className="btn btn-danger" onClick={() => setShowForm(!showForm)}>
          <Radio size={18} /> Trigger New Alert
        </button>
      </div>

      {showForm && (
        <div className="glass-panel" style={{ marginBottom: '2rem', border: '1px solid #ff4d4d' }}>
          <h3 style={{ marginBottom: '1rem', color: '#ff4d4d' }}>Trigger Custom Emergency Alert</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="input-group" style={{ flex: 1 }}>
                <label className="input-label">Alert Type</label>
                <select name="type" className="input-control" value={formData.type} onChange={handleChange}>
                  <option value="MEDICAL_EMERGENCY">Medical Emergency</option>
                  <option value="LOST_CHILD">Lost Child Alert</option>
                  <option value="FIRE_HAZARD">Fire Hazard</option>
                  <option value="CROWD_CRUSH_WARNING">Crowd Crush Warning</option>
                  <option value="GENERAL_INFO">General Information</option>
                </select>
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label className="input-label">Zone</label>
                <select name="zone" className="input-control" value={formData.zone} onChange={handleChange}>
                  <option value="GLOBAL">ALL ZONES (Global)</option>
                  {ZONES.map(z => <option key={z} value={`ZONE_${z}`}>Zone {z}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ flex: 1 }}>
                <label className="input-label">Severity (1-5)</label>
                <input type="number" name="severity" className="input-control" min="1" max="5" value={formData.severity} onChange={handleChange} required />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Broadcast Message (English)</label>
              <textarea name="message" className="input-control" rows="2" value={formData.message} onChange={handleChange} placeholder="Please clear the pathway for medical teams..." required />
            </div>

             <div className="input-group">
              <label className="input-label">Broadcast Message (Hindi TTS Text)</label>
              <textarea name="messageHindi" className="input-control" rows="2" value={formData.messageHindi} onChange={handleChange} placeholder="कृपया चिकित्सा टीमों के लिए रास्ता साफ करें..." />
            </div>

            <button type="submit" className="btn btn-danger" style={{ alignSelf: 'flex-start' }}>Broadcast & Trigger Alarm</button>
          </form>
        </div>
      )}

      {/* Active Alerts */}
      <h3 style={{ marginBottom: '1rem', color: '#ff4d4d' }}>Active Emergencies</h3>
      {activeAlerts.length === 0 ? (
        <div className="glass-panel text-center" style={{ marginBottom: '2rem', color: 'var(--text-muted)' }}>No active alerts. The crowd is safe.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {activeAlerts.map(alert => (
             <div key={alert._id} className="glass-panel" style={{ borderLeft: '4px solid #ff4d4d' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                 <strong>{alert.zone}</strong>
                 <span className="badge badge-critical">Severity {alert.severity}</span>
               </div>
               <div style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>{alert.type}</div>
               <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{alert.message}</p>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>By {alert.triggeredBy?.name || 'System'}</span>
                 <button onClick={() => handleResolve(alert._id)} className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: 'var(--status-success)', borderColor: 'var(--status-success)' }}>
                   <CheckCircle size={14} /> Resolve
                 </button>
               </div>
             </div>
          ))}
        </div>
      )}

      {/* History */}
      <h3 style={{ marginBottom: '1rem' }}>Alert History Log</h3>
      {loading ? <p>Loading...</p> : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ padding: '1rem' }}>Time</th>
                <th style={{ padding: '1rem' }}>Zone</th>
                <th style={{ padding: '1rem' }}>Type</th>
                <th style={{ padding: '1rem' }}>Severity</th>
                <th style={{ padding: '1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem' }}>{new Date(item.createdAt?._seconds ? item.createdAt._seconds * 1000 : item.createdAt).toLocaleString()}</td>
                  <td style={{ padding: '1rem' }}>{item.zone || 'GLOBAL'}</td>
                  <td style={{ padding: '1rem' }}>{item.type}</td>
                  <td style={{ padding: '1rem' }}>{item.severity}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ color: item.isActive ? '#ff4d4d' : 'var(--status-success)' }}>
                      {item.isActive ? 'Active' : 'Resolved'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AlertManager;
