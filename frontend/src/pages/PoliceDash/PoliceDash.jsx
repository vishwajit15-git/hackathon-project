import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  ShieldAlert, BadgeCheck, HeartPulse, MapPin, Users,
  AlertTriangle, CheckCircle2, RefreshCw, Clock, Search,
  Radio, UserX, Eye
} from 'lucide-react';

// ─── Role badge config ───────────────────────────────────────────
const ROLE_CONFIG = {
  police:  { label: 'Police / Security', color: '#60a5fa', icon: BadgeCheck  },
  medical: { label: 'Medical / NDRF',    color: '#34d399', icon: HeartPulse  },
};

const SEVERITY_COLORS = {
  critical: 'var(--status-critical)',
  high:     '#fb923c',
  medium:   'var(--status-warning)',
  low:      'var(--status-success)',
};

// ─── Stat Card ───────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
    }}>
      <Icon size={22} color={color} />
    </div>
    <div>
      <div style={{ fontSize: '1.75rem', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  </div>
);

// ─── Alert Card ──────────────────────────────────────────────────
const AlertCard = ({ alert, onResolve, canResolve }) => {
  const color = SEVERITY_COLORS[alert.severity] || 'var(--text-muted)';
  return (
    <div className="glass-panel" style={{ borderLeft: `4px solid ${color}`, marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge" style={{ background: `${color}22`, color }}>
            {alert.severity?.toUpperCase()}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Zone {alert.zone}
          </span>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <Clock size={11} style={{ display: 'inline', marginRight: '3px' }} />
          {new Date(alert.createdAt?._seconds ? alert.createdAt._seconds * 1000 : alert.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <p style={{ margin: 0, marginBottom: '0.75rem', fontSize: '0.9rem' }}>{alert.message}</p>
      {canResolve && alert.status !== 'resolved' && (
        <button
          className="btn btn-outline"
          onClick={() => onResolve(alert._id || alert.id)}
          style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', color: 'var(--status-success)', borderColor: 'var(--status-success)' }}
        >
          <CheckCircle2 size={13} style={{ display: 'inline', marginRight: '4px' }} />
          Mark Resolved
        </button>
      )}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────
const PoliceDash = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { showToast } = useNotifications();

  const roleConf = ROLE_CONFIG[user?.role] || ROLE_CONFIG.police;
  const RoleIcon = roleConf.icon;
  const canResolve = user?.role === 'police' || user?.role === 'admin';

  const [alerts, setAlerts] = useState([]);
  const [missing, setMissing] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [crowdStatus, setCrowdStatus] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('alerts');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, missingRes, volRes, crowdRes] = await Promise.allSettled([
        api.get('/alerts/active'),
        api.get('/missing/all'),
        api.get('/volunteer/all'),
        api.get('/crowd/status'),
      ]);

      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data.alerts || []);
      if (missingRes.status === 'fulfilled') setMissing(missingRes.value.data.cases || []);
      if (volRes.status === 'fulfilled')     setVolunteers(volRes.value.data.volunteers || []);
      if (crowdRes.status === 'fulfilled')   setCrowdStatus(crowdRes.value.data.zones || []);
    } catch (err) {
      showToast('Failed to load some data', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!socket) return;
    socket.on('alert:new', (a) => {
      setAlerts(prev => [a, ...prev]);
      showToast(`🚨 New ${a.severity} alert in Zone ${a.zone}`, 'error');
    });
    socket.on('crowd:update', (data) => {
      setCrowdStatus(prev => prev.map(z => z.zone === data.zone ? { ...z, ...data } : z));
    });
    return () => { socket.off('alert:new'); socket.off('crowd:update'); };
  }, [socket]);

  const handleResolve = async (alertId) => {
    try {
      await api.post(`/alerts/${alertId}/resolve`);
      setAlerts(prev => prev.map(a => (a._id === alertId || a.id === alertId) ? { ...a, status: 'resolved' } : a));
      showToast('Alert resolved', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to resolve alert', 'error');
    }
  };

  const filteredMissing = missing.filter(c =>
    !searchQuery || c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
  const activeVols = volunteers.filter(v => v.status === 'available');

  const tabs = [
    { id: 'alerts',     label: 'Active Alerts',     count: criticalAlerts.length, color: 'var(--status-critical)' },
    { id: 'missing',    label: 'Missing Persons',   count: filteredMissing.length, color: '#fbbf24' },
    { id: 'volunteers', label: 'Field Personnel',   count: activeVols.length,     color: '#34d399' },
    { id: 'crowd',      label: 'Crowd Status',      count: null,                  color: '#60a5fa' },
  ];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: `${roleConf.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <RoleIcon size={26} color={roleConf.color} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Force Command Dashboard</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px' }}>
              <span className="badge" style={{ background: `${roleConf.color}22`, color: roleConf.color, fontSize: '0.75rem' }}>
                {roleConf.label}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.name}</span>
            </div>
          </div>
        </div>
        <button className="btn btn-outline" onClick={fetchAll} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stat Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard icon={AlertTriangle} label="Critical Alerts"    value={criticalAlerts.length}   color="var(--status-critical)" sub="Unresolved" />
        <StatCard icon={UserX}         label="Missing Persons"    value={missing.length}            color="#fbbf24" sub="Open cases" />
        <StatCard icon={Users}         label="Personnel Available" value={activeVols.length}        color="#34d399" sub={`of ${volunteers.length} total`} />
        <StatCard icon={Radio}         label="Total Alerts Today" value={alerts.length}             color="#60a5fa" sub="All severities" />
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
            style={{
              padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
              ...(activeTab === tab.id ? {} : { borderColor: 'var(--border-glass)' })
            }}>
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span style={{
                background: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : `${tab.color}33`,
                color: activeTab === tab.id ? 'white' : tab.color,
                padding: '1px 7px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Alerts Tab ──────────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div>
          {alerts.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <ShieldAlert size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p>No active alerts. Area is secure.</p>
            </div>
          ) : (
            alerts.map((alert, i) => (
              <AlertCard key={alert._id || i} alert={alert} onResolve={handleResolve} canResolve={canResolve} />
            ))
          )}
        </div>
      )}

      {/* ── Missing Persons Tab ─────────────────────────── */}
      {activeTab === 'missing' && (
        <div>
          <div className="input-with-icon" style={{ marginBottom: '1.25rem' }}>
            <Search className="input-icon" size={18} />
            <input
              className="input-control"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          {filteredMissing.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <UserX size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p>No missing person reports found.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {filteredMissing.map((c, i) => (
                <div key={c._id || i} className="glass-panel" style={{ borderTop: `3px solid #fbbf24` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '1rem' }}>{c.name || 'Unknown'}</strong>
                    <span className="badge" style={{ background: c.status === 'found' ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)', color: c.status === 'found' ? '#34d399' : '#fbbf24', fontSize: '0.7rem' }}>
                      {c.status?.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{c.description}</p>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} />
                    {c.lastSeenZone || c.lastSeen || 'Location unknown'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Field Personnel Tab ─────────────────────────── */}
      {activeTab === 'volunteers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {volunteers.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', gridColumn: '1/-1' }}>
              <Users size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p>No field personnel registered.</p>
            </div>
          ) : volunteers.map((vol, i) => {
            const statusColor = vol.status === 'available' ? '#34d399' : vol.status === 'busy' ? '#fb923c' : 'var(--text-muted)';
            return (
              <div key={vol._id || i} className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>{vol.user?.name || vol.name || 'Personnel'}</strong>
                  <span className="badge" style={{ background: `${statusColor}22`, color: statusColor, fontSize: '0.7rem' }}>
                    {vol.status?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  <Eye size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Role: {vol.role || 'volunteer'}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} />
                  {vol.zone || 'Zone unknown'} — {vol.currentTask !== 'none' ? vol.currentTask : 'Idle'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Crowd Status Tab ────────────────────────────── */}
      {activeTab === 'crowd' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {crowdStatus.length === 0 ? (
            <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', gridColumn: '1/-1' }}>
              <Radio size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
              <p>No crowd data available.</p>
            </div>
          ) : crowdStatus.map((zone, i) => {
            const pct = Math.round(((zone.currentCount || 0) / (zone.capacity || 1)) * 100);
            const barColor = pct > 85 ? 'var(--status-critical)' : pct > 65 ? 'var(--status-warning)' : 'var(--status-success)';
            return (
              <div key={zone.zone || i} className="glass-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <strong style={{ fontSize: '1rem' }}>Zone {zone.zone?.replace('ZONE_', '')}</strong>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: barColor }}>{pct}%</span>
                </div>
                {/* Progress bar */}
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginBottom: '0.75rem', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, transition: 'width 0.4s ease', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {zone.currentCount?.toLocaleString()} / {zone.capacity?.toLocaleString()} present
                </div>
                {zone.stampedeRisk > 0.5 && (
                  <div style={{ marginTop: '0.75rem', padding: '0.4rem 0.75rem', background: 'rgba(208,0,0,0.1)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--status-critical)' }}>
                    ⚠️ Stampede risk: {(zone.stampedeRisk * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PoliceDash;
