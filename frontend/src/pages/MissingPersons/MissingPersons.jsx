import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Search, UserPlus, Activity, CheckSquare, Scan, Upload } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const MissingPersons = () => {
  const { user } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReportForm, setShowReportForm] = useState(false);
  const { showToast } = useNotifications();

  // Form
  const [formData, setFormData] = useState({
    name: '', age: '', gender: 'male', description: '', lastSeenZone: 'ZONE_A', photoUrl: ''
  });

  const fetchCases = async () => {
    try {
      setLoading(true);
      const url = (user.role === 'admin' || user.role === 'police') ? '/missing/all' : '/missing';
      const res = await api.get(url);
      setCases(res.data.cases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [user.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/missing/report', formData);
      showToast('Report submitted successfully.', 'success');
      setShowReportForm(false);
      setFormData({ name: '', age: '', gender: 'male', description: '', lastSeenZone: 'ZONE_A', photoUrl: '' });
      fetchCases();
    } catch (err) {
      showToast('Failed to submit report', 'error');
    }
  };

  const handleMLSearch = async (caseId) => {
    try {
      showToast("Triggering ML Face-Match Search across all CCTV feeds...", "info");
      const res = await api.post('/missing/search', { caseId });
      if (res.data.status === 'found') {
        showToast(`Match Found! Person located in ${res.data.mlResult.zone} with ${Math.round(res.data.mlResult.confidence * 100)}% confidence.`, "success");
      } else {
        showToast("ML Search active. No immediate match found in current frames.", "info");
      }
      fetchCases();
    } catch (err) {
      showToast("ML Search Service Error", "error");
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.patch(`/missing/${id}/status`, { status });
      showToast(`Status updated to ${status}`, "success");
      fetchCases();
    } catch (err) {
      showToast("Failed to update status", "error");
    }
  };

  const canManage = ['admin', 'police', 'volunteer'].includes(user.role);
  const canTriggerML = ['admin', 'police'].includes(user.role);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Missing Persons Board</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowReportForm(!showReportForm)}
        >
          <UserPlus size={18} /> Report Missing
        </button>
      </div>

      {showReportForm && (
        <div className="glass-panel" style={{ marginBottom: '2rem', border: '1px solid var(--accent-primary)' }}>
          <h3 style={{ marginBottom: '1rem' }}>Submit Report</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <input 
                className="input-control" placeholder="Name" required style={{ flex: 1 }}
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} 
              />
              <input 
                className="input-control" type="number" placeholder="Age" required style={{ width: '100px' }}
                value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} 
              />
              <select 
                className="input-control" 
                value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <textarea 
              className="input-control" placeholder="Description (clothing, distinct features)" required rows="3"
              value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} 
            />

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <select 
                className="input-control" style={{ flex: 1 }}
                value={formData.lastSeenZone} onChange={e => setFormData({...formData, lastSeenZone: e.target.value})}
              >
                {['A', 'B', 'C'].map(z => 
                  <option key={z} value={`ZONE_${z}`}>Last seen in Zone {z}</option>
                )}
              </select>
              <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <label 
                  className="input-control" 
                  style={{ 
                    flex: 1, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.5rem', 
                    cursor: 'pointer',
                    background: 'var(--bg-secondary)',
                    border: '1px dashed var(--accent-primary)',
                    color: 'var(--text-secondary)',
                    padding: '0.5rem',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-glass)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  <Upload size={16} />
                  <span style={{ fontSize: '0.875rem' }}>{formData.photoUrl ? 'Change Photo' : 'Upload Photo'}</span>
                  <input 
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const MAX_WIDTH = 800;
                            const MAX_HEIGHT = 800;
                            let width = img.width;
                            let height = img.height;

                            if (width > height) {
                              if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                              }
                            } else {
                              if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                              }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                            setFormData({ ...formData, photoUrl: dataUrl });
                          };
                          img.src = event.target.result;
                        };
                        reader.readAsDataURL(file);
                      } else {
                        setFormData({...formData, photoUrl: ''});
                      }
                    }} 
                  />
                </label>
                {formData.photoUrl && <div style={{width: '42px', height: '42px', borderRadius: '6px', background: `url(${formData.photoUrl}) center/cover`, border: '1px solid var(--accent-primary)', flexShrink: 0}}></div>}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Submit Report</button>
          </form>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {cases.map(c => (
            <div key={c._id} className="glass-panel" style={{ padding: 0, overflow: 'hidden', border: c.status === 'found' ? '1px solid var(--status-success)' : '1px solid var(--border-glass)' }}>
              {c.photoUrl ? (
                <div style={{ height: '200px', background: `url(${c.photoUrl}) center/cover` }}></div>
              ) : (
                <div style={{ height: '120px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Search color="var(--text-muted)" size={40} />
                </div>
              )}
              <div style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0 }}>{c.name}</h3>
                  <span className={`badge ${c.status === 'reported' || c.status === 'searching' ? 'badge-critical' : ''}`} style={{ background: c.status === 'found' ? 'rgba(43, 147, 72, 0.2)' : 'rgba(255, 183, 3, 0.2)', color: c.status === 'found' ? 'var(--status-success)' : 'var(--status-warning)' }}>
                    {c.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Age {c.age} &bull; {c.gender} &bull; Last seen: {c.lastSeenZone}
                </div>
                <p style={{ fontSize: '0.875rem', marginTop: '1rem', color: 'var(--text-primary)', height: '3.6em', overflow: 'hidden' }}>
                  {c.description}
                </p>
                
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', marginBottom: '1.5rem' }}>
                  Reported by: {c.reporter?.name || 'User'} on {new Date(c.createdAt?._seconds ? c.createdAt._seconds * 1000 : c.createdAt).toLocaleDateString()}
                </div>

                {canManage && c.status !== 'resolved' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
                    {canTriggerML && c.status !== 'found' && (
                      <button 
                        className="btn btn-outline" 
                        style={{ width: '100%', fontSize: '0.75rem', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                        onClick={() => handleMLSearch(c.caseId)}
                      >
                        <Scan size={14} /> AI Face Match
                      </button>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <select 
                        className="input-control" 
                        style={{ flex: 1, padding: '0.25rem', fontSize: '0.75rem' }}
                        value={c.status}
                        onChange={(e) => handleStatusUpdate(c._id, e.target.value)}
                      >
                        <option value="reported">Reported</option>
                        <option value="searching">Searching</option>
                        <option value="found">Found</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {cases.length === 0 && <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center' }}>No active missing person cases.</p>}
        </div>
      )}
    </div>
  );
};

export default MissingPersons;
