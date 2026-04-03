import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Calendar, Plus, MapPin, Clock, Minus, Users } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const ZONES = ['A', 'B', 'C'];

const SlotManager = () => {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { showToast } = useNotifications();

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '11:00',
    zone: 'ZONE_A',
    totalCapacity: 5000,
    specialSlot: false
  });

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const res = await api.get('/slots');
      setSlots(res.data.slots || []);
    } catch (err) {
      console.error("Error fetching slots", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const handleChange = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const adjustCapacity = (amount) => {
    setFormData(prev => ({
      ...prev,
      totalCapacity: Math.max(1, prev.totalCapacity + amount)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/slots', formData);
      showToast('Slot created successfully!', 'success');
      setShowForm(false);
      fetchSlots();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create slot', 'error');
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2><Calendar className="text-accent-primary" style={{ display: 'inline', marginRight: '0.75rem', marginBottom: '-4px' }} /> Slot Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={18} /> {showForm ? 'Cancel' : 'Create New Slot'}
        </button>
      </div>

      {showForm && (
        <div className="glass-panel" style={{ marginBottom: '2.5rem', border: '1px solid var(--accent-primary)', animation: 'slideUp 0.4s ease', maxWidth: '850px' }}>
          <h3 style={{ marginBottom: '1.25rem', fontSize: '1.25rem' }}>Define New Booking Slot</h3>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Phase 1: Logistics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-glass)' }}>
              <div className="input-group">
                <label className="input-label">Slot Date</label>
                <div className="input-with-icon">
                  <Calendar className="input-icon" size={18} />
                  <input type="date" name="date" className="input-control" value={formData.date} onChange={handleChange} required />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Operational Zone</label>
                <div className="custom-select-wrapper input-with-icon">
                  <MapPin className="input-icon" size={18} />
                  <select name="zone" className="input-control" value={formData.zone} onChange={handleChange}>
                    {ZONES.map(z => <option key={z} value={`ZONE_${z}`}>Zone {z}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Phase 2: Timing & Capacity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="input-group">
                  <label className="input-label">Arrival Window (Start)</label>
                  <div className="input-with-icon">
                    <Clock className="input-icon" size={18} />
                    <input type="time" name="startTime" className="input-control" value={formData.startTime} onChange={handleChange} required />
                  </div>
                </div>
                <div className="input-group">
                  <label className="input-label">Arrival Window (End)</label>
                  <div className="input-with-icon">
                    <Clock className="input-icon" size={18} />
                    <input type="time" name="endTime" className="input-control" value={formData.endTime} onChange={handleChange} required />
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Max Visitor Capacity</label>
                <div className="counter-group">
                  <button type="button" className="counter-btn" style={{ borderRight: '1px solid var(--border-glass)' }} onClick={() => adjustCapacity(-500)}><Minus size={16} /></button>
                  <input 
                    type="number" 
                    name="totalCapacity" 
                    className="counter-value" 
                    value={formData.totalCapacity} 
                    onChange={handleChange} 
                    required 
                    min="1" 
                  />
                  <button type="button" className="counter-btn" style={{ borderLeft: '1px solid var(--border-glass)' }} onClick={() => adjustCapacity(500)}><Plus size={16} /></button>
                </div>
              </div>
            </div>

            {/* Phase 3: Special Tiers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
              <input type="checkbox" name="specialSlot" id="specialSlot" style={{ width: '20px', height: '20px', cursor: 'pointer' }} checked={formData.specialSlot} onChange={handleChange} />
              <div style={{ flex: 1 }}>
                <label htmlFor="specialSlot" style={{ display: 'block', fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.875rem', cursor: 'pointer' }}>Mark as Premium/Special Slot</label>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Flag for VIP guest entry or specific personnel only.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '0.875rem' }}>Publish & Activate Slot</button>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? <p>Loading slots...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {slots.length === 0 ? (
            <div className="glass-panel text-center text-muted">No slots configured.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                    <th style={{ padding: '1rem' }}>Date</th>
                    <th style={{ padding: '1rem' }}>Time</th>
                    <th style={{ padding: '1rem' }}>Zone</th>
                    <th style={{ padding: '1rem' }}>Capacity</th>
                    <th style={{ padding: '1rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map(slot => {
                    const available = slot.totalCapacity - slot.bookedCount;
                    return (
                      <tr key={slot._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem' }}>{new Date(slot.dateStr).toLocaleDateString()}</td>
                        <td style={{ padding: '1rem' }}>{slot.startTime} - {slot.endTime}</td>
                        <td style={{ padding: '1rem' }}><MapPin size={14} style={{ display: 'inline' }} /> {slot.zone.replace('ZONE_', 'Zone ')}</td>
                        <td style={{ padding: '1rem' }}>
                          <span style={{ color: available === 0 ? '#ff4d4d' : 'inherit' }}>
                            {slot.bookedCount} / {slot.totalCapacity}
                          </span>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {slot.specialSlot && <span className="badge" style={{ background: '#3f37c9', marginRight: '0.5rem' }}>Special</span>}
                          <span className="badge" style={{ background: slot.isActive ? 'rgba(43, 147, 72, 0.2)' : 'rgba(255,255,255,0.1)', color: slot.isActive ? 'var(--status-success)' : 'var(--text-muted)' }}>
                            {slot.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SlotManager;
