import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useNotifications } from '../../context/NotificationContext';
import { ShieldAlert, Users, Volume2, History, X, Scan, Settings } from 'lucide-react';

const ZONES = ['A', 'B', 'C'];

const AdminDash = () => {
  const [crowdData, setCrowdData] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [voiceText, setVoiceText] = useState("Please remain calm and move slowly towards exit gate.");
  const [showHistory, setShowHistory] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [showCapacityModal, setShowCapacityModal] = useState(null);
  const [newCapacity, setNewCapacity] = useState(0);
  const [activeHeatmapZone, setActiveHeatmapZone] = useState('ALL');
  
  const { socket } = useSocket();
  const { showToast, showConfirm } = useNotifications();

  // Helper Components
  const DensityGauge = ({ count, capacity, risk }) => {
    const prct = Math.min((count / capacity) * 100, 100);
    const riskClass = `bg-${risk}`;
    return (
      <div className="density-gauge-container">
        <div 
          className={`density-gauge-fill ${riskClass}`} 
          style={{ width: `${prct}%` }}
        />
      </div>
    );
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const ZoneHeatCircle = ({ zonesData, activeZone }) => {
    return (
      <div className="heatmap-cloud">
        {ZONES.map(z => {
          if (activeZone !== 'ALL' && activeZone !== z) return null;
          
          const zoneId = `ZONE_${z}`;
          const data = zonesData.find(c => c.zone === zoneId) || { currentCount: 0, totalCapacity: 5000, riskLevel: 'low' };
          const density = data.currentCount / data.totalCapacity;
          
          // Standardized and Deepened Palette
          let color = 'rgba(20, 120, 40, 0.9)';   // Solid Monitoring Green ($$$)
          if (density > 0.45) color = 'rgba(180, 130, 0, 0.95)'; // Deep Amber
          if (density > 0.75) color = 'rgba(120, 0, 0, 0.95)';  // Heavy Crimson
          if (density > 0.95) color = 'rgba(60, 0, 0, 1)';      // Midnight Alert (Critical)

          const basePos = z === 'A' ? { t: 40, l: 35 } : z === 'B' ? { t: 55, l: 65 } : { t: 70, l: 45 };
          const size = 80; // COMPACT & CONSTANT size for all zones

          return (
            <div 
              key={z}
              className="zone-heat-circle"
              style={{ 
                top: `${basePos.t}%`, 
                left: `${basePos.l}%`,
                width: `${size}px`,
                height: `${size}px`,
                background: `radial-gradient(circle, ${color} 0%, transparent 90%)`,
                boxShadow: `0 0 15px ${color}`,
                opacity: 0.85, 
                mixBlendMode: 'normal'
              }}
            >
              <div className="zone-heat-core" style={{ background: color, width: '4px', height: '4px', opacity: 1 }} />
            </div>
          );
        })}
      </div>
    );
  };

  const fetchDashboardData = async () => {
    try {
      const [crowdRes, alertsRes] = await Promise.all([
        api.get('/crowd/status'),
        api.get('/alerts/active')
      ]);
      setCrowdData(crowdRes.data.zones || []);
      setActiveAlerts(alertsRes.data.alerts || []);
    } catch (err) {
      console.error("Error loading dashboard", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('crowd:update', (data) => {
      setCrowdData(prev => {
        const index = prev.findIndex(c => c.zone === data.zone);
        if (index > -1) {
          const newArr = [...prev];
          newArr[index] = { ...newArr[index], ...data };
          return newArr;
        }
        return [...prev, data];
      });
    });

    socket.on('alert:emergency', (alert) => {
      setActiveAlerts(prev => {
        if (prev.some(a => a._id === alert._id)) return prev;
        return [alert, ...prev];
      });
    });

    return () => {
      socket.off('crowd:update');
      socket.off('alert:emergency');
    };
  }, [socket]);

  const triggerStampedeAlert = async (zone) => {
    showConfirm(`Are you sure you want to trigger STAMPEDE protocol for Zone ${zone}?`, async () => {
      try {
        const res = await api.post('/alerts', {
          type: 'STAMPEDE_RISK',
          zone: zone,
          severity: '5',
          message: `Immediate crowd dispersal required at ${zone}.`,
          requiresEvacuation: true
        });
        
        showToast('Stampede Protocol Triggered!', 'success');
        
        if (res.data.alert?.voiceAlertUrl) {
          const audio = new Audio(res.data.alert.voiceAlertUrl);
          audio.play().catch(e => console.error("Local playback failed", e));
        }
      } catch (err) {
        showToast('Error triggering protocol: ' + (err.response?.data?.message || err.message), 'error');
      }
    });
  };

  const speakText = (text, lang = 'hi-IN') => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const emitVoiceAlert = async () => {
    try {
      await api.post('/voice/generate', {
        text: voiceText,
        language: "hi-IN"
      });
      speakText(voiceText, 'hi-IN');
      showToast('Global Voice Broadcast sent', 'success');
    } catch (err) {
      showToast('Failed to trigger voice alert', 'error');
    }
  };

  const fetchHistory = async (zone) => {
    try {
      const res = await api.get(`/crowd/history/${zone}?limit=20`);
      setHistoryData(res.data.history || []);
      setShowHistory(zone);
    } catch (err) {
      showToast("Failed to fetch history", "error");
    }
  };
  
  const handleUpdateCapacity = async (e) => {
    e.preventDefault();
    const zone = showCapacityModal;
    const currentData = crowdData.find(z => z.zone === zone);
    
    try {
      await api.post('/crowd/update', {
        zone: zone,
        currentCount: currentData.currentCount,
        totalCapacity: parseInt(newCapacity),
        source: 'admin'
      });
      showToast(`Capacity for Zone ${zone.split('_')[1]} updated to ${newCapacity}`, 'success');
      setShowCapacityModal(null);
      fetchDashboardData();
    } catch (err) {
      showToast('Failed to update capacity', 'error');
    }
  };



  if (loading) return <div className="p-4 text-center">Loading Command Center...</div>;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>Command Center</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Real-time satellite crowd analytics and live telemetry.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 1rem', background: 'rgba(43, 147, 72, 0.1)', borderRadius: '2rem', border: '1px solid rgba(43, 147, 72, 0.2)' }}>
          <div className="pulse-accent" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-success)' }}></div>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--status-success)', letterSpacing: '0.05em' }}>SATELLITE ACTIVE</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>
        {/* Left Column: Map & Density */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Map Visualization */}
          <div className="map-container">
            <div className="map-overlay-vignette"></div>
            
            {/* Heatmap Layer */}
            <ZoneHeatCircle zonesData={crowdData} activeZone={activeHeatmapZone} />

            {/* Zone Labels on Map */}
            {ZONES.map(z => {
               const pos = z === 'A' ? { t: '32%', l: '35%' } : z === 'B' ? { t: '48%', l: '65%' } : { t: '62%', l: '45%' };
               return (
                 <div 
                   key={z} 
                   className="zone-label-map" 
                   style={{ top: pos.t, left: pos.l, opacity: activeHeatmapZone === 'ALL' || activeHeatmapZone === z ? 1 : 0.2 }}
                  >
                   Sector {z} {z === 'A' ? '(Sangam)' : z === 'B' ? '(Triveni)' : '(Ghat)'}
                 </div>
               );
            })}
            
            <div style={{ position: 'absolute', bottom: '1.5rem', left: '1.5rem', zIndex: 10 }}>
              <div className="text-gradient" style={{ fontSize: '1rem', fontWeight: '800', letterSpacing: '0.1em' }}>LIVE SPATIAL FEED</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{activeHeatmapZone === 'ALL' ? 'Multizone Scanning' : `Targeting Sector ${activeHeatmapZone}`}</div>
            </div>

            <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', zIndex: 10, display: 'flex', gap: '0.5rem' }}>
              {['ALL', 'A', 'B', 'C'].map(z => (
                <button 
                  key={z} 
                  className={`btn-outline ${activeHeatmapZone === z ? 'active' : ''}`}
                  onClick={() => setActiveHeatmapZone(z)}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem', fontWeight: '700', borderRadius: '4px', background: activeHeatmapZone === z ? 'var(--accent-primary)' : 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {z === 'ALL' ? 'GLOBAL' : `ZONE ${z}`}
                </button>
              ))}
            </div>
          </div>

          <div className="dashboard-grid">
            {ZONES.map(zoneLetter => {
              const zoneKey = `ZONE_${zoneLetter}`;
              const data = crowdData.find(c => c.zone === zoneKey || c._id === zoneKey) || { currentCount: 0, totalCapacity: 5000, riskLevel: 'low' };
              const densityPrct = Math.min((data.currentCount / data.totalCapacity) * 100, 100).toFixed(1);
              const isCritical = data.riskLevel === 'critical' || data.riskLevel === 'high';

              return (
                <div key={zoneKey} className={`glass-panel ${isCritical ? 'pulse-critical' : ''}`} style={{ transition: 'all 0.5s ease', border: activeHeatmapZone === zoneLetter ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0, color: isCritical ? '#fff' : 'inherit' }}>Zone {zoneLetter}</h4>
                    <span className={`text-${data.riskLevel}`} style={{ fontWeight: '800', fontSize: '1rem' }}>{densityPrct}%</span>
                  </div>
                  
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CCTV Feed</div>
                      <select className="input-control" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', width: 'auto' }} defaultValue={`Zone_${zoneLetter}.mp4`}>
                        <option value="Zone_A.mp4">Camera A (Sangam)</option>
                        <option value="Zone_B.mp4">Camera B (Triveni)</option>
                        <option value="Zone_C.mp4">Camera C (Ghat)</option>
                      </select>
                    </div>

                    <div style={{ position: 'relative', width: '100%', height: '150px', background: '#000', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <video 
                        src={`http://localhost:5000/api/videos/Zone_${zoneLetter}.mp4`} 
                        autoPlay 
                        loop 
                        muted 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} 
                      />
                      <div style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        background: isCritical ? 'radial-gradient(circle, rgba(220,0,0,0.5) 0%, transparent 60%)' : 'radial-gradient(circle, rgba(0,200,0,0.15) 0%, transparent 70%)',
                        mixBlendMode: 'screen', pointerEvents: 'none'
                      }}></div>
                      <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div className="pulse-accent" style={{width: '6px', height: '6px', background: 'red', borderRadius: '50%'}}></div> REC
                      </div>
                      <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(67, 97, 238, 0.7)', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.65rem' }}>
                        <Scan size={10} style={{display: 'inline', marginRight: '4px'}}/> ML Tracking
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Density</div>
                      <button 
                        onClick={() => { setShowCapacityModal(zoneKey); setNewCapacity(data.totalCapacity); }} 
                        style={{ background: 'none', border: 'none', color: 'var(--text-accent)', cursor: 'pointer', padding: '0.25rem' }}
                      >
                        <Settings size={14} />
                      </button>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>{data.currentCount.toLocaleString()} <span style={{ fontSize: '0.875rem', fontWeight: '400', color: 'var(--text-muted)' }}>/ {data.totalCapacity.toLocaleString()}</span></div>
                    <DensityGauge count={data.currentCount} capacity={data.totalCapacity} risk={data.riskLevel} />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => triggerStampedeAlert(zoneKey)} className="btn btn-outline" style={{ border: 'none', background: 'rgba(208, 0, 0, 0.1)', color: 'var(--status-critical)', padding: '0.5rem', flex: 1 }} title="Trigger Protocol">
                      <ShieldAlert size={16} />
                    </button>
                    <button onClick={() => fetchHistory(zoneKey)} className="btn btn-outline" style={{ padding: '0.5rem', flex: 1 }} title="History">
                      <History size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Voice & Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Voice Alert Card */}
          <div className="glass-panel pulse-accent" style={{ border: '1px solid var(--accent-primary)', background: 'linear-gradient(135deg, rgba(67, 97, 238, 0.1), transparent)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Volume2 className="text-accent-primary" /> Audio Broadcast
            </h3>
            <textarea 
              className="input-control" 
              style={{ width: '100%', minHeight: '100px', marginBottom: '1rem', resize: 'none', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }} 
              value={voiceText} 
              onChange={(e) => setVoiceText(e.target.value)}
            />
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={emitVoiceAlert}>Send Broadcast</button>
          </div>

          {/* Emergency Feed */}
          <div className="glass-panel" style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ShieldAlert className={activeAlerts.length > 0 ? 'text-status-critical' : 'text-status-success'} /> 
              {activeAlerts.length > 0 ? 'Emergency Feed' : 'No Critical Alerts'}
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1 }}>
              {activeAlerts.map(alert => (
                <div key={alert._id} className="fade-in" style={{ padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(208, 0, 0, 0.1)', borderLeft: '3px solid var(--status-critical)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '700' }}>{alert.zone}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{formatTime(alert.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>{alert.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '700px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
               <h3 style={{ margin: 0 }}>Zone {showHistory.split('_')[1]} Telemetry</h3>
               <button onClick={() => setShowHistory(null)} className="btn-outline" style={{ padding: '0.4rem', borderRadius: '50%' }}><X size={20} /></button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem' }}>TIME</th>
                    <th style={{ padding: '0.75rem' }}>COUNT</th>
                    <th style={{ padding: '0.75rem' }}>DENSITY</th>
                    <th style={{ padding: '0.75rem' }}>RISK</th>
                    <th style={{ padding: '0.75rem' }}>SOURCE</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem' }}>{new Date(h.timestamp?._seconds ? h.timestamp._seconds * 1000 : h.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: '0.75rem' }}>{h.currentCount}</td>
                      <td style={{ padding: '0.75rem' }}>{h.density}%</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge bg-${h.riskLevel}`} style={{ fontSize: '0.65rem' }}>{h.riskLevel}</span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* Capacity Modal */}
      {showCapacityModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginBottom: '1rem' }}>Adjust Zone {showCapacityModal.split('_')[1]} Capacity</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Setting a lower capacity will trigger high-risk alerts at lower headcounts.
            </p>
            <form onSubmit={handleUpdateCapacity} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="input-group">
                <label className="input-label">Total Maximum Capacity</label>
                <input 
                  type="number" 
                  className="input-control" 
                  value={newCapacity} 
                  onChange={e => setNewCapacity(e.target.value)} 
                  required 
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">Save Capacity</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowCapacityModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDash;
