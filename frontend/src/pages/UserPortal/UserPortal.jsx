import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Calendar, Ticket, MapPin } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const UserPortal = () => {
  const [slots, setSlots] = useState([]);
  const [myBookings, setMyBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [zone, setZone] = useState('ZONE_A');
  const [bookingLoading, setBookingLoading] = useState(false);
  const { showToast, showConfirm } = useNotifications();

  const fetchSlotsAndBookings = async () => {
    try {
      setLoading(true);
      const [slotsRes, bookingsRes] = await Promise.all([
        api.get(`/slots?date=${date}&zone=${zone}`),
        api.get('/slots/my-bookings')
      ]);
      setSlots(slotsRes.data.slots || []);
      setMyBookings(bookingsRes.data.bookings || []);
    } catch (err) {
      console.error("Error fetching data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlotsAndBookings();
  }, [date, zone]);

  const handleBook = async (slotId) => {
    try {
      setBookingLoading(true);
      await api.post('/slots/book', {
        slotId,
        groupSize: 1,
        isFamily: false,
        isSpecialNeeds: false
      });
      showToast('Slot booked successfully!', 'success');
      fetchSlotsAndBookings();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to book slot', 'error');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancel = async (bookingId) => {
    showConfirm('Are you sure you want to cancel this booking?', async () => {
      try {
        await api.delete(`/slots/cancel/${bookingId}`);
        showToast('Booking cancelled', 'success');
        fetchSlotsAndBookings();
      } catch (err) {
        showToast(err.response?.data?.message || 'Failed to cancel', 'error');
      }
    });
  };

  if (loading && slots.length === 0) return <div className="p-4">Loading Portal...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: '2rem' }}>My Portal</h2>

      {/* My Bookings Section */}
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Ticket /> My Bookings
      </h3>
      
      {myBookings.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          You have no active bookings.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
          {myBookings.map(bk => (
            <div key={bk._id} className="glass-panel" style={{ borderTop: '4px solid var(--accent-primary)', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0 }}>{bk.slot.zone.replace('ZONE_', 'Zone ')}</h4>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {new Date(bk.slot.date).toLocaleDateString()} | {bk.slot.startTime} - {bk.slot.endTime}
                  </div>
                </div>
                <div style={{ background: '#fff', padding: '4px', borderRadius: '4px' }}>
                  <img src={bk.qrCodeUrl} alt="QR Code" style={{ width: '60px', height: '60px' }} />
                </div>
              </div>
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
                <span className="badge" style={{ background: 'rgba(43, 147, 72, 0.2)', color: 'var(--status-success)' }}>{bk.status}</span>
                <button 
                  onClick={() => handleCancel(bk._id)}
                  style={{ float: 'right', background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slot Search Section */}
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Calendar /> Book a Slot
      </h3>

      <div className="glass-panel" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="input-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Date</label>
          <input 
            type="date" 
            className="input-control" 
            style={{ width: '100%' }}
            value={date} 
            onChange={e => setDate(e.target.value)} 
          />
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="input-label" style={{ display: 'block', marginBottom: '0.5rem' }}>Zone</label>
          <select 
            className="input-control"
            style={{ width: '100%' }}
            value={zone}
            onChange={e => setZone(e.target.value)}
          >
             {['A', 'B', 'C'].map(z => 
               <option key={z} value={`ZONE_${z}`}>Zone {z}</option>
             )}
          </select>
        </div>
      </div>

      {/* Available Slots */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
        {slots.length === 0 ? (
           <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
             No slots available for this date and zone.
           </div>
        ) : (
          slots.map(slot => {
            const available = slot.totalCapacity - slot.currentBooked;
            const isFull = available <= 0;
            return (
              <div key={slot._id} className="glass-panel">
                <h4>{slot.startTime} - {slot.endTime}</h4>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  <MapPin size={14} style={{ display: 'inline', marginRight: '4px' }} />
                  {slot.zone.replace('ZONE_', 'Zone ')}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', color: isFull ? '#ff4d4d' : 'var(--status-success)', fontWeight: '600' }}>
                    {isFull ? 'Fully Booked' : `${available} Left`}
                  </span>
                  
                  <button 
                    className={`btn ${isFull ? 'btn-outline' : 'btn-primary'}`}
                    disabled={isFull || bookingLoading}
                    onClick={() => handleBook(slot._id)}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    {isFull ? 'Closed' : 'Book'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default UserPortal;
